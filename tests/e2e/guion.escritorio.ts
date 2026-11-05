import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, capturar, configurarServicios, revisarConAxe, simularMedios } from "./ayudas"
import { avatarYaVisto, conAngulo, sembrarEscena } from "./escena"

// Runs only in the `escritorio` project: gate 1 on a computer, 1280 x 900 (critique 2026-11-05). Measured, no baselines.
const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOKS = [
  { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" },
  { avatar_id: "look-b", nombre: "Terraza", imagen: "avatares/look-b.png" },
]
const CONFIG = { ...BASE, heygen: { ...BASE.heygen, avatares: LOOKS } }

let guion: string

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(CONFIG)])
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
  ;({ guion } = await sembrarEscena())
  await conAngulo(guion, "psicologia-en-la-mesa", "lo-que-construyo")
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
})

async function abrir(page: Page) {
  await page.goto(`/guion/${guion}`)
  await expect(page.getByRole("heading", { name: "2. Revisa el guion" })).toBeVisible()
}

const firma = (page: Page) => page.getByRole("region", { name: "Firma" })

/** The box of step 2: the script, its review and its editor. */
async function cajaDelGuion(page: Page) {
  const seccion = page.locator("section[aria-labelledby=guion]")
  return seccion.evaluate((nodo) => {
    const caja = nodo.getBoundingClientRect()
    return { left: caja.left, right: caja.right, top: caja.top, bottom: caja.bottom }
  })
}

async function caja(selector: ReturnType<typeof firma>) {
  return selector.evaluate((nodo) => {
    const r = nodo.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
  })
}

test("the script reads on the left and the signature sits on the right, never over the script", async ({ page }) => {
  await abrir(page)
  const alto = page.viewportSize()?.height ?? 900

  const barra = await caja(firma(page))
  const falta = await caja(firma(page).getByText("Falta:"))
  const lectura = await cajaDelGuion(page)

  // Without scrolling: the missing steps and the track are on screen.
  expect(falta.top).toBeGreaterThanOrEqual(0)
  expect(barra.bottom).toBeLessThanOrEqual(alto)
  // Side by side: the bar starts right of the reading column.
  expect(barra.left).toBeGreaterThanOrEqual(lectura.right)
  // The reading column keeps a comfortable line: about 65 to 75 characters at 17 px.
  expect(lectura.right - lectura.left).toBeGreaterThan(560)
  expect(lectura.right - lectura.left).toBeLessThanOrEqual(700)

  // Reading to the end of the script, the signature is still on screen and still beside it.
  await page
    .locator("section[aria-labelledby=guion]")
    .getByText("Soy Coni del Rosario.")
    .first()
    .scrollIntoViewIfNeeded()
  const abajo = await caja(firma(page))
  expect(abajo.top).toBeGreaterThanOrEqual(0)
  expect(abajo.bottom).toBeLessThanOrEqual(alto)
  expect(abajo.left).toBeGreaterThanOrEqual((await cajaDelGuion(page)).right)
})

test("no width scrolls sideways, from a tablet to a wide screen", async ({ page }) => {
  for (const ancho of [768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 })
    await abrir(page)
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(sobra, `${ancho} px`).toBeLessThanOrEqual(0)
    // From md up the two columns stand side by side.
    expect((await caja(firma(page))).left, `${ancho} px`).toBeGreaterThanOrEqual((await cajaDelGuion(page)).right)
  }
})

test("every control of the decision column is at least 44 px tall", async ({ page }) => {
  await abrir(page)
  const bajos = await page.evaluate(() => {
    const controles = document.querySelectorAll<HTMLElement>(
      "main select, main button, main [role=slider], main label:has(input[type=radio]), main a",
    )
    return [...controles]
      .filter((nodo) => nodo.offsetParent !== null)
      .map((nodo) => ({
        nombre: nodo.textContent?.trim() || nodo.getAttribute("aria-label"),
        alto: nodo.getBoundingClientRect().height,
      }))
      .filter(({ alto }) => alto < 44)
  })
  expect(bajos).toEqual([])
})

test("axe finds nothing and the focus follows the steps: voice, script, avatar, signature", async ({ page }) => {
  await abrir(page)
  expect(await revisarConAxe(page, "puerta 1 en computador")).toEqual([])

  const orden: string[] = []
  await page.locator("main").focus()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab")
    const nombre = await page.evaluate(() => {
      const nodo = document.activeElement
      if (!nodo || !nodo.closest("main")) return null
      return (
        nodo.getAttribute("aria-label") ?? nodo.closest("label")?.textContent?.trim() ?? nodo.textContent?.trim() ?? ""
      )
    })
    if (nombre === null) continue
    orden.push(nombre)
  }
  const indice = (texto: string) => orden.findIndex((nombre) => nombre.includes(texto))
  const pasos = ["Inicio", "Escuchar", "Editar el guion", "Estudio", "Desliza para firmar"].map(indice)
  expect(
    pasos.every((posicion) => posicion >= 0),
    orden.join(" | "),
  ).toBe(true)
  expect([...pasos].sort((a, b) => a - b)).toEqual(pasos)
})

test("with a large default text size the page does not scroll sideways and the signature is reachable", async ({
  page,
}) => {
  // Text twice the size with the width unchanged (a browser's text-only zoom): rem grows, the breakpoints do not, and
  // data-letra stays off (it starts below 18 rem across, a phone's case).
  await abrir(page)
  await page.addStyleTag({ content: "html { font-size: 212.5% !important }" })
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sobra).toBeLessThanOrEqual(0)
  // The script is never squeezed beside the steps: with this text it takes the whole column, as on a phone.
  const lectura = await cajaDelGuion(page)
  expect(lectura.right - lectura.left).toBeGreaterThan(1000)
  await firma(page).getByRole("slider", { name: "Desliza para firmar" }).scrollIntoViewIfNeeded()
  await expect(firma(page).getByRole("slider", { name: "Desliza para firmar" })).toBeInViewport()
  if (process.env.CAPTURAS_PUERTA_UNO) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await capturar(page, "puerta-uno-letra-grande-1280", { completa: true })
  }
})
