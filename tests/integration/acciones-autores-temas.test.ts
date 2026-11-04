import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ocultarIdea, unirAutores } from "@/lib/acciones/biblioteca"
import { destinoDeTema, leerAutor, leerTema } from "@/lib/datos/biblioteca"
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

async function ideasDe(materialId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    "select id from public.afirmaciones where material_id = $1 order by creada_en, id",
    [materialId],
  )
  return rows.map((fila) => fila.id)
}

describe("ocultarIdea", () => {
  it("takes an idea out of its topic, and its author shows it under the hidden ones", async () => {
    const autora = await autor("Oculta")
    const delaAutora = await material(autora)
    const tema = await sembrarTema(`Ocultar ${SUFIJO}`)
    temas.push(tema)
    await sembrarIdeas(delaAutora, autora, tema, 2)
    const [primera] = await ideasDe(delaAutora)
    if (!primera) throw new Error("Faltan ideas")

    expect(await ocultarIdea({ db: coni }, { id: primera, oculta: true })).toEqual({ ok: true })

    const leido = await leerTema(coni, tema)
    expect(leido?.ideas).toBe(1)
    expect(leido?.autores[0]?.ideas.map((i) => i.id)).not.toContain(primera)
    expect((await leerAutor(coni, autora))?.ocultas.map((i) => i.id)).toEqual([primera])
  })

  it("Mostrar brings it back without a topic, under «Sin tema todavía» (D6)", async () => {
    const autora = await autor("Mostrar")
    const delaAutora = await material(autora)
    const tema = await sembrarTema(`Mostrar ${SUFIJO}`)
    temas.push(tema)
    await sembrarIdeas(delaAutora, autora, tema, 2)
    const [primera] = await ideasDe(delaAutora)
    if (!primera) throw new Error("Faltan ideas")
    await ocultarIdea({ db: coni }, { id: primera, oculta: true })

    expect(await ocultarIdea({ db: coni }, { id: primera, oculta: false })).toEqual({ ok: true })

    const leido = await leerAutor(coni, autora)
    expect(leido?.ocultas).toEqual([])
    expect(leido?.grupos.find((g) => g.tema === null)?.ideas.map((i) => i.id)).toEqual([primera])
  })

  it("hiding the last idea of a topic deletes the topic (deviation 1)", async () => {
    const autora = await autor("Última")
    const delaAutora = await material(autora)
    const tema = await sembrarTema(`Última ${SUFIJO}`)
    temas.push(tema)
    await sembrarIdeas(delaAutora, autora, tema, 1)
    const [unica] = await ideasDe(delaAutora)
    if (!unica) throw new Error("Falta la idea")

    expect(await ocultarIdea({ db: coni }, { id: unica, oculta: true })).toEqual({ ok: true })
    expect(await destinoDeTema(coni, tema)).toBeNull()
  })

  it("says an idea that is gone in plain words", async () => {
    expect(await ocultarIdea({ db: coni }, { id: AUSENTE, oculta: true })).toEqual({
      ok: false,
      error: "Esa idea ya no existe.",
    })
  })

  it("refuses WAV, although the database would let it", async () => {
    const autora = await autor("Idea WAV")
    const delaAutora = await material(autora)
    await sembrarIdeas(delaAutora, autora, null, 1)
    const [idea] = await ideasDe(delaAutora)
    if (!idea) throw new Error("Falta la idea")
    expect(await ocultarIdea({ db: wav }, { id: idea, oculta: true })).toEqual({ ok: false, error: SOLO_CONI })
    const { rows } = await pool.query("select excluida from public.afirmaciones where id = $1", [idea])
    expect(rows[0]?.excluida).toBe(false)
  })
})
