import { afterAll, describe, expect, it } from "vitest"
import { como, comoConi, comoMantenedor, comoOtra, comoPostgres, pool } from "./db"

afterAll(() => pool.end())

interface FilaDePilar {
  slug: string
  nombre: string
  nombre_corto: string | null
  descripcion: string | null
  es_pilar: boolean
  activa: boolean
  orden: number | null
}

const NUEVOS = [
  ["ia-salud-mental", "IA y salud mental", "IA y salud mental", 1],
  ["practica-clinica", "Práctica clínica aumentada", "Práctica clínica", 2],
  ["etica-regulacion", "Ética y regulación", "Ética", 3],
  ["acceso-salud-publica", "Acceso y salud pública", "Acceso", 4],
  ["caso-coni", "Caso Coni: humana + avatar", "Caso Coni", 5],
] as const

const VIEJOS = ["pareja", "deseo", "autoestima", "limites", "bienestar"] as const

async function pilares(): Promise<FilaDePilar[]> {
  return como(comoPostgres, async (c) => {
    const { rows } = await c.query<FilaDePilar>(
      "select slug, nombre, nombre_corto, descripcion, es_pilar, activa, orden from public.categorias order by orden nulls last, slug",
    )
    return rows
  })
}

describe("categorias como pilares", () => {
  it("adds the five LinkedIn pillars, active and in the PDF's order", async () => {
    const filas = await pilares()
    const activos = filas.filter((f) => f.es_pilar && f.activa)
    expect(activos.map((f) => [f.slug, f.nombre, f.nombre_corto, f.orden])).toEqual(NUEVOS.map((n) => [...n]))
    for (const pilar of activos) expect(pilar.descripcion?.length ?? 0).toBeGreaterThan(20)
  })

  it("keeps the five old pillars as inactive pillar rows, after the new ones", async () => {
    const filas = await pilares()
    const viejos = filas.filter((f) => VIEJOS.some((slug) => slug === f.slug))
    expect(viejos).toHaveLength(5)
    for (const viejo of viejos) {
      expect(viejo).toMatchObject({ es_pilar: true, activa: false })
      expect(viejo.orden).toBeGreaterThan(5)
      expect(viejo.nombre_corto).not.toBeNull()
    }
  })

  it("leaves general as a plain active category", async () => {
    const general = (await pilares()).find((f) => f.slug === "general")
    expect(general).toMatchObject({ es_pilar: false, activa: true, orden: null })
  })

  it("refuses a pillar without its order or short name", async () => {
    await como(comoPostgres, async (c) => {
      await expect(
        c.query("insert into public.categorias (slug, nombre, es_pilar) values ('x-pilar', 'X pilar', true)"),
      ).rejects.toMatchObject({ code: "23514" })
    })
  })

  it("is readable by Coni and WAV and by nobody else", async () => {
    const leer = (sesion: typeof comoConi) =>
      como(
        sesion,
        async (c) => (await c.query("select slug from public.categorias where es_pilar and activa")).rowCount,
      )
    expect(await leer(comoConi)).toBe(5)
    expect(await leer(comoMantenedor)).toBe(5)
    expect(await leer(comoOtra)).toBe(0)
  })
})
