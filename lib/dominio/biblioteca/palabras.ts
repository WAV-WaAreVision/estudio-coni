/**
 * Fix 4h: Coni reads her words; the technical ones go under "Detalle para WAV". From the pedido's PALABRAS_SIMPLES
 * and the spec of 29b. A unit test keeps the old words out of every screen of app/(app)/biblioteca.
 */
export const PALABRAS = {
  papel: "¿Quién es para ti?",
  afirmaciones: "Ideas sacadas",
  tiposDeAfirmacion: "Qué tipo de idea es",
  detalle: "Detalle para WAV",
} as const

export const REEMPLAZOS: readonly { antes: string; ahora: string }[] = [
  { antes: "Papel", ahora: PALABRAS.papel },
  { antes: "Afirmaciones", ahora: PALABRAS.afirmaciones },
  { antes: "Tipos de afirmación", ahora: PALABRAS.tiposDeAfirmacion },
]

/** Words that only ever appear inside "Detalle para WAV" (the score arrives with Semana, batch 5). */
export const SOLO_PARA_WAV = ["Puntaje", "Evidencia"] as const

export function ideasSacadas(cantidad: number): string {
  return cantidad === 1 ? "1 idea sacada" : `${cantidad} ideas sacadas`
}
