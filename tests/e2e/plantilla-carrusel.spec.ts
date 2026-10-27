import { join } from "node:path"
import { type Browser, expect, test } from "@playwright/test"
import { getDocumentProxy } from "unpdf"
import { fuenteDelCarrusel } from "@/lib/carrusel/fuente"
import { marcaDelCarrusel } from "@/lib/carrusel/plantilla/plantilla"
import { ALTO, ANCHO } from "@/lib/carrusel/plantilla/tipografia"
import { type EntradaDeRender, renderizarCarrusel } from "@/lib/carrusel/render"
import type { Lamina } from "@/lib/dominio/carrusel"
import { VARIANTES } from "@/lib/dominio/diseno-carrusel"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"

// The real renderer in this machine's Chromium (design 2026-10-26, Tests: integration with real Playwright). It needs
// no app page: it opens its own pages from the test's browser.

const abrirEn = (browser: Browser) => async () => {
  const pagina = await browser.newPage({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 })
  return { pagina, cerrar: () => pagina.close() }
}

async function entrada(
  laminas: readonly Lamina[],
  variante: EntradaDeRender["variante"] = "crema",
): Promise<EntradaDeRender> {
  return {
    laminas,
    variante,
    marca: marcaDelCarrusel("IA y salud"),
    fuente: await fuenteDelCarrusel(join(process.cwd(), "assets/fuentes")),
  }
}

/** Width and height from the PNG's IHDR chunk. */
function medidas(png: Uint8Array): { ancho: number; alto: number } {
  const vista = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { ancho: vista.getUint32(16), alto: vista.getUint32(20) }
}

test("renders one 1080 x 1350 PNG per slide and a PDF with as many pages", async ({ browser }) => {
  const resultado = await renderizarCarrusel(abrirEn(browser), await entrada(LAMINAS_DE_PRUEBA))
  if (resultado.tipo !== "listo") throw new Error(`Desbordó: ${resultado.laminas.join(", ")}`)
  expect(resultado.pngs).toHaveLength(LAMINAS_DE_PRUEBA.length)
  for (const png of resultado.pngs) expect(medidas(png)).toEqual({ ancho: 1080, alto: 1350 })
  const pdf = await getDocumentProxy(resultado.pdf)
  expect(pdf.numPages).toBe(LAMINAS_DE_PRUEBA.length)
  const pagina = await pdf.getPage(1)
  const [, , ancho, alto] = pagina.view
  // CSS pixels print at 0.75 pt each.
  expect([Math.round(ancho ?? 0), Math.round(alto ?? 0)]).toEqual([810, 1013])
})

test("matches the committed reference of every slide (crema)", async ({ browser }) => {
  const resultado = await renderizarCarrusel(abrirEn(browser), await entrada(LAMINAS_DE_PRUEBA))
  if (resultado.tipo !== "listo") throw new Error("Desbordó")
  resultado.pngs.forEach((png, i) => {
    expect(Buffer.from(png)).toMatchSnapshot(`crema-lamina-${i + 1}.png`, { maxDiffPixelRatio: 0.01 })
  })
})

for (const variante of VARIANTES) {
  test(`matches the reference of the portada and an idea in ${variante}`, async ({ browser }) => {
    const resultado = await renderizarCarrusel(abrirEn(browser), await entrada(LAMINAS_DE_PRUEBA, variante))
    if (resultado.tipo !== "listo") throw new Error("Desbordó")
    expect(Buffer.from(resultado.pngs[0] ?? new Uint8Array())).toMatchSnapshot(`${variante}-portada.png`, {
      maxDiffPixelRatio: 0.01,
    })
    expect(Buffer.from(resultado.pngs[2] ?? new Uint8Array())).toMatchSnapshot(`${variante}-idea.png`, {
      maxDiffPixelRatio: 0.01,
    })
  })
}

test("says which slides overflow and renders nothing", async ({ browser }) => {
  const larga = "Una idea que no termina nunca y sigue y sigue. ".repeat(20).trim()
  const laminas = LAMINAS_DE_PRUEBA.map((lamina, i) => (i === 3 ? { ...lamina, texto: larga } : lamina))
  const resultado = await renderizarCarrusel(abrirEn(browser), await entrada(laminas))
  expect(resultado).toEqual({ tipo: "desborda", laminas: [3] })
})

test("refuses to render when the font did not load", async ({ browser }) => {
  const sinLetra = { ...(await entrada(LAMINAS_DE_PRUEBA)), fuente: "data:font/ttf;base64,AAAA" }
  await expect(renderizarCarrusel(abrirEn(browser), sinLetra)).rejects.toThrow("La letra del carrusel no cargó")
})
