import { expect, test } from "@playwright/test"
import { TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import coniConfig from "../fixtures/coni.config.json"
import { pool } from "../integration/db"
import { ajustarPieza } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, conLetraGrande, simularMedios } from "./ayudas"
import { sembrarEscena } from "./escena"

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await configurarServicios()
  await simularMedios(page)
})

test("at large text the nav sits after the content with three tabs that keep their labels, 44 px or more", async ({
  page,
}) => {
  await sembrarEscena()
  await page.goto("/")
  await conLetraGrande(page)

  const nav = page.getByRole("navigation", { name: "Secciones" })
  await expect(nav).toHaveCSS("position", "static")
  for (const nombre of ["Inicio", "Métricas", "Ajustes"]) {
    const pestana = nav.getByRole("link", { name: nombre })
    await expect(pestana).toBeVisible()
    const caja = await pestana.boundingBox()
    expect(caja?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
    expect(caja?.width ?? 0, nombre).toBeGreaterThanOrEqual(44)
    const etiqueta = nav.getByText(nombre, { exact: true })
    await expect(etiqueta).toBeVisible()
    expect((await etiqueta.boundingBox())?.width ?? 0, nombre).toBeGreaterThan(20)
  }
})

test("at large text the sign bar sits at the end of gate 1, round all over, with the full thumb and a one-line label", async ({
  page,
}) => {
  const { guion } = await sembrarEscena()
  await page.goto(`/guion/${guion}`)
  await conLetraGrande(page)

  const barra = page.locator("[data-barra-de-firma]")
  await expect(barra).toHaveCSS("position", "static")
  await expect(barra).toHaveCSS("border-bottom-left-radius", "28px")
  const raiz = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
  expect((await page.getByTestId("pulgar-firma").boundingBox())?.width ?? 0).toBeCloseTo(3 * raiz, 0)
  const etiqueta = page.getByTestId("pista-de-firma").locator("[data-etiqueta-de-firma]:visible")
  await expect(etiqueta).toHaveCount(1)
  const lineas = await etiqueta.evaluate((nodo) => {
    const alto = nodo.getBoundingClientRect().height
    const linea = Number.parseFloat(getComputedStyle(nodo).lineHeight)
    return Math.round(alto / linea)
  })
  expect(lineas).toBe(1)
  await expect(page.locator("h1")).toHaveCSS("font-size", `${1.5 * raiz}px`)
})

test("at large text a priced button keeps every word of its label whole", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await ajustarPieza(guion, { audio_id: null, explicacion: TEXTO_SIN_VOZ })
  // The price shows only when the production setup reads.
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(coniConfig)])
  try {
    await page.goto(`/guion/${guion}`)
    await conLetraGrande(page)
    await expect(page.getByRole("button", { name: /^Preparar mi voz US\$ \d+,\d\d$/ })).toBeVisible()
  } finally {
    await pool.query("update public.ajustes set produccion = '{}'::jsonb")
  }

  const boton = page.getByRole("button", { name: /^Preparar mi voz US\$ \d+,\d\d$/ })
  // One line box per word: a word cut in two ("Prepar" / "ar") draws two.
  const lineasPorPalabra = await boton.evaluate((nodo) => {
    const etiqueta = nodo.firstElementChild
    const texto = etiqueta?.firstChild
    if (!texto || texto.nodeType !== Node.TEXT_NODE) throw new Error("El botón no tiene la etiqueta como texto")
    const contenido = texto.textContent ?? ""
    const cuentas: Record<string, number> = {}
    let desde = 0
    for (const palabra of contenido.split(" ")) {
      const rango = document.createRange()
      rango.setStart(texto, desde)
      rango.setEnd(texto, desde + palabra.length)
      cuentas[palabra] = new Set([...rango.getClientRects()].map((r) => Math.round(r.top))).size
      desde += palabra.length + 1
    }
    return cuentas
  })
  expect(lineasPorPalabra).toEqual({ Preparar: 1, mi: 1, voz: 1 })
})

test("at large text the badges on the video are never smaller than at normal size", async ({ page }) => {
  const { video } = await sembrarEscena()
  await page.goto(`/video/${video}`)
  await conLetraGrande(page)
  const raiz = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
  await expect(page.getByText("Avatar IA")).toHaveCSS("font-size", `${0.8125 * raiz}px`)
})

test("at large text the toast sits at the bottom, where nothing is pinned", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await page.goto(`/guion/${guion}?deshecho=1`)
  await conLetraGrande(page)

  const aviso = page.locator(".aviso")
  await expect(aviso).toContainText("Listo, no grabé nada.")
  const caja = await aviso.boundingBox()
  expect(Math.round((caja?.y ?? 0) + (caja?.height ?? 0))).toBe((page.viewportSize()?.height ?? 0) - 16)
})

test("at large text the gate 2 video takes the full width at 9:16", async ({ page }) => {
  const { video } = await sembrarEscena()
  await page.goto(`/video/${video}`)
  await conLetraGrande(page)

  const caja = await page.locator(".video-puerta").boundingBox()
  expect(caja?.width ?? 0).toBeGreaterThanOrEqual(340)
  expect((caja?.height ?? 0) / (caja?.width ?? 1)).toBeCloseTo(16 / 9, 1)
})

test("no screen scrolls sideways at large text on a 390 px phone", async ({ page }) => {
  const { guion, video } = await sembrarEscena()
  const desbordes: string[] = []
  for (const ruta of [
    "/",
    "/ideas",
    "/calendario",
    "/calendario?vista=agenda",
    "/calendario?vista=ritmo",
    "/metricas",
    "/ajustes",
    "/ajustes/cuentas",
    `/guion/${guion}`,
    `/video/${video}`,
    "/l",
  ]) {
    await page.goto(ruta)
    await conLetraGrande(page)
    const { ancho, vista } = await page.evaluate(() => ({
      ancho: document.documentElement.scrollWidth,
      vista: window.innerWidth,
    }))
    if (ancho > vista) desbordes.push(`${ruta}: ${ancho} > ${vista}`)
  }
  expect(desbordes).toEqual([])
})
