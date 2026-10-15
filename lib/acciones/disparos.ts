import { claveIdempotencia, hashTexto } from "@/lib/dominio/puertas"

/**
 * The background runs the app starts. The key makes a double tap, a retry or a second device start the work once
 * (Trigger.dev deduplicates by it with `scope: "global"`); the real implementation lives in `disparos-reales.ts`.
 */
export interface Disparos {
  producir(piezaId: string, clave: string): Promise<void>
  /** `retraso`: when to start, as Trigger.dev reads it ("10s"); the signature waits out the undo window this way. */
  grabar(piezaId: string, clave: string, retraso?: string): Promise<void>
  /** `nueva`: Coni asked to record again, so an earlier take of the same text is not reused. */
  voz(piezaId: string, clave: string, nueva: boolean): Promise<void>
}

interface FilaParaClave {
  id: string
  version: number
  intento: number
  puerta1_hash: string | null
}

/** One script round: `intento` changes when Coni asks for changes, `version` when a run left a reason on the piece. */
export function claveProducir(fila: FilaParaClave): string {
  return claveIdempotencia({
    piezaId: fila.id,
    paso: "producir",
    hash: hashTexto(`ronda:${fila.version}`),
    intento: fila.intento,
  })
}

/** One recording: the approved script (gate 1) and the attempt, which Regrabar and Reintentar bump. */
export function claveGrabar(fila: FilaParaClave): string {
  if (fila.puerta1_hash === null) {
    throw new Error(`La pieza ${fila.id} se manda a grabar sin guion aprobado.`)
  }
  return claveIdempotencia({ piezaId: fila.id, paso: "grabar", hash: fila.puerta1_hash, intento: fila.intento })
}

/** One voice request: the approval and the attempt, which every "Grabar voz" bumps. */
export function claveVoz(fila: FilaParaClave): string {
  if (fila.puerta1_hash === null) {
    throw new Error(`La pieza ${fila.id} pide su voz sin guion aprobado.`)
  }
  return claveIdempotencia({ piezaId: fila.id, paso: "voz", hash: fila.puerta1_hash, intento: fila.intento })
}
