import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  destinoDeTema,
  leerAutor,
  leerTema,
  listarPilaresDeTemas,
  listarTemas,
  resumirAutores,
} from "@/lib/datos/biblioteca"
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

describe("listarTemas", () => {
  it("counts visible ideas and distinct authors, says who covered it, orders by most authors, leaves merged out", async () => {
    const nuestros = (await listarTemas(coni, {})).filter((t) => temas.includes(t.id))
    expect(nuestros.map((t) => t.id)).toEqual([carga, solo, pausas])
    expect(nuestros[0]).toEqual({
      id: carga,
      nombre: `Carga ${SUFIJO}`,
      descripcion: null,
      pilarId: pilar,
      ideas: 3,
      autores: 2,
      cubiertoPorConi: true,
    })
    expect(nuestros[1]).toMatchObject({ ideas: 2, autores: 1, cubiertoPorConi: false })
  })

  it("narrows to one pillar", async () => {
    const nuestros = (await listarTemas(coni, { pilar })).filter((t) => temas.includes(t.id))
    expect(nuestros.map((t) => t.id)).toEqual([carga])
  })
})

describe("listarPilaresDeTemas", () => {
  it("gives the active pillars with their id, in their order", async () => {
    const pilares = await listarPilaresDeTemas(coni)
    expect(pilares[0]?.id).toBe(pilar)
    const { rows } = await pool.query<{ id: string }>(
      "select id from public.categorias where not (es_pilar and activa)",
    )
    expect(pilares.some((p) => rows.some((fila) => fila.id === p.id))).toBe(false)
  })
})

describe("leerTema", () => {
  it("groups the visible ideas by author, most ideas first, with the credential", async () => {
    const leido = await leerTema(coni, carga)
    expect(leido?.tema).toEqual({ id: carga, nombre: `Carga ${SUFIJO}`, descripcion: null })
    expect(leido?.ideas).toBe(3)
    expect(leido?.autores.map((g) => g.autor.id)).toEqual([autora, coniAutora])
    expect(leido?.autores[0]?.autor.credencial).toBe("investigadora")
    expect(leido?.autores[0]?.ideas.map((i) => i.texto)).toEqual(["Carga 1", "Carga 2"])
  })

  it("is null for a merged or missing topic", async () => {
    expect(await leerTema(coni, viejo)).toBeNull()
    expect(await leerTema(coni, AUSENTE)).toBeNull()
  })
})

describe("destinoDeTema", () => {
  it("follows a merged topic to the one that stayed, and is null for a missing one", async () => {
    expect(await destinoDeTema(coni, viejo)).toBe(carga)
    expect(await destinoDeTema(coni, carga)).toBe(carga)
    expect(await destinoDeTema(coni, AUSENTE)).toBeNull()
  })

  it("is null for a loop", async () => {
    const [uno, dos] = [await sembrarTema(`Bucle 1 ${SUFIJO}`), await sembrarTema(`Bucle 2 ${SUFIJO}`)]
    temas.push(uno, dos)
    await pool.query("update public.temas set fusionado_en = $1 where id = $2", [dos, uno])
    await pool.query("update public.temas set fusionado_en = $1 where id = $2", [uno, dos])
    expect(await destinoDeTema(coni, uno)).toBeNull()
  })
})
