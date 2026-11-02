import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  contarPorEstado,
  leerMapaDelMaterial,
  leerMaterialConFicha,
  leerPanelDelMaterial,
  listarAutores,
  listarMateriales,
} from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import {
  borrarSembrado,
  sembrarAutor,
  sembrarFicha,
  sembrarIdeaConId,
  sembrarIdeas,
  sembrarMaterial,
  sembrarTema,
} from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const AUTORA = `Daniela Ruiz ${SUFIJO}`
const ULTIMA_IDEA = "ffffffff-ffff-4fff-bfff-ffffffffffff"

let coni: SupabaseClient<Database>
const materiales: string[] = []
const temas: string[] = []
const autores: string[] = []
let autor = ""
let empate = ""
let largo = ""
let vacio = ""
let estrategia = ""

beforeAll(async () => {
  coni = await clienteDeConi()
  autor = await sembrarAutor(AUTORA, "investigadora de confianza")
  autores.push(autor)
  const [carga, pausas, sueno, animo] = await Promise.all(
    ["Carga mental", "Pausas", "Sueño", "Ánimo"].map((nombre) => sembrarTema(`${nombre} ${SUFIJO}`)),
  )
  if (!carga || !pausas || !sueno || !animo) throw new Error("Faltan temas")
  temas.push(carga, pausas, sueno, animo)

  empate = await sembrarMaterial({ titulo: `Empate ${SUFIJO}`, autorId: autor })
  await sembrarIdeas(empate, autor, pausas, 2, { texto: "Primera" })
  await sembrarIdeas(empate, autor, carga, 2, { evidencia: "opinion" })
  await sembrarIdeas(empate, autor, sueno, 3, { excluida: true })
  await sembrarIdeas(empate, autor, null, 4)

  largo = await sembrarMaterial({ titulo: `Largo ${SUFIJO}`, autorId: autor })
  await sembrarIdeas(largo, autor, animo, 1000)
  await sembrarIdeaConId(ULTIMA_IDEA, largo, autor, carga)

  vacio = await sembrarMaterial({ titulo: `Vacío ${SUFIJO}`, autorId: autor, estado: "procesando" })
  estrategia = await sembrarMaterial({ titulo: `Plan ${SUFIJO}`, autorId: autor, rol: "estrategia" })
  await sembrarFicha(estrategia, ["Una", "Dos", "Tres", "Cuatro", "Cinco"])
  materiales.push(empate, largo, vacio, estrategia)
})

afterAll(async () => {
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})

describe("listarMateriales", () => {
  it("gives each material its main topic: most ideas, ties by name, excluded and topicless ideas left out", async () => {
    const lista = await listarMateriales(coni, { autor })
    expect(lista.find((m) => m.id === empate)?.tema).toEqual({ nombre: `Carga mental ${SUFIJO}`, otros: 1 })
    expect(lista.find((m) => m.id === vacio)?.tema).toBeNull()
  })

  it("reads every idea of the listed materials past the 1000 rows PostgREST answers at once", async () => {
    // The idea of the other topic sorts last by id: without paging it is never read and "+1" would be missing.
    const lista = await listarMateriales(coni, { autor })
    expect(lista.find((m) => m.id === largo)?.tema).toEqual({ nombre: `Ánimo ${SUFIJO}`, otros: 1 })
  })

  it("brings the author's name and the upload date, newest first", async () => {
    const lista = await listarMateriales(coni, { autor })
    expect(lista.map((m) => m.id)).toEqual([estrategia, vacio, largo, empate])
    expect(lista[0]).toMatchObject({ autor: AUTORA, autor_id: autor, rol: "estrategia", tipo: "documento" })
    expect(Number.isNaN(Date.parse(lista[0]?.creado_en ?? ""))).toBe(false)
  })

  it("filters by state, role and type", async () => {
    expect((await listarMateriales(coni, { autor, estado: "procesando" })).map((m) => m.id)).toEqual([vacio])
    expect((await listarMateriales(coni, { autor, rol: "estrategia" })).map((m) => m.id)).toEqual([estrategia])
    expect(await listarMateriales(coni, { autor, tipo: "video" })).toEqual([])
  })
})

describe("contarPorEstado", () => {
  it("counts the materials processing and with an error, as the quick filters say them", async () => {
    const { rows } = await pool.query<{ estado: string; n: number }>(
      "select estado, count(*)::int as n from public.materiales group by estado",
    )
    const cuenta = (estado: string) => rows.find((fila) => fila.estado === estado)?.n ?? 0
    const conteos = await contarPorEstado(coni)
    expect(conteos).toMatchObject({ procesando: cuenta("procesando"), fallido: cuenta("fallido") })
  })

  it("counts apart the materials really working: not paused, not waiting for her OK", async () => {
    const otra = await sembrarAutor(`Otra autora ${SUFIJO}`)
    autores.push(otra)
    const pausado = await sembrarMaterial({
      titulo: `Pausa ${SUFIJO}`,
      autorId: otra,
      estado: "procesando",
      motivo: "tope_mensual",
    })
    const esperando = await sembrarMaterial({
      titulo: `Espera ${SUFIJO}`,
      autorId: otra,
      estado: "procesando",
      costo: 1.2,
    })
    const confirmado = await sembrarMaterial({
      titulo: `Confirmado ${SUFIJO}`,
      autorId: otra,
      estado: "procesando",
      costo: 1.2,
    })
    await pool.query("update public.materiales set costo_confirmado_en = now() where id = $1", [confirmado])
    materiales.push(pausado, esperando, confirmado)

    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from public.materiales
        where estado = 'procesando' and motivo_fallo is null
          and (costo_estimado_usd is null or costo_confirmado_en is not null)`,
    )
    const conteos = await contarPorEstado(coni)
    expect(conteos.trabajando).toBe(rows[0]?.n)
    // vacio and confirmado work; pausado and esperando are counted under Procesando but do not work.
    expect(conteos.trabajando).toBeGreaterThanOrEqual(2)
    expect(conteos.procesando - conteos.trabajando).toBeGreaterThanOrEqual(2)
  })
})

describe("leerMaterialConFicha", () => {
  it("reads one material with its author's credential and its card", async () => {
    const leido = await leerMaterialConFicha(coni, estrategia)
    expect(leido?.material).toMatchObject({ id: estrategia, autor: AUTORA, credencial: "investigadora de confianza" })
    expect(leido?.ficha?.ideasClave).toEqual(["Una", "Dos", "Tres", "Cuatro", "Cinco"])
  })

  it("answers null for a material that does not exist", async () => {
    expect(await leerMaterialConFicha(coni, randomUUID())).toBeNull()
  })
})

describe("leerMapaDelMaterial", () => {
  it("counts only the ideas that were not excluded", async () => {
    const mapa = await leerMapaDelMaterial(coni, empate)
    expect(mapa.total).toBe(8)
    expect(mapa.sinTema).toBe(4)
    expect(mapa.temas.map((tema) => tema.afirmaciones)).toEqual([2, 2])
    expect(mapa.evidencia).toEqual({ estudio: 6, opinion: 2 })
  })
})

describe("leerPanelDelMaterial", () => {
  it("brings the count and the first two ideas in the order they were taken", async () => {
    const panel = await leerPanelDelMaterial(coni, empate)
    expect(panel?.ideas).toEqual({ total: 8, primeras: ["Primera 1", "Primera 2"] })
    expect(panel?.evidencia).toEqual({ estudio: 6, opinion: 2 })
  })

  it("uses the card's key ideas for a strategy material (D9)", async () => {
    const panel = await leerPanelDelMaterial(coni, estrategia)
    expect(panel?.ideas).toEqual({ total: 5, primeras: ["Una", "Dos"] })
  })

  it("answers null for a material that does not exist", async () => {
    expect(await leerPanelDelMaterial(coni, randomUUID())).toBeNull()
  })
})

describe("listarAutores", () => {
  it("lists the authors alphabetically with their credential and aliases", async () => {
    const lista = await listarAutores(coni)
    expect(lista.find((a) => a.id === autor)).toEqual({
      id: autor,
      nombre: AUTORA,
      credencial: "investigadora de confianza",
      tipo: "persona",
      alias: [],
    })
    const nombres = lista.map((a) => a.nombre)
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, "es")))
  })

  it("lists every author past the 1000 rows PostgREST answers at once", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.autores (nombre, tipo)
       select 'Muchos ' || $1 || ' ' || n, 'persona' from generate_series(1, 1001) as n returning id`,
      [SUFIJO],
    )
    autores.push(...rows.map((fila) => fila.id))
    const lista = await listarAutores(coni)
    expect(lista.filter((a) => a.nombre.startsWith(`Muchos ${SUFIJO} `))).toHaveLength(1001)
    expect(new Set(lista.map((a) => a.id)).size).toBe(lista.length)
  })
})
