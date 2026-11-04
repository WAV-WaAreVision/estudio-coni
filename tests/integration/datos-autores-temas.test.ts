import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { leerAutor, resumirAutores } from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarIdeas, sembrarMaterial, sembrarTema } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: SupabaseClient<Database>
let autora = ""
let otra = ""
let vacia = ""
let coniAutora = ""
let carga = ""
let pausas = ""
let solo = ""
let viejo = ""
let pilar = ""
const materiales: string[] = []
const temas: string[] = []
const autores: string[] = []

beforeAll(async () => {
  coni = await clienteDeConi()
  autora = await sembrarAutor(`Daniela ${SUFIJO}`, "investigadora")
  otra = await sembrarAutor(`Otra ${SUFIJO}`)
  vacia = await sembrarAutor(`Vacía ${SUFIJO}`)
  autores.push(autora, otra, vacia)
  const { rows: delaConi } = await pool.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
  coniAutora = delaConi[0]?.id ?? ""
  const { rows: pilares } = await pool.query<{ id: string }>(
    "select id from public.categorias where es_pilar and activa order by orden limit 1",
  )
  pilar = pilares[0]?.id ?? ""
  if (!coniAutora || !pilar) throw new Error("Falta la autora Coni o un pilar activo")

  carga = await sembrarTema(`Carga ${SUFIJO}`)
  pausas = await sembrarTema(`Pausas ${SUFIJO}`)
  solo = await sembrarTema(`Solo ${SUFIJO}`)
  viejo = await sembrarTema(`Viejo ${SUFIJO}`)
  temas.push(carga, pausas, solo, viejo)
  await pool.query("update public.temas set categoria_id = $1 where id = $2", [pilar, carga])
  await pool.query("update public.temas set fusionado_en = $1 where id = $2", [carga, viejo])

  const deLaAutora = await sembrarMaterial({ titulo: `De Daniela ${SUFIJO}`, autorId: autora })
  await sembrarIdeas(deLaAutora, autora, carga, 2, { texto: "Carga" })
  await sembrarIdeas(deLaAutora, autora, pausas, 1, { texto: "Pausa", evidencia: "opinion" })
  await sembrarIdeas(deLaAutora, autora, null, 1, { texto: "Oculta", excluida: true })
  const deConi = await sembrarMaterial({ titulo: `De Coni ${SUFIJO}`, autorId: coniAutora, rol: "voz_propia" })
  await sembrarIdeas(deConi, coniAutora, carga, 1, { texto: "De Coni" })
  const deOtra = await sembrarMaterial({ titulo: `De Otra ${SUFIJO}`, autorId: otra })
  await sembrarIdeas(deOtra, otra, solo, 2, { texto: "Sola" })
  materiales.push(deLaAutora, deConi, deOtra)
})

afterAll(async () => {
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})

describe("resumirAutores", () => {
  it("counts materials and visible ideas, gives the top topics, and orders by most ideas", async () => {
    const nuestros = (await resumirAutores(coni)).filter((a) => autores.includes(a.id))
    expect(nuestros.map((a) => a.id)).toEqual([autora, otra, vacia])
    expect(nuestros[0]).toMatchObject({
      materiales: 1,
      ideas: 3,
      temas: [
        { id: carga, nombre: `Carga ${SUFIJO}`, ideas: 2 },
        { id: pausas, nombre: `Pausas ${SUFIJO}`, ideas: 1 },
      ],
      credencial: "investigadora",
    })
    expect(nuestros[2]).toMatchObject({ materiales: 0, ideas: 0, temas: [] })
  })
})

describe("leerAutor", () => {
  it("groups the visible ideas by topic, oldest first, and keeps the hidden ones apart", async () => {
    const leido = await leerAutor(coni, autora)
    expect(leido?.autor).toMatchObject({ id: autora, nombre: `Daniela ${SUFIJO}`, tipo: "persona" })
    expect(leido?.materiales).toBe(1)
    expect(leido?.ideas).toBe(3)
    expect(leido?.grupos.map((g) => g.tema?.id ?? null)).toEqual([carga, pausas])
    expect(leido?.grupos[0]?.ideas.map((i) => i.texto)).toEqual(["Carga 1", "Carga 2"])
    expect(leido?.grupos[1]?.ideas[0]).toMatchObject({ texto: "Pausa 1", tipo: "dato", evidencia: "opinion" })
    expect(leido?.ocultas.map((i) => i.texto)).toEqual(["Oculta 1"])
  })

  it("is null for an author that does not exist", async () => {
    expect(await leerAutor(coni, AUSENTE)).toBeNull()
  })
})
