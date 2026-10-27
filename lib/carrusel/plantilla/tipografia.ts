import type { Lamina } from "@/lib/dominio/carrusel"

/** LinkedIn's 4:5 document page (design 2026-10-26, D4). */
export const ANCHO = 1080
export const ALTO = 1350

/**
 * The letter size of a slide, by its type and length (plan amendment 4). The template never shrinks text by itself, so a
 * text that does not fit overflows its box and the renderer can measure it.
 */
export function tamanoDeLetra(lamina: Lamina): number {
  const largo = [...lamina.texto].length
  switch (lamina.tipo) {
    case "portada":
      return largo <= 50 ? 104 : largo <= 80 ? 88 : 76
    case "cierre":
      return largo <= 80 ? 72 : largo <= 120 ? 62 : 54
    case "idea":
      return largo <= 90 ? 72 : largo <= 160 ? 60 : 52
  }
}
