// app/(app)/video/[id]/falta-para-firmar.ts
import { revisarPendientes } from "@/lib/diseno/revision"
import { DESTINOS, type Destino, nombreDeDestinos } from "@/lib/dominio/destinos"
import type { Hallazgo } from "@/lib/dominio/revision"

export interface EstadoDeLaFirmaDelVideo {
  /** She watched the whole video. */
  visto: boolean
  /** "Revisé labios, nombre, subtítulos y cortes". */
  revisado: boolean
  /** LinkedIn is chosen and its text is only a starting point she has not saved. */
  linkedinSinGuardar: boolean
  /** An editor of the caption or the LinkedIn text is open. */
  editando: boolean
  bloqueos: number
  /** The warnings she has not ticked, among those that count for the chosen destinations. */
  sinRevisar: readonly Hallazgo[]
  hayFecha: boolean
}

export type FaltaParaFirmarVideo =
  | { tipo: "nada" }
  | { tipo: "bloqueo"; texto: string }
  | { tipo: "falta"; cosas: string[] }

export const SIN_HORARIO = "No hay un horario libre. Avísale a Federico."

/** Gate 2 when nothing is missing (decision 11, step 8): what she did, each with its check. */
export const LISTO_PARA_FIRMAR = ["Video visto", "Texto"] as const

/** What keeps gate 2's signature closed (decision 11, step 8): a missing slot is a block, the rest a "Falta:" list. */
export function faltaParaFirmarVideo(estado: EstadoDeLaFirmaDelVideo): FaltaParaFirmarVideo {
  if (!estado.hayFecha) return { tipo: "bloqueo", texto: SIN_HORARIO }
  const cosas = [
    estado.visto ? null : "terminar el video",
    estado.revisado ? null : "marcar lo que revisaste",
    estado.linkedinSinGuardar ? "guardar el texto para LinkedIn" : null,
    estado.editando ? "guardar o cancelar la edición del texto" : null,
    estado.bloqueos > 0 ? "corregir el texto" : null,
    revisarPendientes(estado.sinRevisar),
  ].filter((cosa): cosa is string => cosa !== null)
  return cosas.length === 0 ? { tipo: "nada" } : { tipo: "falta", cosas }
}

/** The meta line of gate 2's "Más opciones" (decision 11, step 7): what she can still add, and the re-recording. */
export function resumenDeMasOpciones(elegidos: readonly Destino[]): string {
  const faltan = DESTINOS.filter((destino) => !elegidos.includes(destino))
  return faltan.length > 0 ? `${nombreDeDestinos(faltan)}, regrabar video` : "Destinos, regrabar video"
}
