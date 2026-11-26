import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { type DepsAjustes, guardarAjuste } from "@/lib/acciones/ajustes"
import { GANCHO_INEXISTENTE, marcarFavorito } from "@/lib/acciones/ganchos"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const SOLO_CONI = "Esta app es solo para Coni."
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: Db
let wav: Db
let autora = ""
let material = ""
let idea = ""

const esFavorito = async (id: string) =>
  (await pool.query("select 1 from public.ganchos_favoritos where afirmacion_id = $1", [id])).rowCount === 1

const deps = (db: Db): DepsAjustes => ({
  db,
  ahora: () => new Date().toISOString(),
  avisos: () => notificadorEnMemoria(),
})

const preferidos = async () =>
  (await pool.query<{ t: string[] }>("select tipos_de_gancho_preferidos as t from public.ajustes")).rows[0]?.t

afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("update public.ajustes set tipos_de_gancho_preferidos = '{}'")
})

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  autora = await sembrarAutor(`Autora favoritos ${SUFIJO}`)
  material = await sembrarMaterial({ titulo: `Material favoritos ${SUFIJO}`, autorId: autora })
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, gancho)
     values ($1, $2, 0, '{"pagina":1}'::jsonb, 'Una idea', 'cita', 'dato', 'estudio', '¿Y si fuera al revés?')
     returning id`,
    [material, autora],
  )
  idea = rows[0]?.id ?? ""
  if (!idea) throw new Error("No se creó la idea")
})

afterAll(async () => {
  await borrarSembrado([material], [], [autora])
  await pool.end()
})

describe("marcarFavorito", () => {
  it("marks and unmarks, and marking twice is not an error", async () => {
    expect(await marcarFavorito({ db: coni }, { afirmacionId: idea, favorito: true })).toEqual({ ok: true })
    expect(await marcarFavorito({ db: coni }, { afirmacionId: idea, favorito: true })).toEqual({ ok: true })
    expect(await esFavorito(idea)).toBe(true)
    expect(await marcarFavorito({ db: coni }, { afirmacionId: idea, favorito: false })).toEqual({ ok: true })
    expect(await esFavorito(idea)).toBe(false)
  })

  it("refuses WAV's session", async () => {
    expect(await marcarFavorito({ db: wav }, { afirmacionId: idea, favorito: true })).toEqual({
      ok: false,
      error: SOLO_CONI,
    })
    expect(await esFavorito(idea)).toBe(false)
  })

  it("says the hook is gone when its claim no longer exists", async () => {
    expect(await marcarFavorito({ db: coni }, { afirmacionId: AUSENTE, favorito: true })).toEqual({
      ok: false,
      error: GANCHO_INEXISTENTE,
    })
  })
})

describe("guardarAjuste with Coni's hook types", () => {
  it("keeps only the vigente types, once each and in the list's order, and gives back the previous ones", async () => {
    expect(
      await guardarAjuste(deps(coni), { campo: "tipos_de_gancho", valor: ["mito", "inventado", "escena", "mito"] }),
    ).toMatchObject({ ok: true, anterior: { campo: "tipos_de_gancho", valor: [] } })
    expect(await preferidos()).toEqual(["escena", "mito"])
    expect(await guardarAjuste(deps(coni), { campo: "tipos_de_gancho", valor: [] })).toMatchObject({
      ok: true,
      anterior: { campo: "tipos_de_gancho", valor: ["escena", "mito"] },
    })
    expect(await preferidos()).toEqual([])
  })

  it("refuses a value that is not text, and WAV's session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await guardarAjuste(deps(coni), { campo: "tipos_de_gancho", valor: [3] })).toMatchObject({ ok: false })
    expect(await guardarAjuste(deps(wav), { campo: "tipos_de_gancho", valor: ["escena"] })).toMatchObject({ ok: false })
    expect(await preferidos()).toEqual([])
  })
})
