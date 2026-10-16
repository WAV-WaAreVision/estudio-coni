import type { SupabaseClient } from "@supabase/supabase-js"
import {
  confirmarGasto,
  type FilaDeGasto,
  type FilaDePieza,
  leerGastosAbiertos,
  liberarGasto,
} from "@/lib/datos/repositorio"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsBarrido {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  ahora: () => string
}

const HORA_MS = 3_600_000
const HORAS_PARA_MIRAR = 1
const HORAS_PARA_LIBERAR = 24

/** Past the HeyGen step: the video was created (and charged) or the piece moved on from the render. */
const DESPUES_DEL_RENDER = [
  "subtitulando",
  "video_por_aprobar",
  "programado",
  "para_subir_a_mano",
  "publicado",
  "publicado_a_mano",
  "error_publicacion",
]
/** Before the script step is over: nothing was saved from it. */
const ANTES_DEL_GUION = ["idea", "guion_en_proceso"]

/** `<pieza>:voz:<huella de 16>:<intento>`: the key of a voice reservation by text; older keys do not match. */
const CLAVE_DE_VOZ = /:voz:([0-9a-f]{16}):(\d+)$/

/** The take this very reservation pays for is the voice of the piece. Null when the key is an older one. */
function tomaDeLaReserva(gasto: FilaDeGasto, pieza: FilaDePieza): boolean | null {
  if (gasto.proveedor !== "elevenlabs" || gasto.paso !== "voz") return null
  const partes = CLAVE_DE_VOZ.exec(gasto.clave)
  if (!partes) return null
  const [, huella, intento] = partes
  const audio = pieza.audio_id
  if (audio === null) return false
  return audio.startsWith(`voces/${pieza.id}/t-${huella}`) && audio.endsWith(`-${intento}.mp3`)
}

/** Did the step this reservation paid for already happen? Then the money is spent, whatever the run that died said. */
function pasoRealizado(gasto: FilaDeGasto, pieza: FilaDePieza): boolean {
  if (gasto.proveedor === "heygen") return pieza.render_id !== null || DESPUES_DEL_RENDER.includes(pieza.estado)
  if (gasto.proveedor === "elevenlabs" && gasto.paso === "voz") {
    // The voice is made before gate 1 (by the writer, or by "Preparar mi voz") and signing keeps it, so a stored
    // voice may belong to an earlier reservation: only the take of this one says it was paid. Older keys fall back to
    // any stored voice. A reservation with no take of its own is released after an hour by `vozSinToma`.
    return tomaDeLaReserva(gasto, pieza) ?? pieza.audio_id !== null
  }
  return !ANTES_DEL_GUION.includes(pieza.estado)
}

/** A voice by text whose run is over (the piece is not recording) and left no take: nothing was paid. */
function vozSinToma(gasto: FilaDeGasto, pieza: FilaDePieza): boolean {
  return tomaDeLaReserva(gasto, pieza) === false && pieza.estado !== "grabando_voz"
}

/**
 * Closes the reservations a run left open (design: the cap counts reserved money, so a dead run must not hold it for
 * ever). After an hour, a reservation whose piece is already past its step is confirmed at its estimate, because the
 * provider charged; one whose step never happened is released once it is a day old, in case the run is only slow.
 */
export async function barrerGastos(deps: DepsBarrido): Promise<{ confirmados: number; liberados: number }> {
  const ahora = Date.parse(deps.ahora())
  const abiertos = await leerGastosAbiertos(deps.db, new Date(ahora - HORAS_PARA_MIRAR * HORA_MS).toISOString())
  let confirmados = 0
  let liberados = 0
  for (const { gasto, pieza } of abiertos) {
    if (pieza && pasoRealizado(gasto, pieza)) {
      await confirmarGasto(deps.db, gasto.clave, gasto.estimado_usd)
      confirmados += 1
    } else if (
      (pieza && vozSinToma(gasto, pieza)) ||
      ahora - Date.parse(gasto.creado_en) >= HORAS_PARA_LIBERAR * HORA_MS
    ) {
      await liberarGasto(deps.db, gasto.clave)
      liberados += 1
    }
  }
  return { confirmados, liberados }
}
