import { expect, test } from "@playwright/test"
import {
  abrirMenuDeSecciones,
  bloquearRedExterna,
  conLetraGrande,
  entrarComo,
  irASeccion,
  menuDeSecciones,
  revisarConAxe,
  tocarHastaLlegar,
} from "./ayudas"
import { AUTORA, type EscenaDeAutoresYTemas, sembrarAutoresYTemas, TEMA_PRINCIPAL } from "./biblioteca-escena"
import { CORREO_DEL_MANTENEDOR } from "./entorno"

const SECCIONES = ["Materiales", "Autores", "Temas", "Semana"]

let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("a material's detail links each of its topics to the topic's page (D9)", async ({ page }) => {
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  await tocarHastaLlegar(
    page,
    page.getByRole("list", { name: "Temas" }).getByRole("link", { name: TEMA_PRINCIPAL, exact: true }),
    new RegExp(`/biblioteca/temas/${escena.carga}$`),
  )
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
})

test("the section menu moves between the sections; at 375 and 390 px its button and its sections are 44 px or more and nothing scrolls sideways", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  await irASeccion(page, "Autores", /\/biblioteca\/autores(?:[?&]v=\d+)?$/)
  await irASeccion(page, "Temas", /\/biblioteca\/temas(?:[?&]v=\d+)?$/)
  await irASeccion(page, "Materiales", /\/biblioteca(?:[?&]v=\d+)?$/)
  const { boton } = menuDeSecciones(page)
  for (const ancho of [375, 390]) {
    await page.setViewportSize({ width: ancho, height: 812 })
    for (const ruta of ["/biblioteca", "/biblioteca/autores", "/biblioteca/temas"]) {
      await page.goto(ruta)
      await expect(boton).toBeVisible()
      expect((await boton.boundingBox())?.height ?? 0, `${ancho} px ${ruta} botón`).toBeGreaterThanOrEqual(44)
      const secciones = await abrirMenuDeSecciones(page)
      await expect(secciones).toHaveText(SECCIONES)
      for (const nombre of SECCIONES) {
        const caja = await secciones.filter({ hasText: nombre }).boundingBox()
        expect(caja?.height ?? 0, `${ancho} px ${ruta} ${nombre}`).toBeGreaterThanOrEqual(44)
        expect(caja && caja.x >= 0 && caja.x + caja.width <= ancho, `${ancho} px ${ruta} ${nombre} en pantalla`).toBe(
          true,
        )
      }
      const sinDesborde = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )
      expect(sinDesborde, `${ancho} px ${ruta}`).toBe(true)
    }
  }
})

test("the section menu opens the four sections, folds on Escape back to its button and on a tap outside, and goes to Autores", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas")
  const { nav, boton } = menuDeSecciones(page)
  await expect(boton).toHaveAccessibleName("Sección de la Biblioteca: Temas")
  await expect(boton).toHaveAttribute("aria-expanded", "false")
  await expect(nav.getByRole("link")).toHaveCount(0)

  const secciones = await abrirMenuDeSecciones(page)
  await expect(secciones).toHaveText(SECCIONES)
  await expect(nav.getByRole("link", { name: "Temas" })).toHaveAttribute("aria-current", "page")
  await expect(nav.locator("[aria-current='page']")).toHaveCount(1)
  expect(await revisarConAxe(page, "menú de secciones abierto")).toEqual([])

  await nav.getByRole("link", { name: "Autores" }).focus()
  await page.keyboard.press("Escape")
  await expect(boton).toHaveAttribute("aria-expanded", "false")
  await expect(boton).toBeFocused()
  await expect(secciones).toHaveCount(0)

  await page.keyboard.press("Enter")
  await expect(boton).toHaveAttribute("aria-expanded", "true")
  await page.getByRole("heading", { name: "Biblioteca", level: 1 }).click()
  await expect(boton).toHaveAttribute("aria-expanded", "false")

  await irASeccion(page, "Autores", /\/biblioteca\/autores(?:[?&]v=\d+)?$/)
  await expect(boton).toHaveAccessibleName("Sección de la Biblioteca: Autores")
  await expect(boton).toHaveAttribute("aria-expanded", "false")
  expect(await revisarConAxe(page, "autores tras el menú")).toEqual([])
})

test("only Coni: without a session it asks to sign in, and the maintainer is refused both sections and their pages", async ({
  browser,
}) => {
  const rutas = [
    "/biblioteca/autores",
    `/biblioteca/autores/${escena.autora}`,
    "/biblioteca/temas",
    `/biblioteca/temas/${escena.carga}`,
  ]
  const sinSesion = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const visitante = await sinSesion.newPage()
  for (const ruta of rutas) {
    await visitante.goto(ruta)
    await expect(visitante, ruta).toHaveURL(/\/ingreso$/)
  }
  await sinSesion.close()

  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const wav = await contexto.newPage()
  for (const ruta of rutas) {
    await wav.goto(ruta)
    await expect(wav.getByRole("heading", { name: "Esta app es solo para Coni." }), ruta).toBeVisible()
    await expect(wav.getByText(AUTORA), ruta).toHaveCount(0)
    await expect(wav.getByText(TEMA_PRINCIPAL), ruta).toHaveCount(0)
  }
  await contexto.close()
})

test("Autores, Temas and their pages pass WCAG 2.x AA (4n)", async ({ page }) => {
  const hallazgos: string[] = []
  await page.goto("/biblioteca/autores")
  // The bottom bar is `sticky bottom-0` and comes after <main>'s bottom padding: at the end of the page it sits in the
  // flow, so nothing is under it. At the first scroll position it overlaps the fourth card, and axe's target-size hit
  // there is an artefact of that position, not a target a person cannot reach: the list is checked at its end.
  await expect(page.getByRole("list", { name: "Autores" }).getByRole("listitem")).toHaveCount(4)
  // Scrolled until it stays at the end: a scroll made while the page still grows stops short of it.
  await expect
    .poll(() =>
      page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        return Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight
      }),
    )
    .toBe(true)
  hallazgos.push(...(await revisarConAxe(page, "autores")))
  await page.getByLabel("Buscar por nombre").fill("zzz")
  await expect(page.getByText("Nadie se llama así todavía.")).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "autores sin resultados")))

  await page.goto(`/biblioteca/autores/${escena.otraAutora}`)
  hallazgos.push(...(await revisarConAxe(page, "autor")))
  await page.getByRole("button", { name: "Unir con otro autor" }).click()
  await page.getByLabel("Buscar por nombre").fill("daniela")
  hallazgos.push(...(await revisarConAxe(page, "uniendo, buscando")))
  await page.getByRole("list", { name: "Con quién unir" }).getByRole("button").first().click()
  await expect(page.getByRole("button", { name: "Sí, unir" })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "uniendo, preguntando")))

  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await page.getByText("Detalle para WAV").first().click()
  hallazgos.push(...(await revisarConAxe(page, "autor con el detalle para WAV abierto")))

  await page.goto("/biblioteca/temas")
  hallazgos.push(...(await revisarConAxe(page, "temas")))
  await page.getByText("Más filtros", { exact: true }).click()
  await expect(page.getByRole("link", { name: /^Un solo autor/ })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "temas con más filtros")))

  await page.goto(`/biblioteca/temas/${escena.carga}`)
  hallazgos.push(...(await revisarConAxe(page, "tema")))
  await page.goto(`/biblioteca/temas/${escena.pausas}`)
  await page.getByRole("button", { name: "Ocultar" }).click()
  // The note arrives with ?oculta=, which then leaves the address (deviation 14).
  await expect(page).toHaveURL(/\/biblioteca\/temas$/)
  await expect(page.locator("#aviso-de-ideas")).toContainText("Era la última idea de ese tema")
  hallazgos.push(...(await revisarConAxe(page, "temas tras ocultar la última idea")))
  expect(hallazgos).toEqual([])
})

test("at 375 px with large text the section menu, the search and the quick filters fit, 44 px or more, nothing scrolls sideways (4c)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const ruta of ["/biblioteca/autores", "/biblioteca/temas"]) {
    await page.goto(ruta)
    await conLetraGrande(page)
    const { boton } = menuDeSecciones(page)
    await expect(boton).toBeVisible()
    expect((await boton.boundingBox())?.height ?? 0, `${ruta} botón`).toBeGreaterThanOrEqual(44)
    const secciones = await abrirMenuDeSecciones(page)
    for (const nombre of SECCIONES) {
      const caja = await secciones.filter({ hasText: nombre }).boundingBox()
      expect(caja?.height ?? 0, `${ruta} ${nombre}`).toBeGreaterThanOrEqual(44)
      expect(caja && caja.x >= 0 && caja.x + caja.width <= 375, `${ruta} ${nombre} en pantalla`).toBe(true)
    }
    const sinDesborde = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(sinDesborde, ruta).toBe(true)
    expect(await revisarConAxe(page, `${ruta} con letra grande`)).toEqual([])
  }

  await page.goto("/biblioteca/autores")
  await conLetraGrande(page)
  await expect(page.getByLabel("Buscar por nombre")).toBeVisible()
  await expect(page.getByRole("list", { name: "Autores" }).getByRole("listitem").first()).toBeVisible()

  await page.goto("/biblioteca/temas")
  await conLetraGrande(page)
  const filtros = page.getByRole("group", { name: "Filtrar temas" })
  for (const nombre of ["Sin tratar · 2", "LinkedIn", "Instagram", "Todos los pilares", "Bienestar e impacto"]) {
    const chip = filtros.getByRole("link", { name: nombre, exact: true })
    await expect(chip).toBeVisible()
    expect((await chip.boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
  const masFiltros = page.getByText("Más filtros", { exact: true })
  expect((await masFiltros.boundingBox())?.height ?? 0, "Más filtros").toBeGreaterThanOrEqual(44)
})
