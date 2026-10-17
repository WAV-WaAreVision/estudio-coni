import type { SupabaseClient } from "@supabase/supabase-js"
import {
  confirmarGasto,
  type FilaDePieza,
  leerReservasAbiertasDeVoz,
  leerSecreto,
  liberarGasto,
  reservarGasto,
} from "@/lib/datos/repositorio"
import { textoParaVoz } from "@/lib/dominio/etiquetas"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveIdempotencia } from "@/lib/dominio/puertas"
import { claveDeToma, huellaDeVoz, prefijoDeTomas, ultimaToma, type VozConfigurada } from "@/lib/dominio/voz"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { ConfigCompleta, ConfigElevenlabs } from "@/lib/proveedores/config"
import { generarVoz, rechazoSinCobro } from "@/lib/proveedores/elevenlabs"
import type { Database } from "@/lib/supabase/database.types"

export function vozDe(config: ConfigElevenlabs): VozConfigurada {
  return {
    voiceId: config.voice_id,
    modelId: config.model_id,
    outputFormat: config.output_format,
    ajustes: config.voice_settings ?? null,
  }
}

/**
 * The fingerprint of this script spoken with the configured voice. It hashes the text ElevenLabs actually receives
 * (marks kept or stripped by model), so a take is reused only when the audio would be the same. A script without marks
 * hashes exactly as before.
 */
export function huellaDelGuion(guion: string, config: ConfigElevenlabs): string {
  return huellaDeVoz({ guion: textoParaVoz(guion, config.model_id), voz: vozDe(config) })
}

/**
 * The spend key of one paid try of an attempt. `cobro` 0 is the attempt's own key; a try after a paid audio whose take
 * was lost on upload is `:r1`, `:r2`, ... and counts again, because it is paid again. The sweeper reads this format
 * (`lib/mantenimiento/gastos.ts`).
 */
export function claveDeGastoDeVoz(piezaId: string, huella: string, intento: number, cobro = 0): string {
  if (!Number.isSafeInteger(cobro) || cobro < 0) throw new Error(`Cobro inválido para la clave de la voz: ${cobro}`)
  const base = claveIdempotencia({ piezaId, paso: "voz", hash: huella, intento })
  return cobro === 0 ? base : `${base}:r${cobro}`
}

/** What Coni reads when her voice could not be made; the screen offers "Preparar mi voz" next to it. */
export const TEXTO_SIN_VOZ = "No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz."

export async function leerLlaveDeVoz(db: SupabaseClient<Database>, config: ConfigCompleta): Promise<string> {
  if (!config.elevenlabs.voice_id) {
    throw new FallaDeConfiguracion("Falta elevenlabs.voice_id en la configuración de producción.")
  }
  const llave = await leerSecreto(db, "elevenlabs")
  if (!llave) throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de ElevenLabs en Ajustes.")
  return llave
}

export interface DepsVoz {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  almacen: Almacen
  ahora: () => string
  base?: { elevenlabs?: string }
  /** Pause between upload retries; tests pass one that does not sleep. */
  esperar?: (ms: number) => Promise<void>
}

export type VozAsegurada = { tipo: "lista"; audioId: string } | { tipo: "tope" }

const REINTENTOS_DE_SUBIDA = 3
const ESPERA_DE_SUBIDA_MS = 1_000

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms))

/**
 * The audio was paid the moment ElevenLabs returned it, so it is uploaded from memory up to three more times. If the
 * store still fails, the reservation is confirmed before the error goes on: the cap must count what was paid.
 */
async function guardarTomaPagada(
  deps: DepsVoz,
  entrada: { toma: string; audio: Uint8Array; clave: string; estimado: number },
): Promise<void> {
  const esperar = deps.esperar ?? dormir
  let ultimoError: unknown
  for (let vez = 0; vez <= REINTENTOS_DE_SUBIDA; vez += 1) {
    if (vez > 0) await esperar(ESPERA_DE_SUBIDA_MS * 2 ** (vez - 1))
    try {
      await deps.almacen.subir(entrada.toma, entrada.audio, "audio/mpeg")
      return
    } catch (error) {
      ultimoError = error
    }
  }
  try {
    await confirmarUnaVezMas(deps, entrada.clave, entrada.estimado)
  } catch (confirmacion) {
    throw new Error("No pude guardar la toma ni confirmar su gasto.", { cause: { subida: ultimoError, confirmacion } })
  }
  throw ultimoError
}

/**
 * The confirmation that counts a paid audio is tried twice: losing it would leave paid money as only reserved (the
 * sweeper or the next try still confirms it). The error carries both failures.
 */
async function confirmarUnaVezMas(deps: DepsVoz, clave: string, estimado: number): Promise<void> {
  try {
    await confirmarGasto(deps.db, clave, estimado)
  } catch (primera) {
    console.error(`No pude confirmar el gasto de la voz ${clave}; lo intento otra vez`, primera)
    try {
      await confirmarGasto(deps.db, clave, estimado)
    } catch (segunda) {
      throw new Error(`No pude confirmar el gasto de la voz ${clave}.`, { cause: { primera, segunda } })
    }
  }
}

/** Paid takes lost on upload before the attempt stops paying (the attempt's own key and three more). */
const TOMAS_PERDIDAS_MAXIMAS = 4
/** Keys looked at in all: open and swept ones are stepped past, an outage must not jam the attempt for good. */
const CLAVES_MAXIMAS = 12

/**
 * The reservation this try may call ElevenLabs under, so every call is counted once. The attempt's key, reopened after
 * a refusal; or the next `:r<n>` key when the previous one is taken: still `reservado` by another try (unknown outcome,
 * it stays for the sweeper), released by the sweeper, or confirmed without its take. Only the last kind is a lost paid
 * take and counts toward the stop.
 */
async function reservarIntento(
  deps: DepsVoz,
  entrada: { fila: FilaDePieza; huella: string; estimado: number; toma: string },
): Promise<{ tipo: "tope" } | { tipo: "lista" } | { tipo: "reservada"; clave: string }> {
  const { fila, huella, estimado } = entrada
  // This try's own token: a reservation is ours only if it comes back with it (another run may hold the same key).
  const token = crypto.randomUUID()
  let perdidas = 0
  for (let cobro = 0; cobro < CLAVES_MAXIMAS; cobro += 1) {
    const clave = claveDeGastoDeVoz(fila.id, huella, fila.intento, cobro)
    const reserva = await reservarGasto(deps.db, {
      piezaId: fila.id,
      proveedor: "elevenlabs",
      paso: "voz",
      estimadoUsd: estimado,
      clave,
      ahora: deps.ahora(),
      // Only a key released as a refusal (sin_cobro) reopens; a sweeper release stays closed and comes back `liberado`.
      reabrir: true,
      reservadoPor: token,
    })
    if (reserva.tope) return { tipo: "tope" }
    // Reserved by another try (unknown outcome, or still running): calling again under it would go uncounted.
    if (reserva.gasto.estado === "reservado" && reserva.gasto.reservado_por === token)
      return { tipo: "reservada", clave }
    if (reserva.gasto.estado === "confirmado") {
      // A run that ended meanwhile may have stored the take and confirmed: then that paid audio is the voice.
      if (await deps.almacen.existe(entrada.toma)) return { tipo: "lista" }
      perdidas += 1
      if (perdidas >= TOMAS_PERDIDAS_MAXIMAS) {
        throw new FallaDeConfiguracion(
          `La voz de la pieza ${fila.id} ya pagó ${TOMAS_PERDIDAS_MAXIMAS} tomas que no se pudieron guardar.`,
        )
      }
    }
  }
  throw new FallaDeConfiguracion(
    `La voz de la pieza ${fila.id} ya usó ${CLAVES_MAXIMAS} reservas de voz (pagadas, abiertas o barridas) sin guardar la toma.`,
  )
}

/**
 * The voice of `guion` for this piece, paid at most once per text and voice. In order: the take of this attempt if a
 * dead run already stored it; unless `nueva`, the newest earlier take of the same text; only then a reservation
 * (reopened after a refusal, a new key after a paid take that was lost), one ElevenLabs call, the upload with retries
 * and the confirmation. The caller writes the audio id into the piece.
 */
export async function asegurarVoz(
  deps: DepsVoz,
  entrada: { fila: FilaDePieza; guion: string; config: ConfigElevenlabs; llave: () => Promise<string>; nueva: boolean },
): Promise<VozAsegurada> {
  const { fila, guion, config } = entrada
  const huella = huellaDelGuion(guion, config)
  const exacta = claveDeToma(fila.id, huella, fila.intento)
  if (await deps.almacen.existe(exacta)) {
    // A run that died between the upload and the confirmation left its paid audio only reserved: count it now.
    const abiertas = await leerReservasAbiertasDeVoz(deps.db, {
      piezaId: fila.id,
      claveDelIntento: claveDeGastoDeVoz(fila.id, huella, fila.intento),
    })
    for (const gasto of abiertas) await confirmarGasto(deps.db, gasto.clave, gasto.estimado_usd)
    return { tipo: "lista", audioId: exacta }
  }
  if (!entrada.nueva) {
    const tomas = await deps.almacen.listar(prefijoDeTomas(fila.id, huella))
    const previa = ultimaToma(
      tomas.map((toma) => toma.clave),
      fila.id,
      huella,
    )
    if (previa !== null) return { tipo: "lista", audioId: previa }
  }

  // Before reserving: a missing key or voice id is a setup error and must not leave a reservation behind.
  const llave = await entrada.llave()
  const texto = textoParaVoz(guion, config.model_id)
  const estimado = estimarCostoVoz(texto)
  const reserva = await reservarIntento(deps, { fila, huella, estimado, toma: exacta })
  if (reserva.tipo === "tope") return { tipo: "tope" }
  if (reserva.tipo === "lista") return { tipo: "lista", audioId: exacta }
  const { clave } = reserva
  let audio: Uint8Array
  try {
    audio = await generarVoz({ clave: llave, config, texto, base: deps.base?.elevenlabs })
  } catch (error) {
    // A refusal (4xx) made no audio and billed nothing: the money goes back to the cap now, and the screen may say so.
    // Anything else may have been billed: the reservation stays, and the sweeper frees it after an hour with no take.
    if (rechazoSinCobro(error)) await liberarGasto(deps.db, clave, { sinCobro: true })
    throw error
  }
  await guardarTomaPagada(deps, { toma: exacta, audio, clave, estimado })
  await confirmarUnaVezMas(deps, clave, estimado)
  return { tipo: "lista", audioId: exacta }
}
