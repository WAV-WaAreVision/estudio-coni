import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { contarEtiquetasParaInicio, leerLoteDeLaSemana, leerRevisionDeEtiquetas } from "@/lib/datos/lote-de-etiquetas"
import { NOMBRE_DE_CAMPO } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { SEMANA } from "./lote-de-etiquetas-comun"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)

let coni: SupabaseClient<Database>
let wav: SupabaseClient<Database>
let autora = ""
let material = ""
let sinClasificar = ""
let conMarca = ""
let marca = ""

async function id(sql: string, params: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, params)
  const valor = rows[0]?.id
  if (!valor) throw new Error(`No se creó: ${sql.slice(0, 60)}`)
  return valor
}

const idea = (texto: string, tipo: string) =>
  id(
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
     values ($1, $2, 0, '{"pagina":1}'::jsonb, $3, 'cita', $4, 'estudio') returning id`,
    [material, autora, texto, tipo],
  )

beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
  autora = await sembrarAutor(`Autora lote ${SUFIJO}`)
  material = await sembrarMaterial({ titulo: `Material lote ${SUFIJO}`, autorId: autora })
  sinClasificar = await idea("Sin clasificar", "sin_clasificar")
  conMarca = await idea("Con una emoción dudosa", "consejo")
  marca = await id(
    `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, frase, certeza, origen)
     values ($1, 'emocion', 'linkedin', 'escepticismo', 'No me lo creo', 'baja', 'extraccion') returning id`,
    [conMarca],
  )
  // This week's batch written as postgres, so the readers do not depend on what else the local database holds.
  await pool.query(`delete from public.lotes_de_etiquetas where semana = ${SEMANA}`)
  const lote = await id(`insert into public.lotes_de_etiquetas (semana) values (${SEMANA}) returning id`, [])
  await pool.query(
    `insert into public.lote_de_etiquetas_items (lote_id, posicion, afirmacion_id, campo, red, marca_id, motivo)
     values ($1, 1, $2, 'tipo', 'todas', null, 'sin_clasificar'),
            ($1, 2, $3, 'emocion', 'linkedin', $4, 'certeza_baja')`,
    [lote, sinClasificar, conMarca, marca],
  )
})

afterAll(async () => {
  await pool.query(`delete from public.lotes_de_etiquetas where semana = ${SEMANA}`)
  await borrarSembrado([material], [], [autora])
})

describe("leerLoteDeLaSemana", () => {
  it("reads the week's items in order, each with whether it is done, for Coni and for WAV", async () => {
    const esperado = [
      {
        posicion: 1,
        afirmacionId: sinClasificar,
        campo: "tipo",
        red: "todas",
        marcaId: null,
        motivo: "sin_clasificar",
        hecha: false,
      },
      {
        posicion: 2,
        afirmacionId: conMarca,
        campo: "emocion",
        red: "linkedin",
        marcaId: marca,
        motivo: "certeza_baja",
        hecha: false,
      },
    ]
    expect(await leerLoteDeLaSemana(coni)).toEqual(esperado)
    expect(await leerLoteDeLaSemana(wav)).toEqual(esperado)
  })
})

describe("leerRevisionDeEtiquetas and contarEtiquetasParaInicio", () => {
  it("give a card per item and the pending count, and a done card after Coni's «Está bien»", async () => {
    expect(await contarEtiquetasParaInicio(coni)).toBe(2)
    expect(await leerRevisionDeEtiquetas(coni)).toMatchObject({
      estado: "lista",
      tarjetas: [
        { posicion: 1, estado: "pendiente", texto: "Sin clasificar", titulo: NOMBRE_DE_CAMPO.tipo },
        { posicion: 2, estado: "pendiente", texto: "Con una emoción dudosa", titulo: "Emoción en LinkedIn" },
      ],
    })
    const { error } = await coni.rpc("confirmar_etiqueta", {
      p_afirmacion: conMarca,
      p_campo: "emocion",
      p_red: "linkedin",
      p_marca_id: marca,
    })
    expect(error).toBeNull()
    expect(await leerRevisionDeEtiquetas(coni)).toMatchObject({
      estado: "lista",
      tarjetas: [
        { posicion: 1, estado: "pendiente" },
        { posicion: 2, estado: "hecha", revision: "Confirmada por ti" },
      ],
    })
    expect(await contarEtiquetasParaInicio(coni)).toBe(1)
  })
})
