import type { SupabaseClient } from "@supabase/supabase-js"
import { type FilaDePieza, type IdeaLeida, leerIdea, leerPieza, leerProduccion } from "@/lib/datos/repositorio"
import { textoParaVoz } from "@/lib/dominio/etiquetas"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { diaLocal, type Horario } from "@/lib/dominio/fechas"
import { linkedinConectadoEn } from "@/lib/dominio/linkedin"
import { dolares } from "@/lib/formato"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { estimarCostoVideo } from "@/lib/produccion/grabar"
import { type AvatarElegible, leerConfigProduccion } from "@/lib/proveedores/config"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

export interface PiezaConIdea {
  fila: FilaDePieza
  idea: IdeaLeida | null
}

/** A piece and the idea it came from, read through Coni's session. Null when there is no such piece. */
export async function leerPantallaDePieza(db: Db, id: string): Promise<PiezaConIdea | null> {
  const fila = await leerPieza(db, id)
  if (!fila) return null
  return { fila, idea: fila.idea_id ? await leerIdea(db, fila.idea_id) : null }
}

/**
 * Whether an Instagram account was ever connected, as far as Coni's session can tell (the token lives in the Vault and
 * is not hers to read): the screens offer the manual upload while it is not.
 */
export async function leerInstagramConectado(db: Db): Promise<boolean> {
  const { data, error } = await db.from("ajustes").select("meta_cuenta_id").maybeSingle()
  if (error) throw fallo("No pude leer la cuenta de Instagram", error)
  return data?.meta_cuenta_id != null
}

/** Whether her LinkedIn connection is alive now: a connected one posts by itself at the approved time. */
export async function leerLinkedinConectado(db: Db, ahora: number): Promise<boolean> {
  const { data, error } = await db.from("ajustes").select("linkedin_miembro, linkedin_token_expira_en").maybeSingle()
  if (error) throw fallo("No pude leer la conexión de LinkedIn", error)
  return data !== null && linkedinConectadoEn(data, ahora)
}

export interface ContextoDeFechas {
  horario: Horario
  /** Times already taken by a scheduled piece (other than the one being looked at). */
  ocupadas: string[]
  /** Pieces ahead of this one on the way to a slot: being recorded or waiting for their video approval. */
  enCola: number
}

export async function leerContextoDeFechas(db: Db, piezaId: string): Promise<ContextoDeFechas> {
  const [ajustes, programadas, enCola] = await Promise.all([
    db.from("ajustes").select("dias_publicacion, hora_publicacion, zona").maybeSingle(),
    db.from("piezas").select("puerta2_publicar_en").eq("estado", "programado").neq("id", piezaId),
    db
      .from("piezas")
      .select("id", { count: "exact", head: true })
      .in("estado", ["guion_aprobado", "grabando_voz", "en_render", "subtitulando", "video_por_aprobar"])
      .neq("id", piezaId),
  ])
  if (ajustes.error) throw fallo("No pude leer los horarios", ajustes.error)
  if (programadas.error) throw fallo("No pude leer lo programado", programadas.error)
  if (enCola.error) throw fallo("No pude contar lo que viene", enCola.error)
  return {
    horario: {
      dias: ajustes.data?.dias_publicacion ?? [2, 4, 6],
      hora: ajustes.data?.hora_publicacion ?? "19:00",
      zona: ajustes.data?.zona ?? "America/Santiago",
    },
    ocupadas: programadas.data.flatMap((fila) => (fila.puerta2_publicar_en ? [fila.puerta2_publicar_en] : [])),
    enCola: enCola.count ?? 0,
  }
}

export interface Presupuesto {
  tope: number
  usado: number
}

/** What the month has spent or reserved against the cap: a confirmed spend counts its real cost. */
export async function leerPresupuesto(db: Db, ahora: number, zona: string): Promise<Presupuesto> {
  const mes = `${diaLocal(ahora, zona).slice(0, 7)}-01`
  const [ajustes, gastos] = await Promise.all([
    db.from("ajustes").select("tope_mensual_usd").maybeSingle(),
    db.from("gastos").select("estado, estimado_usd, real_usd").eq("mes", mes).in("estado", ["reservado", "confirmado"]),
  ])
  if (ajustes.error) throw fallo("No pude leer el tope", ajustes.error)
  if (gastos.error) throw fallo("No pude leer los gastos", gastos.error)
  return {
    tope: ajustes.data?.tope_mensual_usd ?? 0,
    usado: gastos.data.reduce(
      (suma, gasto) =>
        suma + (gasto.estado === "confirmado" ? (gasto.real_usd ?? gasto.estimado_usd) : gasto.estimado_usd),
      0,
    ),
  }
}

export interface CostoDeGrabar {
  /** "Grabar cuesta unos US$ 2,40 · te quedan US$ 37,00 este mes", or null when the setup cannot say. */
  linea: string | null
  estimadoUsd: number | null
  /** True when this recording would take the month past the cap. */
  superaElTope: boolean
}

/**
 * The cost line of the approve bar. The voice is generated after gate 1, so it counts unless the piece already has
 * its audio (`audioId`, a legacy piece whose voice was paid). If the production setup is unreadable it says nothing rather than a wrong number. */
export async function leerCostoDeGrabar(
  db: Db,
  guion: string,
  ahora: number,
  zona: string,
  audioId: string | null,
): Promise<CostoDeGrabar> {
  let estimadoUsd: number
  try {
    const config = leerConfigProduccion(await leerProduccion(db))
    estimadoUsd =
      estimarCostoVideo(guion, config.heygen.motor) +
      (audioId === null ? estimarCostoVoz(textoParaVoz(guion, config.elevenlabs.model_id)) : 0)
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude estimar el costo de grabar", error)
    return { linea: null, estimadoUsd: null, superaElTope: false }
  }
  const { tope, usado } = await leerPresupuesto(db, ahora, zona)
  const quedan = Math.max(0, tope - usado)
  return {
    linea: `Grabar cuesta unos ${dolares(estimadoUsd)} · te quedan ${dolares(quedan)} este mes`,
    estimadoUsd,
    superaElTope: estimadoUsd > quedan,
  }
}

/** The looks WAV lets Coni choose (`heygen.avatares` of the production config). A config that does not read is a failure for WAV. */
export async function leerAvataresElegibles(db: Db): Promise<AvatarElegible[]> {
  return leerConfigProduccion(await leerProduccion(db)).heygen.avatares
}
