import { palabras } from "@/lib/dominio/estimaciones"
import { MAXIMO_PALABRAS, MINIMO_PALABRAS } from "@/lib/dominio/revision"

// The editorial line asks for 30 to 60 s, 75 to 150 words: about 2.5 words per second.
export const PALABRAS_POR_SEGUNDO = 2.5

export function contarPalabras(texto: string): number {
  return palabras(texto).length
}

export function estimarSegundos(texto: string): number {
  return Math.round(contarPalabras(texto) / PALABRAS_POR_SEGUNDO)
}

export function estadoDeLargo(cantidad: number): "corto" | "bien" | "largo" {
  if (cantidad < MINIMO_PALABRAS) return "corto"
  if (cantidad > MAXIMO_PALABRAS) return "largo"
  return "bien"
}
