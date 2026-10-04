// lib/dominio/voz.ts
import { createHash } from "node:crypto"

/** What ElevenLabs is asked for besides the text: anything here changes the audio, so it is in the fingerprint. */
export interface VozConfigurada {
  voiceId: string | null
  modelId: string
  outputFormat: string
  ajustes?: Readonly<Record<string, number | boolean>> | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/

// Sorted pairs: the same settings written in another order are the same voice.
function ajustesCanonicos(ajustes: VozConfigurada["ajustes"]): string {
  if (!ajustes || Object.keys(ajustes).length === 0) return ""
  return JSON.stringify(
    Object.keys(ajustes)
      .sort()
      .map((clave) => [clave, ajustes[clave]]),
  )
}

/**
 * The identity of a voice: the exact text spoken and everything that shapes the audio. Two approvals of the same text
 * with the same voice have the same fingerprint, so the second one reuses the first voice instead of paying again.
 */
export function huellaDeVoz(entrada: { guion: string; voz: VozConfigurada }): string {
  const { guion, voz } = entrada
  const partes = ["voz/1", guion, voz.voiceId ?? "", voz.modelId, voz.outputFormat, ajustesCanonicos(voz.ajustes)]
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex")
}

function exigirPartes(piezaId: string, huella: string): void {
  if (!UUID.test(piezaId)) throw new Error(`El id de la pieza no es un UUID: ${piezaId}`)
  if (!SHA256.test(huella)) throw new Error("La huella de la voz debe ser un SHA-256 en hexadecimal.")
}

/** Every take of one fingerprint starts like this; `t-` keeps them apart from the older content and approval keys. */
export function prefijoDeTomas(piezaId: string, huella: string): string {
  exigirPartes(piezaId, huella)
  return `voces/${piezaId}/t-${huella}-`
}

/** One take: the piece's attempt when the voice was made. "Volver a grabar voz" is a new attempt, so a new take. */
export function claveDeToma(piezaId: string, huella: string, toma: number): string {
  if (!Number.isSafeInteger(toma) || toma < 0) throw new Error(`Toma inválida: ${toma}`)
  return `${prefijoDeTomas(piezaId, huella)}${toma}.mp3`
}

/** The newest take of this fingerprint among `claves` (a listing of the store), or null. */
export function ultimaToma(claves: readonly string[], piezaId: string, huella: string): string | null {
  const prefijo = prefijoDeTomas(piezaId, huella)
  let mejor: { clave: string; toma: number } | null = null
  for (const clave of claves) {
    if (!clave.startsWith(prefijo) || !clave.endsWith(".mp3")) continue
    const numero = clave.slice(prefijo.length, -".mp3".length)
    if (!/^\d+$/.test(numero)) continue
    const toma = Number(numero)
    if (mejor === null || toma > mejor.toma) mejor = { clave, toma }
  }
  return mejor?.clave ?? null
}

/**
 * The stored voice when it speaks this exact text with this voice, or null. `legadas` are older keys the caller can
 * vouch for (the approval key of the current gate 1, which was generated for the approved script).
 */
export function vozDelGuion(entrada: {
  audioId: string | null
  piezaId: string
  huella: string
  legadas?: readonly string[]
}): string | null {
  const { audioId } = entrada
  if (audioId === null) return null
  if (audioId.startsWith(prefijoDeTomas(entrada.piezaId, entrada.huella)) && audioId.endsWith(".mp3")) return audioId
  return (entrada.legadas ?? []).includes(audioId) ? audioId : null
}
