import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { marcarInventarioRevisado, publicarTransparencia, volverATransparencia } from "@/lib/acciones/datos-personales"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

type Db = SupabaseClient<Database>

let coni: Db
let mantenedor: Db
const LARGO = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(" ")
const OTRO = `${LARGO} Y una línea más.`

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})
afterEach(async () => {
  await pool.query("delete from public.transparencia_versiones where not propuesta")
  await pool.query("delete from public.revisiones_de_inventario")
})
afterAll(() => pool.end())

async function vigentes() {
  const { rows } = await pool.query<{ version: number; texto: string }>(
    "select version, texto from public.transparencia_versiones where vigente",
  )
  return rows
}

async function revisiones(): Promise<number> {
  return (await pool.query("select 1 from public.revisiones_de_inventario")).rowCount ?? 0
}

describe("marcarInventarioRevisado", () => {
  it("writes down Coni's review and answers when it was", async () => {
    expect(await marcarInventarioRevisado(coni)).toEqual({ ok: true, revisadoEn: expect.any(String) })
    expect(await revisiones()).toBe(1)
  })

  it("does not let WAV mark it", async () => {
    expect(await marcarInventarioRevisado(mantenedor)).toEqual({ ok: false, error: ERROR_GENERICO })
    expect(await revisiones()).toBe(0)
  })
})

describe("publicarTransparencia", () => {
  it("publishes a new current version each time", async () => {
    expect(await publicarTransparencia(coni, { texto: LARGO, motivo: "Primera versión" })).toEqual({
      ok: true,
      version: 1,
    })
    expect(await publicarTransparencia(coni, { texto: OTRO, motivo: "Agrego una línea" })).toEqual({
      ok: true,
      version: 2,
    })
    expect(await vigentes()).toEqual([{ version: 2, texto: OTRO }])
  })

  it("says how long the text must be and publishes nothing", async () => {
    expect(await publicarTransparencia(coni, { texto: "Muy corto.", motivo: "Prueba" })).toEqual({
      ok: false,
      error: "El texto tiene que tener entre 300 y 6.000 caracteres.",
    })
    expect(await vigentes()).toEqual([])
  })

  it("says how long the text must be when it is over 6000 characters after trimming", async () => {
    expect(await publicarTransparencia(coni, { texto: `  ${"a".repeat(6001)}  `, motivo: "Prueba" })).toEqual({
      ok: false,
      error: "El texto tiene que tener entre 300 y 6.000 caracteres.",
    })
    expect(await vigentes()).toEqual([])
  })

  it("asks for the reason of the change", async () => {
    expect(await publicarTransparencia(coni, { texto: LARGO, motivo: "  " })).toEqual({
      ok: false,
      error: "Escribe en pocas palabras por qué lo cambias.",
    })
  })

  it("asks for a shorter reason when it is too long", async () => {
    expect(await publicarTransparencia(coni, { texto: LARGO, motivo: "a".repeat(301) })).toEqual({
      ok: false,
      error: "El motivo puede tener hasta 300 caracteres. Acórtalo un poco.",
    })
    expect(await vigentes()).toEqual([])
  })

  it("does not let WAV publish", async () => {
    expect(await publicarTransparencia(mantenedor, { texto: LARGO, motivo: "Prueba" })).toEqual({
      ok: false,
      error: ERROR_GENERICO,
    })
    expect(await vigentes()).toEqual([])
  })
})

describe("volverATransparencia", () => {
  it("publishes the text of an earlier version as a new one", async () => {
    await publicarTransparencia(coni, { texto: LARGO, motivo: "Primera versión" })
    await publicarTransparencia(coni, { texto: OTRO, motivo: "Agrego una línea" })

    expect(await volverATransparencia(coni, 1)).toEqual({ ok: true, version: 3 })
    expect(await vigentes()).toEqual([{ version: 3, texto: LARGO }])
  })

  it("says so when the version does not exist", async () => {
    expect(await volverATransparencia(coni, 99)).toEqual({
      ok: false,
      error: "Esa versión ya no existe. Vuelve a abrir la pantalla.",
    })
  })

  it("does not let WAV go back to a version", async () => {
    await publicarTransparencia(coni, { texto: LARGO, motivo: "Primera versión" })
    await publicarTransparencia(coni, { texto: OTRO, motivo: "Agrego una línea" })

    expect(await volverATransparencia(mantenedor, 1)).toEqual({ ok: false, error: ERROR_GENERICO })
    expect(await vigentes()).toEqual([{ version: 2, texto: OTRO }])
  })

  it("does not go back to WAV's draft, which was never published", async () => {
    expect(await volverATransparencia(coni, 0)).toEqual({
      ok: false,
      error: "Esa versión nunca estuvo publicada. Elige una del historial.",
    })
    expect(await vigentes()).toEqual([])
  })
})
