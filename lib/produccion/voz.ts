import type { SupabaseClient } from "@supabase/supabase-js"
import { confirmarGasto, type FilaDePieza, leerSecreto, liberarGasto, reservarGasto } from "@/lib/datos/repositorio"
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

export function claveDeGastoDeVoz(piezaId: string, huella: string, intento: number): string {
  return claveIdempotencia({ piezaId, paso: "voz", hash: huella, intento })
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
}

export type VozAsegurada = { tipo: "lista"; audioId: string } | { tipo: "tope" }

/**
 * The voice of `guion` for this piece, paid at most once per text and voice. In order: the take of this attempt if a
 * dead run already stored it; unless `nueva`, the newest earlier take of the same text; only then a reservation, one
 * ElevenLabs call, the upload and the confirmation. The caller writes the audio id into the piece.
 */
export async function asegurarVoz(
  deps: DepsVoz,
  entrada: { fila: FilaDePieza; guion: string; config: ConfigElevenlabs; llave: () => Promise<string>; nueva: boolean },
): Promise<VozAsegurada> {
  const { fila, guion, config } = entrada
  const huella = huellaDelGuion(guion, config)
  const exacta = claveDeToma(fila.id, huella, fila.intento)
  if (await deps.almacen.existe(exacta)) return { tipo: "lista", audioId: exacta }
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
  const clave = claveDeGastoDeVoz(fila.id, huella, fila.intento)
  const texto = textoParaVoz(guion, config.model_id)
  const estimado = estimarCostoVoz(texto)
  const reserva = await reservarGasto(deps.db, {
    piezaId: fila.id,
    proveedor: "elevenlabs",
    paso: "voz",
    estimadoUsd: estimado,
    clave,
    ahora: deps.ahora(),
  })
  if (reserva.tope) return { tipo: "tope" }
  if (reserva.gasto.estado !== "reservado") {
    // Confirmed only after the upload, and each attempt has its own key: a closed reservation without the take is a bug.
    throw new FallaDeConfiguracion(
      `La reserva de la voz de la pieza ${fila.id} está ${reserva.gasto.estado}, pero la toma no está guardada.`,
    )
  }
  let audio: Uint8Array
  try {
    audio = await generarVoz({ clave: llave, config, texto, base: deps.base?.elevenlabs })
  } catch (error) {
    // A refusal (4xx) made no audio and billed nothing: the money goes back to the cap now, and the screen may say so.
    // Anything else may have been billed: the reservation stays, and the sweeper frees it after an hour with no take.
    if (rechazoSinCobro(error)) await liberarGasto(deps.db, clave, { sinCobro: true })
    throw error
  }
  await deps.almacen.subir(exacta, audio, "audio/mpeg")
  await confirmarGasto(deps.db, clave, estimado)
  return { tipo: "lista", audioId: exacta }
}
