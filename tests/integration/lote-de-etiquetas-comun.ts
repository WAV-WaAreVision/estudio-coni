import { randomUUID } from "node:crypto"
import type pg from "pg"
import { CONI } from "./db"

/** The Monday of this week in America/Santiago, as the migration computes it. */
export const SEMANA = "date_trunc('week', now() at time zone 'America/Santiago')::date"
export const LOTE =
  "select posicion, afirmacion_id, campo, red, marca_id, motivo, hecha from public.lote_de_la_semana()"

export interface FilaDeLote {
  posicion: number
  afirmacion_id: string
  campo: string
  red: string
  marca_id: string | null
  motivo: string
  hecha: boolean
}

export async function uno(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó: ${sql.slice(0, 60)}`)
  return id
}

/**
 * As postgres, inside the test's transaction (always rolled back): no batch, and every claim already in the local
 * database hidden, so only what the test seeds afterwards can be doubtful.
 */
export async function aislar(c: pg.PoolClient): Promise<void> {
  await c.query("delete from public.lotes_de_etiquetas")
  await c.query("update public.afirmaciones set excluida = true where not excluida")
}

export interface Base {
  material: string
  autor: string
}

export async function base(c: pg.PoolClient): Promise<Base> {
  const sufijo = randomUUID().slice(0, 8)
  const autor = await uno(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [
    `Autora lote ${sufijo}`,
  ])
  const material = await uno(
    c,
    `insert into public.materiales (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado)
     values ($1, 'documento', $2, 'referente', 'texto', now(), $3, 'listo') returning id`,
    [`Material lote ${sufijo}`, autor, CONI],
  )
  return { material, autor }
}

interface Idea {
  /** Minutes after a fixed day: the batch takes the oldest claim first. */
  minutos?: number
  tipo?: string
  evidencia?: string
  antigua?: boolean
  excluida?: boolean
}

export function idea(c: pg.PoolClient, b: Base, extra: Idea = {}): Promise<string> {
  return uno(
    c,
    `insert into public.afirmaciones
       (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, etiquetas_antiguas, excluida, creada_en)
     values ($1, $2, 0, '{"pagina":1}'::jsonb, 'Una idea', 'cita', $3, $4, $5, $6,
             timestamptz '2026-11-01 12:00:00+00' + $7 * interval '1 minute')
     returning id`,
    [
      b.material,
      b.autor,
      extra.tipo ?? "consejo",
      extra.evidencia ?? "estudio",
      extra.antigua ?? false,
      extra.excluida ?? false,
      extra.minutos ?? 0,
    ],
  )
}

interface Marca {
  marca: string
  red: string
  valor: string
  certeza?: string
  origen?: string
  porQue?: string | null
}

export function marca(c: pg.PoolClient, afirmacion: string, m: Marca): Promise<string> {
  return uno(
    c,
    `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, certeza, por_que, origen)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [afirmacion, m.marca, m.red, m.valor, m.certeza ?? "media", m.porQue ?? null, m.origen ?? "extraccion"],
  )
}

export async function gancho(c: pg.PoolClient, afirmacion: string, certeza: string, origen = "extraccion") {
  await c.query(
    `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
     select $1, 'Nadie te lo dijo.', 'Hay algo que no se dice.', 'verdad_incomoda', $2, id, $3
       from public.versiones_de_vocabulario where lista = 'gancho' and estado = 'vigente'`,
    [afirmacion, certeza, origen],
  )
}

export async function lote(c: pg.PoolClient): Promise<FilaDeLote[]> {
  return (await c.query<FilaDeLote>(LOTE)).rows
}
