import { CONI, pool } from "./db"
import {
  crearCarruselEn,
  crearPiezaEn,
  type EstadoDeCarruselDePrueba,
  type OpcionesDeCarrusel,
  type OpcionesDePieza,
} from "./flujo"
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
/** Like `sembrarPieza`, for a carousel: walked through the real flow and committed. */
export async function sembrarCarrusel(
  destino: EstadoDeCarruselDePrueba,
  opciones: OpcionesDeCarrusel = {},
): Promise<string> {
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    const id = await crearCarruselEn(cliente, destino, opciones)
    await cliente.query("commit")
    return id
  } catch (error) {
    await cliente.query("rollback")
    throw error
  } finally {
    cliente.release()
  }
}

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

/** Like `publicacionesDe`, with the publishing state of the row (LinkedIn phase 2). */
export async function publicacionesConDetalle(id: string) {
  const { rows } = await pool.query<{
    destino: string
    estado: string
    enlace: string | null
    video_urn: string | null
    enviado_en: string | null
    post_urn: string | null
    intentos: number
    explicacion: string | null
    ultimo_error: string | null
  }>("select * from public.publicaciones where pieza_id = $1 order by destino", [id])
  return rows
}

export async function leerFila(id: string) {
  const { rows } = await pool.query("select * from public.piezas where id = $1", [id])
  return rows[0]
}

export async function sembrarIdea(
  extra: { pilar?: string; gancho?: string; tema?: string; alertas?: unknown; numero?: number; estado?: string } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.ideas (pilar, gancho, tema, formato, fuerza, alertas, numero, estado) values ($1, $2, $6, 'Mito o realidad', 'alta', $3::jsonb, $4, $5) returning id",
    [
      extra.pilar ?? "practica-clinica",
      extra.gancho ?? "El deseo no se apaga, se esconde",
      JSON.stringify(extra.alertas ?? []),
      extra.numero ?? null,
      extra.estado ?? "idea",
      extra.tema ?? "tema",
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
  respaldo: {
    autor: string
    cita: string
    titulo?: string
    anio?: number
    deConi?: boolean
    /** The kind of author row; `persona` when absent. */
    tipo?: "persona" | "institucion"
    /** `opinion` when absent. */
    evidencia?: "estudio" | "clinica" | "opinion"
  }[]
}

/** An idea the weekly engine wrote: with its theory and the claims behind it, as the engine leaves them. */
export async function sembrarIdeaDelMotor(extra: {
  gancho: string
  semana: string
  tema?: string
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
      // Coni's own claims reuse her one author row; anyone else is a seeded person.
      const { rows: autor } = apoyo.deConi
        ? await pool.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
        : await pool.query<{ id: string }>(
            `insert into public.autores (nombre, tipo) values ($1, $2)
             on conflict (nombre_normalizado) do update set nombre = excluded.nombre returning id`,
            [apoyo.autor, apoyo.tipo ?? "persona"],
          )
      const { rows: material } = await pool.query<{ id: string }>(
        `insert into public.materiales (autor_id, tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por, titulo, anio)
         values ($1, 'documento', $2, 'siembra-motor', now(), $3, $4, $5) returning id`,
        [autor[0]?.id, categoria[0]?.id, CONI, apoyo.titulo ?? null, apoyo.anio ?? null],
      )
      const { rows: afirmacion } = await pool.query<{ id: string }>(
        `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
         values ($1, $2, $3, '{}', 'texto', $4, 'consejo', $5) returning id`,
        [material[0]?.id, autor[0]?.id, i, apoyo.cita, apoyo.evidencia ?? "opinion"],
      )
      await pool.query(
        "insert into public.teoria_afirmaciones (teoria_id, afirmacion_id, aporte) values ($1, $2, 'aporta')",
        [teoriaId, afirmacion[0]?.id],
      )
    }
  }
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, tema, formato, fuerza, alertas, estado, origen, semana, teoria_id, numero)
     values ($1, $2, $8, 'Mito o realidad', 'alta', $3::jsonb, $4, 'motor', $5, $6, $7) returning id`,
    [
      extra.pilar ?? "ia-salud-mental",
      extra.gancho,
      JSON.stringify(extra.alertas ?? []),
      extra.estado ?? "idea",
      extra.semana,
      teoriaId,
      extra.numero ?? null,
      extra.tema ?? "tema",
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
  const { rows: sembrados } = await pool.query<{ autor_id: string }>(
    "select distinct autor_id from public.materiales where texto_pegado = 'siembra-motor' and autor_id is not null",
  )
  await pool.query("delete from public.ideas where origen = 'motor'")
  await pool.query("delete from public.teorias where origen = 'motor'")
  await pool.query("delete from public.motor_corridas")
  await pool.query("delete from public.materiales where texto_pegado = 'siembra-motor'")
  // The authors the seed made, by name (`Siembra %`) or because only seeded material pointed at them; one that real
  // material or claims still use stays.
  await pool.query(
    `delete from public.autores a where a.tipo <> 'coni'
       and (a.nombre like 'Siembra %' or a.id = any($1::uuid[]))
       and not exists (select 1 from public.materiales m where m.autor_id = a.id)
       and not exists (select 1 from public.afirmaciones f where f.autor_id = a.id)`,
    [sembrados.map((fila) => fila.autor_id)],
  )
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

/**
 * Marks a destination of a piece as out, as the database owner (the publishing run or her upload would). LinkedIn's
 * `publicado` needs a numeric post URN (`linkedin_publicado_con_urn`, `post_urn_es_de_post`), so one is made up from
 * a hash of the piece id.
 */
export async function marcarPublicacion(
  piezaId: string,
  destino: "instagram" | "linkedin",
  estado: "publicado" | "subido_a_mano" = "publicado",
): Promise<void> {
  await pool.query(
    `insert into public.publicaciones (pieza_id, destino, estado, marcado_en, post_urn)
     values ($1::uuid, $2::text, $3::text, now(),
             case when $2::text = 'linkedin' and $3::text = 'publicado' then 'urn:li:share:' || abs(hashtext($1::text)) end)
     on conflict (pieza_id, destino) do update
       set estado = excluded.estado, marcado_en = excluded.marcado_en, post_urn = excluded.post_urn`,
    [piezaId, destino, estado],
  )
}

/** Removes a destination row: for a piece that went out on one network only. */
export async function quitarPublicacion(piezaId: string, destino: "instagram" | "linkedin"): Promise<void> {
  await pool.query("delete from public.publicaciones where pieza_id = $1 and destino = $2", [piezaId, destino])
}

/**
 * Moves the signed publishing time. Only the owner can rewrite an approval, and only with the triggers off, so it is
 * done here on purpose, in one transaction.
 */
export async function moverHoraAprobada(piezaId: string, instante: string): Promise<void> {
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    await cliente.query("set local session_replication_role = replica")
    await cliente.query("update public.piezas set puerta2_publicar_en = $2 where id = $1", [piezaId, instante])
    await cliente.query("commit")
  } catch (error) {
    await cliente.query("rollback")
    throw error
  } finally {
    cliente.release()
  }
}

/** A proposal stored as the database owner, the way Repartir would leave it. */
export async function proponerFecha(piezaId: string, instante: string): Promise<void> {
  await pool.query(
    `insert into public.fechas_propuestas (pieza_id, publicar_en) values ($1, $2)
     on conflict (pieza_id) do update set publicar_en = excluded.publicar_en`,
    [piezaId, instante],
  )
}
