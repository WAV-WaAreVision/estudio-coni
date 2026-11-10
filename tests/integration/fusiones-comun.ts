import type pg from "pg"
import { pool } from "./db"
import { afirmacion, reiniciarHuellas, tema, vec } from "./huellas-comun"

export { afirmacion, tema, vec }

/** Topics, claims, decisions, merges and rejections gone (they cascade with the topics). */
export const limpiarFusiones = reiniciarHuellas

/** A pillar row written as postgres, as the RPCs would. */
export const pilarDeTema = (temaId: string, slug: string, fuerza: string | null) =>
  pool.query(
    `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
     select $1, c.id, c.red, c.es_capa, $3, 'coni' from public.categorias c where c.slug = $2`,
    [temaId, slug, fuerza],
  )

export const conAlias = (temaId: string, alias: string[]) =>
  pool.query("update public.temas set alias = $2 where id = $1", [temaId, alias])

/** What an exact undo must give back: every claim's topic, both topics' pillar rows, aliases and chains. */
export async function foto(c: pg.PoolClient, temas: readonly string[]) {
  const afirmaciones = await c.query("select id, tema_id from public.afirmaciones order by id")
  const pilares = await c.query(
    `select tema_id, pilar_id, red, es_capa, fuerza, origen, lote, creado_en::text as creado_en
       from public.tema_pilares where tema_id = any($1::uuid[]) order by tema_id, pilar_id`,
    [temas],
  )
  const filas = await c.query(
    "select id, alias, fusionado_en from public.temas where id = any($1::uuid[]) order by id",
    [temas],
  )
  return { afirmaciones: afirmaciones.rows, pilares: pilares.rows, temas: filas.rows }
}

/** The largest gap between a topic's centroid and the plain mean of its live claims. */
export async function desvioDelCentroide(c: pg.PoolClient, temaId: string): Promise<number> {
  const { rows } = await c.query<{ c: string; m: string }>(
    `select t.centroide::text as c,
            (select extensions.avg(a.vector) from public.afirmaciones a
              where a.tema_id = t.id and not a.excluida and a.vector is not null)::text as m
       from public.temas t where t.id = $1`,
    [temaId],
  )
  const leer = (texto: string | undefined) => (texto ?? "[]").slice(1, -1).split(",").map(Number)
  const centro = leer(rows[0]?.c)
  const media = leer(rows[0]?.m)
  return Math.max(...centro.map((x, i) => Math.abs(x - (media[i] ?? Number.NaN))))
}

/**
 * Ganador: 2 claims, alias «Ya conocido», LinkedIn main Diagnóstico doble, Instagram secondary Mi nueva partida.
 * Perdedor: 2 claims, aliases «Ya conocido» and «Otro nombre», LinkedIn main Bienestar e impacto, Instagram main Mi
 * nueva partida, the TDAH layer. Encadenado: merged into Perdedor earlier.
 */
export async function escenaDeFusion() {
  const ganador = await tema("Ganador", vec({ 0: 1 }))
  const perdedor = await tema("Perdedor", vec({ 0: 1, 1: 0.2 }))
  const encadenado = await tema("Encadenado", vec({ 0: 1 }), { fusionado: perdedor })
  await conAlias(ganador, ["Ya conocido"])
  await conAlias(perdedor, ["Ya conocido", "Otro nombre"])
  const deGanador = [
    await afirmacion(vec({ 0: 1 }), { tema: ganador }),
    await afirmacion(vec({ 0: 1, 2: 0.3 }), { tema: ganador }),
  ]
  const dePerdedor = [
    await afirmacion(vec({ 0: 1, 1: 0.2 }), { tema: perdedor }),
    await afirmacion(vec({ 1: 1 }), { tema: perdedor }),
  ]
  await pilarDeTema(ganador, "diagnostico-doble", "alta")
  await pilarDeTema(ganador, "mi-nueva-partida", "media")
  await pilarDeTema(perdedor, "bienestar-e-impacto", "alta")
  await pilarDeTema(perdedor, "mi-nueva-partida", "alta")
  await pilarDeTema(perdedor, "capa-tdah", null)
  return { ganador, perdedor, encadenado, deGanador, dePerdedor }
}

/** A proposal as the nightly run leaves it. */
export async function propuesta(ganador: string, perdedor: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.fusiones (ganador_id, perdedor_id, origen, veredicto, seguro, razon, delicada, motivo_delicada)
     values ($1, $2, 'claude', 'mismo', false, 'Hablan de lo mismo.', true, 'Claude no está seguro de que sean el mismo tema.')
     returning id`,
    [ganador, perdedor],
  )
  return rows[0]?.id ?? ""
}
