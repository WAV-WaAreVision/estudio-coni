import { createHash } from "node:crypto"

// A JSON array keeps field boundaries unambiguous ("a|b" + "c" never equals "a" + "b|c").
function sha256(partes: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex")
}

/**
 * Gate 1 binds what costs video credits: the approved script and the exact voice audio. The caption
 * is bound by gate 2 (accepted change A11, finding R2-5), so fixing it never forces a re-render.
 */
export function hashPuerta1(artefacto: { guion: string; audioId: string }): string {
  return sha256(["puerta1", artefacto.guion, artefacto.audioId])
}

export function hashTexto(texto: string): string {
  return sha256(["texto", texto])
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
