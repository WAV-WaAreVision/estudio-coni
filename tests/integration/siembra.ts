import { CONI, pool } from "./db"
import { crearPiezaEn, type OpcionesDePieza } from "./flujo"
import { clienteDeServicio } from "./servicio"

/** Walks a new piece to `destino` with the real flow and commits it, so a separate client (the app) can see it. */
export async function sembrarPieza(
  destino: Parameters<typeof crearPiezaEn>[1],
  ajustes: Record<string, unknown> = {},
  opciones: OpcionesDePieza = {},
): Promise<string> {
  const cliente = await pool.connect()
  let id: string
  try {
    await cliente.query("begin")
    id = await crearPiezaEn(cliente, destino, opciones)
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

/** The destinations of a piece and where each one is, in the canonical order. */
export async function publicacionesDe(id: string) {
  const { rows } = await pool.query<{ destino: string; estado: string; enlace: string | null }>(
    "select destino, estado, enlace from public.publicaciones where pieza_id = $1 order by destino",
    [id],
  )
  return rows
}

export async function leerFila(id: string) {
  const { rows } = await pool.query("select * from public.piezas where id = $1", [id])
  return rows[0]
}

export async function sembrarIdea(
  extra: { pilar?: string; gancho?: string; alertas?: unknown; numero?: number; estado?: string } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.ideas (pilar, gancho, tema, formato, fuerza, alertas, numero, estado) values ($1, $2, 'tema', 'Mito o realidad', 'alta', $3::jsonb, $4, $5) returning id",
    [
      extra.pilar ?? "deseo",
      extra.gancho ?? "El deseo no se apaga, se esconde",
      JSON.stringify(extra.alertas ?? []),
      extra.numero ?? null,
      extra.estado ?? "idea",
    ],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la idea")
  return id
}

export interface TeoriaSembrada {
  titulo: string
  tesis: string
  nivel: "alto" | "medio" | "debil"
  respaldo: { autor: string; cita: string }[]
}

/** An idea the weekly engine wrote: with its theory and the claims behind it, as the engine leaves them. */
export async function sembrarIdeaDelMotor(extra: {
  gancho: string
  semana: string
  pilar?: string
  estado?: string
  alertas?: unknown
  numero?: number
  teoria?: TeoriaSembrada
}): Promise<string> {
  let teoriaId: string | null = null
  if (extra.teoria) {
    const { rows } = await pool.query<{ id: string }>(
      "insert into public.teorias (titulo, tesis, nivel_evidencia, origen, semana) values ($1, $2, $3, 'motor', $4) returning id",
      [extra.teoria.titulo, extra.teoria.tesis, extra.teoria.nivel, extra.semana],
    )
    teoriaId = rows[0]?.id ?? null
    const { rows: categoria } = await pool.query<{ id: string }>(
      "select id from public.categorias where slug = 'general'",
    )
    for (const [i, apoyo] of extra.teoria.respaldo.entries()) {
      const { rows: autor } = await pool.query<{ id: string }>(
        `insert into public.autores (nombre, tipo) values ($1, 'persona')
         on conflict (nombre_normalizado) do update set nombre = excluded.nombre returning id`,
        [apoyo.autor],
      )
      const { rows: material } = await pool.query<{ id: string }>(
        `insert into public.materiales (autor_id, tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         values ($1, 'documento', $2, 'siembra-motor', now(), $3) returning id`,
        [autor[0]?.id, categoria[0]?.id, CONI],
      )
      const { rows: afirmacion } = await pool.query<{ id: string }>(
        `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
         values ($1, $2, $3, '{}', 'texto', $4, 'consejo', 'opinion') returning id`,
        [material[0]?.id, autor[0]?.id, i, apoyo.cita],
      )
      await pool.query(
        "insert into public.teoria_afirmaciones (teoria_id, afirmacion_id, aporte) values ($1, $2, 'aporta')",
        [teoriaId, afirmacion[0]?.id],
      )
    }
  }
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, tema, formato, fuerza, alertas, estado, origen, semana, teoria_id, numero)
     values ($1, $2, 'tema', 'Mito o realidad', 'alta', $3::jsonb, $4, 'motor', $5, $6, $7) returning id`,
    [
      extra.pilar ?? "pareja",
      extra.gancho,
      JSON.stringify(extra.alertas ?? []),
      extra.estado ?? "idea",
      extra.semana,
      teoriaId,
      extra.numero ?? null,
    ],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la idea del motor")
  return id
}

export async function sembrarCorrida(
  semana: string,
  estado: "corriendo" | "lista" | "fallida" = "lista",
): Promise<void> {
  // As the service role, the way the engine writes: the audit log is append-only and other suites read it.
  const { error } = await clienteDeServicio().from("motor_corridas").insert({ semana, estado })
  if (error) throw new Error(`No pude sembrar la corrida: ${error.message}`, { cause: error })
}

/** Removes the engine's rows the tests seeded: runs, theories (and their claims) and the authors made for them. */
export async function vaciarMotor(): Promise<void> {
  await pool.query("delete from public.ideas where origen = 'motor'")
  await pool.query("delete from public.teorias where origen = 'motor'")
  await pool.query("delete from public.motor_corridas")
  await pool.query("delete from public.materiales where texto_pegado = 'siembra-motor'")
  await pool.query("delete from public.autores where tipo = 'persona' and nombre like 'Siembra %'")
}

/** Removes what the tests created. Only the database owner can delete pieces; the audit rows stay (append-only). */
export async function borrarSembrado(piezas: readonly string[], ideas: readonly string[]): Promise<void> {
  await pool.query("delete from public.gastos where pieza_id = any($1)", [piezas])
  await pool.query("delete from public.piezas where id = any($1)", [piezas])
  await pool.query("delete from public.ideas where id = any($1)", [ideas])
}

/** For the E2E run, which owns the whole local database for its duration. */
export async function vaciarPiezasEIdeas(): Promise<void> {
  await pool.query("delete from public.avisos")
  await pool.query("delete from public.suscripciones_push")
  await pool.query("delete from public.gastos")
  await pool.query("delete from public.intervenciones where pieza_id is not null")
  await pool.query("delete from public.piezas")
  await pool.query("delete from public.ideas")
  await vaciarMotor()
}
