import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { claveGrabar, claveProducir, claveVoz } from "@/lib/acciones/disparos"
import { dispararProcesarMaterial, disparosDeEntorno } from "@/lib/acciones/disparos-entorno"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

const HASH = "a".repeat(64)
const PIEZA = { id: "p1", version: 3, intento: 1, puerta1_hash: HASH }

describe("claveProducir", () => {
  it("is the same for the same round and changes when the piece moved or the round changed", () => {
    expect(claveProducir(PIEZA)).toBe(claveProducir({ ...PIEZA }))
    expect(claveProducir({ ...PIEZA, version: 4 })).not.toBe(claveProducir(PIEZA))
    expect(claveProducir({ ...PIEZA, intento: 2 })).not.toBe(claveProducir(PIEZA))
  })
})

describe("claveGrabar", () => {
  it("binds the approved script and the attempt", () => {
    expect(claveGrabar(PIEZA)).toBe(`p1:grabar:${HASH.slice(0, 16)}:1`)
    expect(claveGrabar({ ...PIEZA, intento: 2 })).not.toBe(claveGrabar(PIEZA))
  })

  it("refuses to record a piece whose script was never approved", () => {
    expect(() => claveGrabar({ ...PIEZA, puerta1_hash: null })).toThrow(/sin guion aprobado/)
  })
})

describe("disparosDeEntorno", () => {
  it("records the runs in a file instead of starting them when DISPARO_DE_PRUEBA is on", async () => {
    const archivo = join(mkdtempSync(join(tmpdir(), "disparos-")), "registro.jsonl")
    const disparos = disparosDeEntorno({ DISPARO_DE_PRUEBA: "1", DISPARO_DE_PRUEBA_ARCHIVO: archivo })

    await disparos.producir("p1", "clave-1")
    await disparos.grabar("p2", "clave-2")

    const lineas = readFileSync(archivo, "utf-8").trim().split("\n")
    expect(lineas.map((linea) => JSON.parse(linea))).toEqual([
      { tarea: "producir", piezaId: "p1", clave: "clave-1" },
      { tarea: "grabar", piezaId: "p2", clave: "clave-2" },
    ])
  })

  it("never records instead of starting when it runs on Vercel", () => {
    expect(() => disparosDeEntorno({ DISPARO_DE_PRUEBA: "1", VERCEL: "1" })).toThrow(FallaDeConfiguracion)
  })

  it("asks for the Trigger.dev key before starting anything for real", () => {
    expect(() => disparosDeEntorno({})).toThrow(FallaDeConfiguracion)
  })
})

describe("dispararProcesarMaterial", () => {
  const ID = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"

  it("records the run in a file instead of starting it when DISPARO_DE_PRUEBA is on", async () => {
    const archivo = join(mkdtempSync(join(tmpdir(), "disparos-")), "registro.jsonl")

    await dispararProcesarMaterial(ID, { DISPARO_DE_PRUEBA: "1", DISPARO_DE_PRUEBA_ARCHIVO: archivo })

    const lineas = readFileSync(archivo, "utf-8").trim().split("\n")
    expect(lineas.map((linea) => JSON.parse(linea))).toEqual([{ tarea: "procesar-material", materialId: ID }])
  })

  it("never records instead of starting when it runs on Vercel", async () => {
    await expect(dispararProcesarMaterial(ID, { DISPARO_DE_PRUEBA: "1", VERCEL: "1" })).rejects.toThrow(
      FallaDeConfiguracion,
    )
  })

  it("asks for the Trigger.dev key before starting anything for real", async () => {
    await expect(dispararProcesarMaterial(ID, {})).rejects.toThrow(FallaDeConfiguracion)
  })
})

describe("claveVoz", () => {
  const fila = { id: "p", version: 3, intento: 2, puerta1_hash: "e".repeat(64) }

  it("is one key per approval and attempt", () => {
    expect(claveVoz(fila)).toBe(`p:voz:${"e".repeat(16)}:2`)
    expect(claveVoz({ ...fila, intento: 3 })).not.toBe(claveVoz(fila))
  })

  it("refuses a piece without gate 1", () => {
    expect(() => claveVoz({ ...fila, puerta1_hash: null })).toThrow()
  })
})
