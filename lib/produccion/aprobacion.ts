import type { FilaDePieza } from "@/lib/datos/repositorio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { type ArtefactoPuerta1, formulaDePuerta1 } from "@/lib/dominio/puertas"
import { huellaDeRespaldo } from "@/lib/dominio/respaldo"

/** The column is a smallint with a check for 1, 2 and 3; anything else is a corrupted row, not an approval. */
export function formulaGuardada(fila: FilaDePieza): 1 | 2 | 3 | null {
  const { puerta1_formula: formula } = fila
  if (formula === null || formula === 1 || formula === 2 || formula === 3) return formula
  throw new FallaDeConfiguracion(`La pieza ${fila.id} guardó una fórmula de la puerta 1 desconocida: ${formula}.`)
}

/**
 * What gate 1 hashed, rebuilt from the row by the formula stored at approval (null is the legacy one, with the voice
 * in the hash). Null when a column the formula needs is empty, which is not an approval.
 */
export function artefactoAprobado(fila: FilaDePieza, guion: string): ArtefactoPuerta1 | null {
  const formula = formulaDePuerta1(formulaGuardada(fila))
  if (formula === 1) {
    return fila.audio_id === null ? null : { formula: 1, guion, audioId: fila.audio_id, avatarId: fila.avatar_id }
  }
  if (fila.texto === null || fila.avatar_id === null) return null
  if (formula === 2) return { formula: 2, guion, texto: fila.texto, avatarId: fila.avatar_id }
  return {
    formula: 3,
    guion,
    texto: fila.texto,
    avatarId: fila.avatar_id,
    respaldo: huellaDeRespaldo(leerRespaldo(fila.respaldo)),
  }
}
