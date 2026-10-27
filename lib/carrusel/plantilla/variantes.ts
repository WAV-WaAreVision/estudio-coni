import type { Variante } from "@/lib/dominio/diseno-carrusel"

/**
 * The slides' own palette (design 2026-10-26, C7; decision P4). The template is its own design, published as a
 * document on LinkedIn, so it carries its own colours and not the app's tokens: this folder is the only place in the
 * repo where hex colours are allowed.
 */
export const COLORES: Record<Variante, { papel: string; tinta: string; suave: string; acento: string }> = {
  crema: { papel: "#F4EFE6", tinta: "#2B2420", suave: "#6B5F55", acento: "#9A3F2C" },
  piedra: { papel: "#E3E0D9", tinta: "#22262B", suave: "#5A5F66", acento: "#4F5D4A" },
  oscura: { papel: "#1E1B19", tinta: "#F2ECE2", suave: "#B9AFA3", acento: "#E0A96D" },
}
