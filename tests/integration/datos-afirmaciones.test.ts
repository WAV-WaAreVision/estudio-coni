import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { leerAfirmacion, leerIdeasDelMaterial, leerInsigniasDeIdeas } from "@/lib/datos/afirmaciones"
import { leerCatalogoDeEtiquetas } from "@/lib/datos/vocabulario"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarMaterial, sembrarTema } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const AUSENTE = "00000000-0000-4000-8000-000000000000"

let coni: SupabaseClient<Database>
let autora = ""
let material = ""
let borrado = ""
let tema = ""
let nueva = ""
let antigua = ""
let oculta = ""
let deBorrado = ""

async function idea(
  materialId: string,
  texto: string,
  extra: { excluida?: boolean; minutos?: number; tipo?: string } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmaciones
       (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, publico, dolor, emocion, excluida,
        creada_en)
     values ($1, $2, 0, '{"pagina":4}'::jsonb, $3, 'La cita literal', $4, 'estudio', $5, 'líderes', 'sobrecarga',
             'alivio', $6, now() + $7 * interval '1 minute')
     returning id`,
    [materialId, autora, texto, extra.tipo ?? "consejo", tema, extra.excluida ?? false, extra.minutos ?? 0],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó la idea ${texto}`)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
  autora = await sembrarAutor(`Autora lecturas ${SUFIJO}`)
  material = await sembrarMaterial({ titulo: `Material lecturas ${SUFIJO}`, autorId: autora })
  borrado = await sembrarMaterial({ titulo: `Material borrado ${SUFIJO}`, autorId: autora })
  tema = await sembrarTema(`Tema lecturas ${SUFIJO}`)
  antigua = await idea(material, "Antigua", { minutos: 0, tipo: "mito" })
  await pool.query("update public.afirmaciones set etiquetas_antiguas = true where id = $1", [antigua])
  nueva = await idea(material, "Nueva", { minutos: 1 })
  oculta = await idea(material, "Oculta", { excluida: true, minutos: 2 })
  deBorrado = await idea(borrado, "De un material borrado")
  await pool.query("update public.materiales set borrar_desde = now() where id = $1", [borrado])
  await pool.query(
    `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, frase, certeza, version_id, origen, creada_en)
     select $1, f.marca, f.red, f.valor, f.frase, f.certeza, v.id, f.origen, now() + f.orden * interval '1 second'
       from (values (1, 'emocion', 'linkedin', 'escepticismo', 'No me lo creo', 'baja', 'emocion', 'extraccion'),
                    (2, 'emocion', 'instagram', 'curiosidad', null, 'alta', 'emocion', 'coni'),
                    (3, 'dato', 'todas', '70 %', 'El 70 % trabaja solo', 'alta', null, 'extraccion'))
            as f (orden, marca, red, valor, frase, certeza, lista, origen)
       left join public.versiones_de_vocabulario v on v.lista = f.lista and v.estado = 'vigente' and v.red = 'todas'`,
    [nueva],
  )
  await pool.query(
    `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
     select $1, 'Nadie te lo dijo.', 'Hay algo que no se dice.', 'escena', 'media', id, 'extraccion'
       from public.versiones_de_vocabulario where lista = 'gancho' and estado = 'vigente'`,
    [nueva],
  )
  await pool.query(
    `insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues, version_id)
     select $1, 'emocion', 'instagram', 'corrige', 'sorpresa', 'curiosidad', id
       from public.versiones_de_vocabulario where lista = 'emocion' and estado = 'vigente'`,
    [nueva],
  )
})

afterAll(async () => {
  await borrarSembrado([material, borrado], [tema], [autora])
  await pool.end()
})

describe("leerAfirmacion", () => {
  it("reads the claim, its links, its marks in order, its hook and Coni's log", async () => {
    const leida = await leerAfirmacion(coni, nueva)
    expect(leida).toMatchObject({
      id: nueva,
      texto: "Nueva",
      cita: "La cita literal",
      tipo: "consejo",
      evidencia: "estudio",
      ubicacion: { pagina: 4 },
      material: { id: material, titulo: `Material lecturas ${SUFIJO}` },
      autor: { id: autora, nombre: `Autora lecturas ${SUFIJO}` },
      tema: { id: tema, nombre: `Tema lecturas ${SUFIJO}` },
      etiquetasAntiguas: false,
      textoAntiguo: { publico: "líderes", dolor: "sobrecarga", emocion: "alivio", gancho: null },
      gancho: {
        fraseExacta: "Nadie te lo dijo.",
        fraseSinGancho: "Hay algo que no se dice.",
        tipo: "escena",
        certeza: "media",
        origen: "extraccion",
      },
      correcciones: [{ campo: "emocion", red: "instagram", accion: "corrige", creadaEn: expect.any(String) }],
    })
    expect(leida?.marcas.map((m) => [m.marca, m.red, m.valor, m.frase, m.certeza, m.origen])).toEqual([
      ["emocion", "linkedin", "escepticismo", "No me lo creo", "baja", "extraccion"],
      ["emocion", "instagram", "curiosidad", null, "alta", "coni"],
      ["dato", "todas", "70 %", "El 70 % trabaja solo", "alta", "extraccion"],
    ])
    expect(leida?.marcas[0]?.id).toEqual(expect.any(String))
  })

  it("reads an old claim with no marks and no hook", async () => {
    expect(await leerAfirmacion(coni, antigua)).toMatchObject({
      etiquetasAntiguas: true,
      marcas: [],
      gancho: null,
      correcciones: [],
    })
  })

  it("is null for a hidden claim, one whose material was deleted, and one that does not exist", async () => {
    expect(await leerAfirmacion(coni, oculta)).toBeNull()
    expect(await leerAfirmacion(coni, deBorrado)).toBeNull()
    expect(await leerAfirmacion(coni, AUSENTE)).toBeNull()
  })
})

describe("leerCatalogoDeEtiquetas", () => {
  it("reads every vigente list with its labels", async () => {
    const catalogo = await leerCatalogoDeEtiquetas(coni)
    expect(catalogo.emocion).toHaveLength(22)
    expect(catalogo.emocion[0]).toMatchObject({ valor: "agobio", grupo: "problema", activacion: "alta", activo: true })
    expect(catalogo.gancho.every((valor) => valor.activo)).toBe(true)
    expect(catalogo.publico.instagram).toHaveLength(3)
    expect(catalogo.dolor.linkedin).toHaveLength(6)
  })
})

describe("leerInsigniasDeIdeas", () => {
  it("gives each idea its badges, an old one without emotions", async () => {
    const ideas = [
      { id: antigua, texto: "Antigua", tipo: "mito", evidencia: "estudio" },
      { id: nueva, texto: "Nueva", tipo: "consejo", evidencia: "estudio" },
    ]
    const insignias = await leerInsigniasDeIdeas(coni, ideas)
    expect(insignias.get(antigua)).toEqual({ tipo: "Mito", evidencia: "Estudio", emociones: [] })
    expect(insignias.get(nueva)).toEqual({
      tipo: "Consejo",
      evidencia: "Estudio",
      emociones: [
        { red: "linkedin", etiqueta: "Escepticismo" },
        { red: "instagram", etiqueta: "Curiosidad" },
      ],
    })
    expect((await leerInsigniasDeIdeas(coni, [])).size).toBe(0)
  })
})

describe("leerIdeasDelMaterial", () => {
  it("reads a material's visible ideas, oldest first", async () => {
    expect(await leerIdeasDelMaterial(coni, material)).toEqual([
      { id: antigua, texto: "Antigua", tipo: "mito", evidencia: "estudio" },
      { id: nueva, texto: "Nueva", tipo: "consejo", evidencia: "estudio" },
    ])
    expect(await leerIdeasDelMaterial(coni, borrado)).toEqual([])
  })
})
