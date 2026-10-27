import type { Page } from "playwright"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { type EntradaDePlantilla, FAMILIA_DEL_CARRUSEL, htmlDelCarrusel } from "./plantilla/plantilla"
import { ALTO, ANCHO } from "./plantilla/tipografia"

export type EntradaDeRender = EntradaDePlantilla

/** A page to render in, and how to let it go (close the page in tests, the whole browser in the task). */
export interface PaginaDeRender {
  pagina: Page
  cerrar(): Promise<void>
}
export type AbrirPagina = () => Promise<PaginaDeRender>

export type Render =
  /** Indexes of the slides whose text is taller than its box (plan amendment 4). Nothing was rendered. */
  { tipo: "desborda"; laminas: number[] } | { tipo: "listo"; pngs: Uint8Array[]; pdf: Uint8Array }

/**
 * Renders a carousel version (design 2026-10-26, D4): loads the template, waits for the committed serif, measures every
 * text box, then screenshots each 1080 x 1350 slide and prints the same document as a PDF with one page per slide.
 */
export async function renderizarCarrusel(abrir: AbrirPagina, entrada: EntradaDeRender): Promise<Render> {
  const { pagina, cerrar } = await abrir()
  try {
    await pagina.setViewportSize({ width: ANCHO, height: ALTO })
    await pagina.setContent(htmlDelCarrusel(entrada), { waitUntil: "load" })
    // `document.fonts.check` answers true for a family nobody declared: ask for the faces themselves instead. A face
    // that fails to decode rejects `load` with a NetworkError: that is the same answer, the letter did not load.
    const problemaDeLetra = await pagina.evaluate(async (familia) => {
      await document.fonts.ready
      try {
        const caras = await document.fonts.load(`64px "${familia}"`)
        return caras.length > 0 && caras.every((cara) => cara.status === "loaded") ? null : "sin caras cargadas"
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }, FAMILIA_DEL_CARRUSEL)
    if (problemaDeLetra !== null) {
      throw new FallaDeConfiguracion(`La letra del carrusel no cargó en Chromium (${problemaDeLetra}).`)
    }

    const desbordadas = await pagina.$$eval("[data-texto]", (cajas) =>
      cajas.flatMap((caja, indice) => {
        const parrafo = caja.firstElementChild
        return parrafo && parrafo.getBoundingClientRect().height > caja.clientHeight + 1 ? [indice] : []
      }),
    )
    if (desbordadas.length > 0) return { tipo: "desborda", laminas: desbordadas }

    const secciones = pagina.locator("[data-lamina]")
    const pngs: Uint8Array[] = []
    for (let indice = 0; indice < entrada.laminas.length; indice += 1) {
      pngs.push(new Uint8Array(await secciones.nth(indice).screenshot({ type: "png", animations: "disabled" })))
    }
    const pdf = new Uint8Array(
      await pagina.pdf({ width: `${ANCHO}px`, height: `${ALTO}px`, printBackground: true, preferCSSPageSize: true }),
    )
    return { tipo: "listo", pngs, pdf }
  } finally {
    await cerrar()
  }
}
