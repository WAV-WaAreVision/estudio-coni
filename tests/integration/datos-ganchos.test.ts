import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { leerGancho, leerTiposPreferidos, listarGanchos } from "@/lib/datos/ganchos"
import { leerTiposDeGancho } from "@/lib/datos/vocabulario"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarMaterial, sembrarTema } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: SupabaseClient<Database>
let autora = ""
let material = ""
let tema = ""
let nuevo = ""
let viejo = ""

async function afirmacion(texto: string, gancho: string | null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, gancho)
     values ($1, $2, 0, '{"pagina":3}'::jsonb, $3, 'cita', 'dato', 'estudio', $4, $5) returning id`,
    [material, autora, texto, tema, gancho],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó la afirmación ${texto}`)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
  autora = await sembrarAutor(`Autora ganchos ${SUFIJO}`)
  material = await sembrarMaterial({ titulo: `Material ganchos ${SUFIJO}`, autorId: autora })
  tema = await sembrarTema(`Tema ganchos ${SUFIJO}`)
  await pool.query(
    `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
     select $1, c.id, c.red, c.es_capa, 'alta', 'coni' from public.categorias c where c.slug = 'diagnostico-doble'`,
    [tema],
  )
  nuevo = await afirmacion("Con gancho nuevo", null)
  viejo = await afirmacion("Con gancho viejo", "¿Y si descansar fuera trabajo?")
  await pool.query(
    `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen, creada_en)
     select $1, 'El 70 % no descansa.', 'Pocas personas descansan.', 'numero_especifico', 'media', id, 'extraccion',
            now() - interval '1 day'
       from public.versiones_de_vocabulario where lista = 'gancho' and estado = 'vigente'`,
    [nuevo],
  )
  await pool.query("insert into public.ganchos_favoritos (afirmacion_id) values ($1)", [viejo])
})

afterAll(async () => {
  await pool.query("update public.ajustes set tipos_de_gancho_preferidos = '{}'")
  await borrarSembrado([material], [tema], [autora])
  await pool.end()
})

describe("listarGanchos", () => {
  it("reads every hook of the view as the screens use it", async () => {
    const propios = (await listarGanchos(coni)).filter((gancho) => gancho.material.id === material)
    expect(propios).toHaveLength(2)
    expect(propios.find((gancho) => gancho.afirmacionId === nuevo)).toEqual({
      afirmacionId: nuevo,
      fraseExacta: "El 70 % no descansa.",
      fraseSinGancho: "Pocas personas descansan.",
      tipo: "numero_especifico",
      certeza: "media",
      clasificado: true,
      creadoEn: expect.any(String),
      material: { id: material, titulo: `Material ganchos ${SUFIJO}` },
      ubicacion: { pagina: 3 },
      autor: { id: autora, nombre: `Autora ganchos ${SUFIJO}` },
      tema: { id: tema, nombre: `Tema ganchos ${SUFIJO}` },
      pilares: [{ red: "linkedin", pilarId: expect.any(String), nombre: "Diagnóstico doble" }],
      favorito: false,
    })
    expect(propios.find((gancho) => gancho.afirmacionId === viejo)).toMatchObject({
      fraseExacta: "¿Y si descansar fuera trabajo?",
      fraseSinGancho: null,
      tipo: "sin_clasificar",
      certeza: null,
      clasificado: false,
      favorito: true,
    })
  })
})

describe("leerGancho", () => {
  it("reads one hook by its claim, and null when there is none", async () => {
    expect(await leerGancho(coni, viejo)).toMatchObject({ afirmacionId: viejo, tema: { id: tema } })
    expect(await leerGancho(coni, AUSENTE)).toBeNull()
  })

  it("gives null for an id that is not a claim id", async () => {
    expect(await leerGancho(coni, "no-es-un-id")).toBeNull()
  })
})

describe("leerTiposPreferidos", () => {
  it("reads the types Coni chose", async () => {
    await pool.query("update public.ajustes set tipos_de_gancho_preferidos = '{escena,mito}'")
    expect(await leerTiposPreferidos(coni)).toEqual(["escena", "mito"])
  })
})

describe("leerTiposDeGancho", () => {
  it("gives the twelve types of the vigente list with their labels, all active", async () => {
    const tipos = await leerTiposDeGancho(coni)
    expect(tipos).toHaveLength(12)
    expect(tipos[0]).toEqual({ valor: "afirmacion_contraria", etiqueta: "Afirmación contraria", activo: true })
    expect(tipos.every((tipo) => tipo.activo)).toBe(true)
  })
})
