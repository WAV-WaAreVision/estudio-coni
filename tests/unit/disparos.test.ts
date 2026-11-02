import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  claveArmar,
  claveGrabar,
  claveMotor,
  claveProcesarMaterial,
  claveProducir,
  claveVoz,
} from "@/lib/acciones/disparos"
import { disparosDeBibliotecaDeEntorno, disparosDeEntorno } from "@/lib/acciones/disparos-entorno"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { hashTexto } from "@/lib/dominio/puertas"

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
    await disparos.grabar("p2", "clave-2", 3)

    const lineas = readFileSync(archivo, "utf-8").trim().split("\n")
    expect(lineas.map((linea) => JSON.parse(linea))).toEqual([
      { tarea: "producir", piezaId: "p1", clave: "clave-1" },
      { tarea: "grabar", piezaId: "p2", clave: "clave-2", intento: 3 },
    ])
  })

  it("never records instead of starting when it runs on Vercel", () => {
    expect(() => disparosDeEntorno({ DISPARO_DE_PRUEBA: "1", VERCEL: "1" })).toThrow(FallaDeConfiguracion)
  })

  it("asks for the Trigger.dev key before starting anything for real, in words that fit every port", () => {
    expect(() => disparosDeEntorno({})).toThrow(FallaDeConfiguracion)
    expect(() => disparosDeEntorno({})).toThrow(
      "Falta TRIGGER_SECRET_KEY: la app no puede iniciar tareas en segundo plano.",
    )
  })
})

describe("claveProcesarMaterial", () => {
  const ID = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"

  it("is one key per material, and one per attempt when an attempt is given", () => {
    expect(claveProcesarMaterial(ID)).toBe(`procesar-material:${ID}`)
    expect(claveProcesarMaterial(ID, "intento-1")).toBe(`procesar-material:${ID}:intento-1`)
  })

  it("gives two attempts two keys, so a retry within ten minutes never reuses the run that failed", () => {
    expect(claveProcesarMaterial(ID, "intento-1")).not.toBe(claveProcesarMaterial(ID, "intento-2"))
    expect(claveProcesarMaterial(ID, "intento-1")).not.toBe(claveProcesarMaterial(ID))
  })
})

describe("claveMotor", () => {
  it("is one key per week", () => {
    expect(claveMotor("2026-11-02")).toBe("motor:2026-11-02")
    expect(claveMotor("2026-11-09")).not.toBe(claveMotor("2026-11-02"))
  })
})

describe("disparosDeBibliotecaDeEntorno", () => {
  const ID = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"

  it("records each attempt with its own key instead of starting it when DISPARO_DE_PRUEBA is on", async () => {
    const archivo = join(mkdtempSync(join(tmpdir(), "disparos-")), "registro.jsonl")
    const disparos = disparosDeBibliotecaDeEntorno({ DISPARO_DE_PRUEBA: "1", DISPARO_DE_PRUEBA_ARCHIVO: archivo })

    await disparos.material(ID, "intento-1")
    await disparos.material(ID, "intento-2")
    await disparos.motor("2026-11-02")

    const lineas = readFileSync(archivo, "utf-8").trim().split("\n")
    expect(lineas.map((linea) => JSON.parse(linea))).toEqual([
      { tarea: "procesar-material", materialId: ID, clave: `procesar-material:${ID}:intento-1` },
      { tarea: "procesar-material", materialId: ID, clave: `procesar-material:${ID}:intento-2` },
      { tarea: "motor-manual", semana: "2026-11-02", clave: "motor:2026-11-02" },
    ])
  })

  it("never records instead of starting when it runs on Vercel", () => {
    expect(() => disparosDeBibliotecaDeEntorno({ DISPARO_DE_PRUEBA: "1", VERCEL: "1" })).toThrow(FallaDeConfiguracion)
  })

  it("asks for the Trigger.dev key before starting anything for real, in words that fit every port", () => {
    expect(() => disparosDeBibliotecaDeEntorno({})).toThrow(FallaDeConfiguracion)
    expect(() => disparosDeBibliotecaDeEntorno({})).toThrow(
      "Falta TRIGGER_SECRET_KEY: la app no puede iniciar tareas en segundo plano.",
    )
  })
})

describe("claveVoz", () => {
  const fila = { id: "p", version: 3, intento: 2, puerta1_hash: null }

  it("is one key per piece and attempt, before any approval", () => {
    expect(claveVoz(fila)).toBe(`p:voz:${hashTexto("voz").slice(0, 16)}:2`)
    expect(claveVoz({ ...fila, intento: 3 })).not.toBe(claveVoz(fila))
  })

  it("does not change with gate 1: the voice is made before it", () => {
    expect(claveVoz({ ...fila, puerta1_hash: "e".repeat(64) })).toBe(claveVoz(fila))
  })
})

describe("claveArmar", () => {
  it("is one key per piece, version and attempt", () => {
    const a = claveArmar("p", "11111111-1111-4111-8111-111111111111", 0)
    expect(a).toMatch(/^p:armar:[0-9a-f]{16}:0$/)
    expect(claveArmar("p", "11111111-1111-4111-8111-111111111111", 1)).not.toBe(a)
    expect(claveArmar("p", "22222222-2222-4222-8222-222222222222", 0)).not.toBe(a)
  })
})
