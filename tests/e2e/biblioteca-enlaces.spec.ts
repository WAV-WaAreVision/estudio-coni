import { expect, test } from "@playwright/test"
import { bloquearRedExterna, conLetraGrande, entrarComo, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { AUTORA, type EscenaDeAutoresYTemas, sembrarAutoresYTemas, TEMA_PRINCIPAL } from "./biblioteca-escena"
import { CORREO_DEL_MANTENEDOR } from "./entorno"

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

test("the nav moves between the three sections; at 375 and 390 px its tabs are 44 px or more and nothing scrolls sideways", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
  await tocarHastaLlegar(page, nav.getByRole("link", { name: "Autores" }), /\/biblioteca\/autores(?:[?&]v=\d+)?$/)
  await tocarHastaLlegar(page, nav.getByRole("link", { name: "Temas" }), /\/biblioteca\/temas(?:[?&]v=\d+)?$/)
  await tocarHastaLlegar(page, nav.getByRole("link", { name: "Materiales" }), /\/biblioteca(?:[?&]v=\d+)?$/)
  for (const ancho of [375, 390]) {
    await page.setViewportSize({ width: ancho, height: 812 })
    for (const ruta of ["/biblioteca", "/biblioteca/autores", "/biblioteca/temas"]) {
      await page.goto(ruta)
      for (const nombre of ["Materiales", "Autores", "Temas"]) {
        const pestana = nav.getByRole("link", { name: nombre })
        await expect(pestana).toBeVisible()
        expect((await pestana.boundingBox())?.height ?? 0, `${ancho} px ${ruta} ${nombre}`).toBeGreaterThanOrEqual(44)
      }
      // One row inside the pill (it slides when it does not fit), and the open section is whole in view.
      const arribas = await nav
        .getByRole("link")
        .evaluateAll((pestanas) => pestanas.map((pestana) => Math.round(pestana.getBoundingClientRect().top)))
      expect(new Set(arribas).size, `${ancho} px ${ruta}`).toBe(1)
      const pista = await nav.getByRole("list").boundingBox()
      const actual = await nav.locator("[aria-current='page']").boundingBox()
      expect(actual && pista && actual.x >= pista.x && actual.x + actual.width <= pista.x + pista.width + 0.5).toBe(
        true,
      )
      const sinDesborde = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )
      expect(sinDesborde, `${ancho} px ${ruta}`).toBe(true)
    }
  }
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

test("at 375 px with large text the tabs, the search and the quick filters fit, 44 px or more, nothing scrolls sideways (4c)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const ruta of ["/biblioteca/autores", "/biblioteca/temas"]) {
    await page.goto(ruta)
    await conLetraGrande(page)
    const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    for (const nombre of ["Materiales", "Autores", "Temas"]) {
      const pestana = nav.getByRole("link", { name: nombre })
      await expect(pestana).toBeVisible()
      expect((await pestana.boundingBox())?.height ?? 0, `${ruta} ${nombre}`).toBeGreaterThanOrEqual(44)
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
