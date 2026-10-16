import { TEXTO_SIN_AVATARES } from "@/components/elegir-avatar"
import { revisarPendientes } from "@/lib/diseno/revision"
import type { Hallazgo } from "@/lib/dominio/revision"

export interface EstadoDeLaFirma {
  sinGuardar: boolean
  /** Her voice of this text is being made. */
  preparando: boolean
  /** The take of her voice on the screen; null when there is none. */
  voz: string | null
  /** The take she heard to the end. */
  escuchada: string | null
  bloqueos: number
  /** The warnings she has not ticked yet. */
  sinRevisar: readonly Hallazgo[]
  sinAvatares: boolean
  avatarElegido: boolean
  /** HeyGen's balance or the month's cap cannot cover the video (today's text). */
  bloqueoVideo: string | null
}

export type FaltaParaFirmar = { tipo: "nada" } | { tipo: "bloqueo"; texto: string } | { tipo: "falta"; cosas: string[] }

/**
 * What keeps gate 1's signature closed (decision 9, step 7). A balance, the cap or no looks at all is a block, said
 * whole; otherwise every missing item, in the order she would do them, for the "Falta:" line.
 */
export function faltaParaFirmar(estado: EstadoDeLaFirma): FaltaParaFirmar {
  if (estado.bloqueoVideo !== null) return { tipo: "bloqueo", texto: estado.bloqueoVideo }
  if (estado.sinAvatares) return { tipo: "bloqueo", texto: TEXTO_SIN_AVATARES }
  const voz = estado.preparando
    ? "que termine tu voz"
    : estado.voz === null
      ? "preparar tu voz"
      : estado.escuchada !== estado.voz
        ? "escuchar tu voz"
        : null
  const cosas = [
    estado.sinGuardar ? "guardar tus cambios" : null,
    voz,
    estado.bloqueos > 0 ? "corregir el guion" : null,
    revisarPendientes(estado.sinRevisar),
    estado.avatarElegido ? null : "elegir el avatar",
  ].filter((cosa): cosa is string => cosa !== null)
  return cosas.length === 0 ? { tipo: "nada" } : { tipo: "falta", cosas }
}
