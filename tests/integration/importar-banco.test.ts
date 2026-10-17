import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { parsearBanco } from "@/lib/ideas/banco"
import { importarIdeas } from "@/lib/ideas/importar"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const ARCHIVO = readFileSync(join(__dirname, "../fixtures/banco-muestra.md"), "utf-8")
/** The sample bank still has the old sexology headings: its ideas belong to retired pillars. */
const VIEJA = parsearBanco(ARCHIVO, PILARES_DE_PRUEBA)
/** The same bank written under the LinkedIn pillars. */
const MUESTRA = parsearBanco(
  ARCHIVO.replace("## Pareja y conversación", "## IA y salud mental").replace(
    "## Deseo y sexualidad",
    "## Práctica clínica aumentada",
  ),
  PILARES_DE_PRUEBA,
)
const NUMEROS = MUESTRA.map((idea) => idea.numero)

afterEach(async () => {
  await pool.query("delete from public.ideas where numero = any($1::int[])", [NUMEROS])
})

async function filas() {
  const { rows } = await pool.query(
    "select numero, pilar, gancho, fuerza, alertas, fuentes, estado, origen from public.ideas where numero = any($1::int[]) order by numero",
    [NUMEROS],
  )
  return rows
}

describe("importarIdeas", () => {
  it("writes every idea of the bank with its pillar, alerts split by type and sources", async () => {
    const resultado = await importarIdeas(clienteDeServicio(), MUESTRA)

    expect(resultado).toEqual({ leidas: 3 })
    const guardadas = await filas()
    expect(guardadas.map((f) => [f.numero, f.pilar, f.fuerza, f.estado])).toEqual([
      [901, "ia-salud-mental", "alta", "idea"],
      [902, "ia-salud-mental", "media", "idea"],
      [903, "practica-clinica", "baja", "usada"],
    ])
    expect(guardadas.map((f) => f.origen)).toEqual(["importada", "importada", "importada"])
    expect(guardadas[1]?.alertas).toEqual(MUESTRA[1]?.alertas)
    expect(guardadas[1]?.fuentes).toEqual(["cuenta_uno 2023-01-02", "cuenta_dos 2024-02-03"])
  })

  it("refuses a bank of retired pillars, naming its ideas, and writes none of them", async () => {
    await expect(importarIdeas(clienteDeServicio(), VIEJA)).rejects.toThrow(
      /No pude guardar las ideas 901, 902: pilar_inactivo/,
    )
    expect(await filas()).toEqual([])
  })

  it("is repeatable: a second run changes nothing and creates no duplicate", async () => {
    const db = clienteDeServicio()
    await importarIdeas(db, MUESTRA)
    const antes = await filas()

    await importarIdeas(db, MUESTRA)

    expect(await filas()).toEqual(antes)
  })

  it("updates what the file corrects but keeps the state the app gave an idea", async () => {
    const db = clienteDeServicio()
    await importarIdeas(db, MUESTRA)
    await pool.query("update public.ideas set estado = 'descartada' where numero = 901")
    await pool.query("update public.ideas set estado = 'usada' where numero = 902")

    const corregida = MUESTRA.map((idea) => (idea.numero === 901 ? { ...idea, gancho: "Gancho corregido." } : idea))
    await importarIdeas(db, corregida)

    const guardadas = await filas()
    expect(guardadas[0]).toMatchObject({ gancho: "Gancho corregido.", estado: "descartada" })
    expect(guardadas[1]).toMatchObject({ estado: "usada" })
  })

  it("does not put back into the bank an idea that was used, even if the file still says idea", async () => {
    const db = clienteDeServicio()
    await importarIdeas(db, MUESTRA)
    await pool.query("update public.ideas set estado = 'usada' where numero = 901")

    await importarIdeas(db, MUESTRA)

    expect((await filas())[0]?.estado).toBe("usada")
  })
})
