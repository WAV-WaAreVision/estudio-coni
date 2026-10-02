import { palabras } from "@/lib/dominio/estimaciones"
import { MAXIMO_PALABRAS, MINIMO_PALABRAS } from "@/lib/dominio/revision"

// One formula for the editor counter and for the costs: the editor must agree with what gets billed.
export { estimarSegundos } from "@/lib/dominio/estimaciones"

export function contarPalabras(texto: string): number {
  return palabras(texto).length
}

export function estadoDeLargo(cantidad: number): "corto" | "bien" | "largo" {
  if (cantidad < MINIMO_PALABRAS) return "corto"
  if (cantidad > MAXIMO_PALABRAS) return "largo"
  return "bien"
}
