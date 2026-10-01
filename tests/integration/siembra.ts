import { pool } from "./db"
import { crearPiezaEn } from "./flujo"

/** Walks a new piece to `destino` with the real flow and commits it, so a separate client (the app) can see it. */
export async function sembrarPieza(
  destino: Parameters<typeof crearPiezaEn>[1],
  ajustes: Record<string, unknown> = {},
): Promise<string> {
  const cliente = await pool.connect()
  let id: string
  try {
    await cliente.query("begin")
    id = await crearPiezaEn(cliente, destino)
    await cliente.query("commit")
  } catch (error) {
    await cliente.query("rollback")
    throw error
  } finally {
    cliente.release()
  }
  if (Object.keys(ajustes).length > 0) await ajustarPieza(id, ajustes)
  return id
}

/**
 * Writes columns as the database owner, the way a repair would. Every update must bump the version (a trigger
 * enforces it), so this does it; pass the other columns to change.
 */
export async function ajustarPieza(id: string, columnas: Record<string, unknown>): Promise<void> {
  const nombres = Object.keys(columnas)
  const asignaciones = ["version = version + 1", ...nombres.map((nombre, i) => `${nombre} = $${i + 2}`)].join(", ")
  await pool.query(`update public.piezas set ${asignaciones} where id = $1`, [id, ...nombres.map((n) => columnas[n])])
}

export async function leerFila(id: string) {
  const { rows } = await pool.query("select * from public.piezas where id = $1", [id])
  return rows[0]
}

export async function sembrarIdea(
  extra: { pilar?: string; gancho?: string; alertas?: unknown; numero?: number } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.ideas (pilar, gancho, tema, formato, fuerza, alertas, numero) values ($1, $2, 'tema', 'Mito o realidad', 'alta', $3::jsonb, $4) returning id",
    [
      extra.pilar ?? "deseo",
      extra.gancho ?? "El deseo no se apaga, se esconde",
      JSON.stringify(extra.alertas ?? []),
      extra.numero ?? null,
    ],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la idea")
  return id
}

/** Removes what the tests created. Only the database owner can delete pieces; the audit rows stay (append-only). */
export async function borrarSembrado(piezas: readonly string[], ideas: readonly string[]): Promise<void> {
  await pool.query("delete from public.gastos where pieza_id = any($1)", [piezas])
  await pool.query("delete from public.piezas where id = any($1)", [piezas])
  await pool.query("delete from public.ideas where id = any($1)", [ideas])
}

/** For the E2E run, which owns the whole local database for its duration. */
export async function vaciarPiezasEIdeas(): Promise<void> {
  await pool.query("delete from public.gastos")
  await pool.query("delete from public.intervenciones where pieza_id is not null")
  await pool.query("delete from public.piezas")
  await pool.query("delete from public.ideas")
}
