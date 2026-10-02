import { createHash } from "node:crypto"
import { instanteEstricto, MARGEN_HORA_APROBADA_MS, type Pieza } from "@/lib/dominio/estados"

// A JSON array keeps field boundaries unambiguous ("a|b" + "c" never equals "a" + "b|c").
function sha256(partes: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex")
}

/**
 * Gate 1 binds what costs video credits: the approved script, the exact voice audio and the avatar Coni chose. The
 * caption is bound by gate 2 (accepted change A11, finding R2-5), so fixing it never forces a re-render.
 * A piece without a chosen avatar (approved before the choice existed) keeps the hash it was approved with.
 */
export function hashPuerta1(artefacto: { guion: string; audioId: string; avatarId?: string | null }): string {
  const base = ["puerta1", artefacto.guion, artefacto.audioId]
  return sha256(artefacto.avatarId ? [...base, artefacto.avatarId] : base)
}

export function hashTexto(texto: string): string {
  return sha256(["texto", texto])
}

/** Gate 2 binds the exact video, caption and time; the publish key is built from it so each approval has its own. */
export function hashPuerta2(aprobacion: { videoId: string; hashTexto: string; publicarEn: string }): string {
  return sha256(["puerta2", aprobacion.videoId, aprobacion.hashTexto, aprobacion.publicarEn])
}

export type Paso = "producir" | "grabar" | "publicar"

/**
 * Same piece, step, approved artifact and attempt: same key, so a blind retry is deduplicated.
 * Regrabar, retries after an error and date changes bump the attempt (finding R2-1).
 */
export function claveIdempotencia(clave: { piezaId: string; paso: Paso; hash: string; intento: number }): string {
  // A NaN or fractional attempt, or a non-SHA-256 hash, would make every retry reuse the same key.
  if (!Number.isSafeInteger(clave.intento) || clave.intento < 0) {
    throw new Error(`Intento inválido para la clave de idempotencia: ${clave.intento}`)
  }
  if (!/^[0-9a-f]{64}$/.test(clave.hash)) {
    throw new Error("El hash del artefacto debe ser un SHA-256 en hexadecimal.")
  }
  return `${clave.piezaId}:${clave.paso}:${clave.hash.slice(0, 16)}:${clave.intento}`
}

export type Veredicto =
  | { ok: true }
  | { ok: false; motivo: "estado" | "sin_aprobacion" | "artefacto_cambio" | "antes_de_hora" | "hora_vencida" }

const no = (motivo: Exclude<Veredicto, { ok: true }>["motivo"]): Veredicto => ({ ok: false, motivo })

/** The render task calls this right before spending HeyGen credits. */
export function puedeGrabar(pieza: Pieza, hashActual: string): Veredicto {
  if (pieza.estado !== "en_render") return no("estado")
  if (!pieza.puerta1) return no("sin_aprobacion")
  if (pieza.puerta1.hash !== hashActual) return no("artefacto_cambio")
  return { ok: true }
}

/** What both exits of a scheduled piece (publish, hand over for manual upload) require of what Coni approved. */
function aprobacionVigente(pieza: Pieza, hashTextoActual: string): Veredicto {
  if (pieza.estado !== "programado") return no("estado")
  const aprobacion = pieza.puerta2
  if (!aprobacion) return no("sin_aprobacion")
  if (aprobacion.videoId !== pieza.videoId || aprobacion.hashTexto !== hashTextoActual) return no("artefacto_cambio")
  return { ok: true }
}

/** The publish task calls this right before publishing; it never publishes at an unapproved time. */
export function puedePublicar(pieza: Pieza, actual: { hashTexto: string; ahora: string }): Veredicto {
  const vigente = aprobacionVigente(pieza, actual.hashTexto)
  if (!vigente.ok || !pieza.puerta2) return vigente
  const ahora = instanteEstricto(actual.ahora)
  const publicarEn = instanteEstricto(pieza.puerta2.publicarEn)
  // An unreadable or zone-less time never publishes: Date.parse would guess a zone, and NaN compares false both ways.
  if (!ahora || !publicarEn) return no("hora_vencida")
  const atraso = Date.parse(ahora) - Date.parse(publicarEn)
  if (atraso < 0) return no("antes_de_hora")
  if (atraso > MARGEN_HORA_APROBADA_MS) return no("hora_vencida")
  return { ok: true }
}

/**
 * Instagram is not connected: at the approved time the piece is handed to Coni to upload herself. Nothing is published,
 * so a late hour is no risk and there is no 30-minute window; the piece still never leaves before its time and still
 * has to be what she approved.
 */
export function puedeEntregarseParaSubir(pieza: Pieza, actual: { hashTexto: string; ahora: string }): Veredicto {
  const vigente = aprobacionVigente(pieza, actual.hashTexto)
  if (!vigente.ok || !pieza.puerta2) return vigente
  const ahora = instanteEstricto(actual.ahora)
  const publicarEn = instanteEstricto(pieza.puerta2.publicarEn)
  if (!ahora || !publicarEn || Date.parse(ahora) < Date.parse(publicarEn)) return no("antes_de_hora")
  return { ok: true }
}
