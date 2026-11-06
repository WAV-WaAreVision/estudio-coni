import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  contarPorEstado,
  leerAutor,
  leerMapaDelMaterial,
  leerMaterialConFicha,
  leerNombreDeLoBorrado,
  leerPanelDelMaterial,
  leerTema,
  listarAutores,
  listarMateriales,
  listarTemas,
  resumirAutores,
} from "@/lib/datos/biblioteca"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarIdeas, sembrarMaterial, sembrarTema } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)

let coni: SupabaseClient<Database>
let autora = ""
let marcada = ""
let vivo = ""
let marcado = ""
let tema = ""
const materiales: string[] = []
const temas: string[] = []
const autores: string[] = []

const marcar = (tabla: "materiales" | "autores", id: string) =>
  pool.query(`update public.${tabla} set borrar_desde = now() where id = $1`, [id])
const desmarcar = (tabla: "materiales" | "autores", id: string) =>
  pool.query(`update public.${tabla} set borrar_desde = null where id = $1`, [id])

beforeAll(async () => {
  coni = await clienteDeConi()
  autora = await sembrarAutor(`Autora borrable ${SUFIJO}`)
  marcada = await sembrarAutor(`Autora marcada ${SUFIJO}`)
  autores.push(autora, marcada)
  tema = await sembrarTema(`Tema borrable ${SUFIJO}`)
  temas.push(tema)
  vivo = await sembrarMaterial({ titulo: `Vivo ${SUFIJO}`, autorId: autora })
  marcado = await sembrarMaterial({ titulo: `Marcado ${SUFIJO}`, autorId: autora, estado: "procesando" })
  materiales.push(vivo, marcado)
  await sembrarIdeas(vivo, autora, tema, 1)
  await sembrarIdeas(marcado, autora, tema, 2)
  await sembrarIdeas(marcado, autora, tema, 1, { excluida: true })
})

afterAll(async () => {
  await borrarSembrado(materiales, temas, autores)
  await pool.end()
})

describe("the material readers", () => {
  it("leave a marked material out of the list and of the quick filters' counts", async () => {
    const antes = await contarPorEstado(coni)
    await marcar("materiales", marcado)
    try {
      const ids = (await listarMateriales(coni, {})).map((material) => material.id)
      expect(ids).toContain(vivo)
      expect(ids).not.toContain(marcado)
      const despues = await contarPorEstado(coni)
      expect(despues.procesando).toBe(antes.procesando - 1)
      expect(despues.trabajando).toBe(antes.trabajando - 1)
    } finally {
      await desmarcar("materiales", marcado)
    }
  })

  it("answer not found for a marked material's detail, panel and map", async () => {
    await marcar("materiales", marcado)
    try {
      expect(await leerMaterialConFicha(coni, marcado)).toBeNull()
      expect(await leerPanelDelMaterial(coni, marcado)).toBeNull()
      expect((await leerMapaDelMaterial(coni, marcado)).total).toBe(0)
      expect((await leerMapaDelMaterial(coni, vivo)).total).toBe(1)
    } finally {
      await desmarcar("materiales", marcado)
    }
    expect((await leerMapaDelMaterial(coni, marcado)).total).toBe(2)
  })
})

describe("the author and topic readers", () => {
  it("leave a marked author out of the lists and answer not found for its page", async () => {
    await marcar("autores", marcada)
    try {
      expect((await listarAutores(coni)).map((autor) => autor.id)).not.toContain(marcada)
      expect((await resumirAutores(coni)).map((autor) => autor.id)).not.toContain(marcada)
      expect(await leerAutor(coni, marcada)).toBeNull()
    } finally {
      await desmarcar("autores", marcada)
    }
  })

  it("count neither the materials nor the ideas of a marked material for its author", async () => {
    const contar = async () => {
      const resumen = (await resumirAutores(coni)).find((autor) => autor.id === autora)
      const leido = await leerAutor(coni, autora)
      return {
        resumen: { materiales: resumen?.materiales, ideas: resumen?.ideas },
        pagina: { materiales: leido?.materiales, ideas: leido?.ideas, ocultas: leido?.ocultas.length },
      }
    }
    expect(await contar()).toEqual({
      resumen: { materiales: 2, ideas: 3 },
      pagina: { materiales: 2, ideas: 3, ocultas: 1 },
    })
    await marcar("materiales", marcado)
    try {
      expect(await contar()).toEqual({
        resumen: { materiales: 1, ideas: 1 },
        pagina: { materiales: 1, ideas: 1, ocultas: 0 },
      })
    } finally {
      await desmarcar("materiales", marcado)
    }
  })

  it("leave a marked material's ideas out of its topic's page and of Temas", async () => {
    const enTemas = async () => (await listarTemas(coni, { red: "linkedin" })).find((t) => t.id === tema)?.ideas
    expect((await leerTema(coni, tema))?.ideas).toBe(3)
    expect(await enTemas()).toBe(3)
    await marcar("materiales", marcado)
    try {
      expect((await leerTema(coni, tema))?.ideas).toBe(1)
      expect(await enTemas()).toBe(1)
    } finally {
      await desmarcar("materiales", marcado)
    }
  })
})

describe("leerNombreDeLoBorrado", () => {
  it("names a marked material or author, and is null once it is visible again or gone", async () => {
    expect(await leerNombreDeLoBorrado(coni, "material", marcado)).toBeNull()
    await marcar("materiales", marcado)
    await marcar("autores", marcada)
    try {
      expect(await leerNombreDeLoBorrado(coni, "material", marcado)).toEqual({ nombre: `Marcado ${SUFIJO}` })
      expect(await leerNombreDeLoBorrado(coni, "autor", marcada)).toEqual({ nombre: `Autora marcada ${SUFIJO}` })
    } finally {
      await desmarcar("materiales", marcado)
      await desmarcar("autores", marcada)
    }
    expect(await leerNombreDeLoBorrado(coni, "autor", randomUUID())).toBeNull()
  })
})
