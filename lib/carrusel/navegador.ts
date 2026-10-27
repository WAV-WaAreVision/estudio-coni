import { chromium } from "playwright"
import type { AbrirPagina } from "./render"

/**
 * Chromium for the `armar-carrusel` task: the headless shell Trigger.dev's `playwright()` extension installs
 * (PLAYWRIGHT_BROWSERS_PATH), or `PLAYWRIGHT_CHROMIUM_PATH` on a machine that has another one. One browser per render,
 * closed with the page. Only Trigger.dev code imports this file: `app/` must never bundle Chromium.
 */
export const abrirPaginaDeChromium: AbrirPagina = async () => {
  const navegador = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  })
  try {
    const pagina = await navegador.newPage({ deviceScaleFactor: 1 })
    return { pagina, cerrar: () => navegador.close() }
  } catch (error) {
    await navegador.close()
    throw error
  }
}
