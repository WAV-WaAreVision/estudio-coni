// "Watched" means 95 percent of the media played through, without counting jumps forward (design, Pass 2).
// The player reports where it is a few times a second; only steps that look like playing count.

export interface Visionado {
  /** How far she has watched without skipping: the frontier of the contiguous part played from the start. */
  alcanzado: number
  /** Where the last report said the player was. */
  ultimo: number
}

/** A normal report moves a quarter of a second; a busy phone can leave a second or more between two. */
const SALTO_NATURAL_MAXIMO_S = 1.5
const UMBRAL = 0.95

export function iniciarVisionado(): Visionado {
  return { alcanzado: 0, ultimo: 0 }
}

export function avanzar(visionado: Visionado, tiempo: number): Visionado {
  const avance = tiempo - visionado.ultimo
  const jugando = avance > 0 && avance <= SALTO_NATURAL_MAXIMO_S
  // Playing on from a place she jumped to, beyond what she watched, does not extend what she watched.
  const dentroDeLoVisto = visionado.ultimo <= visionado.alcanzado + SALTO_NATURAL_MAXIMO_S
  return {
    alcanzado: jugando && dentroDeLoVisto ? Math.max(visionado.alcanzado, tiempo) : visionado.alcanzado,
    ultimo: tiempo,
  }
}

export function terminado(visionado: Visionado, duracion: number): boolean {
  return Number.isFinite(duracion) && duracion > 0 && visionado.alcanzado >= duracion * UMBRAL
}
