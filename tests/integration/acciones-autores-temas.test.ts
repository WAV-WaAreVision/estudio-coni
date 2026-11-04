import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { unirAutores } from "@/lib/acciones/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarIdeas, sembrarMaterial, sembrarTema } from "./siembra-biblioteca"

type Db = SupabaseClient<Database>

const SUFIJO = randomUUID().slice(0, 8)
const SOLO_CONI = "Esta app es solo para Coni."
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: Db
let wav: Db
let coniAutora = ""
const materiales: string[] = []
const temas: string[] = []
const autores: string[] = []

async function autor(nombre: string): Promise<string> {
  const id = await sembrarAutor(`${nombre} ${SUFIJO}`)
  autores.push(id)
  return id
}

async function material(autorId: string): Promise<string> {
  const id = await sembrarMaterial({ titulo: `Acción ${SUFIJO}`, autorId })
  materiales.push(id)
  return id
}

const existe = async (id: string) =>
  (await pool.query("select 1 from public.autores where id = $1", [id])).rowCount === 1

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  const { rows } = await pool.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
  coniAutora = rows[0]?.id ?? ""
  if (!coniAutora) throw new Error("Falta la autora Coni")
})

afterAll(async () => {
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})

describe("unirAutores", () => {
  it("as Coni moves the materials and ideas to the one that stays, keeps the name as alias, and drops the other", async () => {
    const [origen, destino] = [await autor("D. Ruiz"), await autor("Daniela Ruiz")]
    const delOrigen = await material(origen)
    const tema = await sembrarTema(`Unir ${SUFIJO}`)
    temas.push(tema)
    await sembrarIdeas(delOrigen, origen, tema, 2)

    expect(await unirAutores({ db: coni }, { origen, destino })).toEqual({ ok: true })

    expect(await existe(origen)).toBe(false)
    const { rows: deMaterial } = await pool.query("select autor_id from public.materiales where id = $1", [delOrigen])
    expect(deMaterial[0]?.autor_id).toBe(destino)
    const { rows: ideas } = await pool.query("select count(*)::int as n from public.afirmaciones where autor_id = $1", [
      destino,
    ])
    expect(ideas[0]?.n).toBe(2)
    const { rows: alias } = await pool.query("select alias from public.autores where id = $1", [destino])
    expect(alias[0]?.alias).toContain(`D. Ruiz ${SUFIJO}`)
  })

  it("refuses Coni's own card as the one that disappears, before the database is asked", async () => {
    const destino = await autor("Destino")
    expect(await unirAutores({ db: coni }, { origen: coniAutora, destino })).toEqual({
      ok: false,
      error: "Tu propia ficha no se puede unir a otro autor.",
    })
    expect(await existe(coniAutora)).toBe(true)
  })

  it("lets Coni be the one that stays", async () => {
    const origen = await autor("Coni de nuevo")
    expect(await unirAutores({ db: coni }, { origen, destino: coniAutora })).toEqual({ ok: true })
    expect(await existe(origen)).toBe(false)
    // Coni's row is the seed's, shared by every test: the alias the join added must not stay behind.
    await pool.query("update public.autores set alias = array_remove(alias, $1) where id = $2", [
      `Coni de nuevo ${SUFIJO}`,
      coniAutora,
    ])
  })

  it("refuses the same author twice and a missing one, in plain words", async () => {
    const uno = await autor("Uno")
    expect(await unirAutores({ db: coni }, { origen: uno, destino: uno })).toEqual({
      ok: false,
      error: "Elige otro autor para unirlos.",
    })
    expect(await unirAutores({ db: coni }, { origen: AUSENTE, destino: uno })).toEqual({
      ok: false,
      error: "Ese autor ya no existe.",
    })
    expect(await unirAutores({ db: coni }, { origen: uno, destino: AUSENTE })).toEqual({
      ok: false,
      error: "Ese autor ya no existe.",
    })
    expect(await existe(uno)).toBe(true)
  })

  it("refuses WAV, although the database would let it", async () => {
    const [origen, destino] = [await autor("Origen WAV"), await autor("Destino WAV")]
    expect(await unirAutores({ db: wav }, { origen, destino })).toEqual({ ok: false, error: SOLO_CONI })
    expect(await existe(origen)).toBe(true)
  })
})
