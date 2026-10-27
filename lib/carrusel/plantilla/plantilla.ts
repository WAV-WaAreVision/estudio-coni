import { FIRMA_DEL_CARRUSEL, type Lamina } from "@/lib/dominio/carrusel"
import type { Variante } from "@/lib/dominio/diseno-carrusel"
import { ALTO, ANCHO, tamanoDeLetra } from "./tipografia"
import { COLORES } from "./variantes"

/** The family name the template gives the committed serif (assets/fuentes/carrusel). */
export const FAMILIA_DEL_CARRUSEL = "Serif del carrusel"

export interface EntradaDePlantilla {
  laminas: readonly Lamina[]
  variante: Variante
  /** `Constanza del Rosario · <pilar corto>` (`marcaDelCarrusel`). */
  marca: string
  /** The serif as a data URL (`fuenteDelCarrusel`): nothing is fetched while rendering. */
  fuente: string
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (caracter) => ESCAPES[caracter] ?? caracter)
}

/** The slide's text with its highlighted word in the accent: the first time it appears as a whole word. */
export function textoConDestacado(texto: string, destacado: string | undefined): string {
  if (destacado === undefined) return escapar(texto)
  for (const palabra of texto.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (palabra[0] === destacado && palabra.index !== undefined) {
      const fin = palabra.index + palabra[0].length
      return `${escapar(texto.slice(0, palabra.index))}<span class="destacado">${escapar(palabra[0])}</span>${escapar(texto.slice(fin))}`
    }
  }
  return escapar(texto)
}

/** The brand line on every slide (C11, decision P5): her full name and the pillar's short name. */
export function marcaDelCarrusel(pilarCorto: string | null): string {
  return pilarCorto ? `${FIRMA_DEL_CARRUSEL} · ${pilarCorto}` : FIRMA_DEL_CARRUSEL
}

function estilos(variante: Variante, fuente: string): string {
  const color = COLORES[variante]
  return `
@font-face { font-family: "${FAMILIA_DEL_CARRUSEL}"; src: url("${fuente}") format("truetype"); font-weight: 200 800; font-display: block; }
@page { size: ${ANCHO}px ${ALTO}px; margin: 0; }
:root { --papel: ${color.papel}; --tinta: ${color.tinta}; --suave: ${color.suave}; --acento: ${color.acento}; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--papel); }
body { font-family: "${FAMILIA_DEL_CARRUSEL}", serif; color: var(--tinta); font-kerning: normal; -webkit-font-smoothing: antialiased; }
.lamina { width: ${ANCHO}px; height: ${ALTO}px; padding: 96px 96px 88px; display: flex; flex-direction: column; gap: 56px; background: var(--papel); overflow: hidden; }
.lamina + .lamina { break-before: page; }
.marca { display: flex; justify-content: space-between; align-items: baseline; gap: 32px; font-size: 24px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--suave); }
.contador { font-variant-numeric: tabular-nums; letter-spacing: 0.08em; }
.caja { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
.caja p { line-height: 1.22; font-weight: 400; text-wrap: pretty; }
.lamina--portada .caja p { font-weight: 600; line-height: 1.08; letter-spacing: -0.01em; }
.lamina--portada .caja::before { content: ""; display: block; width: 120px; border-top: 4px solid var(--acento); margin-bottom: 48px; }
.destacado { color: var(--acento); font-weight: 600; }
.pie { min-height: 36px; font-size: 26px; line-height: 1.35; color: var(--suave); }
`
}

function seccion(lamina: Lamina, indice: number, total: number, marca: string): string {
  const pie =
    lamina.tipo === "portada"
      ? "Desliza para leer"
      : lamina.tipo === "cierre" && lamina.fuente !== undefined
        ? escapar(lamina.fuente)
        : ""
  return `<section class="lamina lamina--${lamina.tipo}" data-lamina="${indice}">
<header class="marca"><span>${escapar(marca)}</span><span class="contador">${indice + 1} / ${total}</span></header>
<div class="caja" data-texto><p style="font-size: ${tamanoDeLetra(lamina)}px">${textoConDestacado(lamina.texto, lamina.destacado)}</p></div>
<footer class="pie">${pie}</footer>
</section>`
}

/**
 * The whole carousel as one HTML document (design 2026-10-26, D4, mockup `estilo-carrusel.html` option A): one
 * 1080 x 1350 section per slide, cream paper (or the chosen variant), a large serif. The renderer screenshots each
 * section and prints the document as a PDF with one page per section.
 */
export function htmlDelCarrusel(entrada: EntradaDePlantilla): string {
  const total = entrada.laminas.length
  const secciones = entrada.laminas.map((lamina, indice) => seccion(lamina, indice, total, entrada.marca)).join("\n")
  return `<!doctype html>
<html lang="es-CL"><head><meta charset="utf-8"><style>${estilos(entrada.variante, entrada.fuente)}</style></head>
<body>
${secciones}
</body></html>`
}
