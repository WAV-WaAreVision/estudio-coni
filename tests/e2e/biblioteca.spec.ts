import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import {
  bloquearRedExterna,
  conLetraGrande,
  disparosDeMateriales,
  entrarComo,
  limpiarDisparos,
  menuDeSecciones,
  revisarConAxe,
  tocarHastaLlegar,
} from "./ayudas"
import {
  AUTORA,
  type EscenaDeBiblioteca,
  RESUMEN_ESTRATEGIA,
  sembrarBiblioteca,
  TEMA_PRINCIPAL,
  TITULO_ESTRATEGIA,
  TITULO_LISTO,
} from "./biblioteca-escena"
import { BALDE_DE_PRUEBA, CORREO_DEL_MANTENEDOR, URL_DEL_ALMACEN } from "./entorno"

const CLAVE_CON_INTENTO = (materialId: string) => new RegExp(`^procesar-material:${materialId}:[0-9a-f-]{36}$`)
const AVISO_CON_COSTO = "Lo estoy procesando. Costará cerca de US$ 1,20."

let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
  limpiarDisparos()
})

test("the phone list shows each material as a card with its words, topic and state, and the bar is unchanged", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(menuDeSecciones(page).boton).toHaveAccessibleName("Sección de la Biblioteca: Materiales")

  const lista = page.getByRole("list", { name: "Materiales" })
  await expect(lista.getByRole("listitem")).toHaveCount(5)
  const burnout = lista.getByRole("listitem").filter({ hasText: "Burnout y teletrabajo" })
  await expect(burnout).toContainText(`Documento · ${AUTORA} · Referente`)
  await expect(burnout).toContainText(`${TEMA_PRINCIPAL} +1`)
  await expect(burnout).toContainText("Listo")
  await expect(burnout).toContainText("Hace 2 días")
  await expect(lista.getByRole("listitem").filter({ hasText: "Notas del taller" })).toContainText("Con error")
  await expect(lista.getByRole("listitem").filter({ hasText: "Liderar con IA" })).toContainText("Procesando")
  const charla = lista.getByRole("listitem").filter({ hasText: "síndrome del impostor" })
  await expect(charla).toContainText("Procesando")
  await expect(charla.getByRole("button")).toHaveCount(0)

  // The bar's tab still goes to Ingesta in this batch.
  await expect(
    page.getByRole("navigation", { name: "Secciones", exact: true }).getByRole("link", { name: "Biblioteca" }),
  ).toHaveAttribute("href", "/ir-a-biblioteca")
})

test("the quick filters change the list with one tap and live in the URL (4b)", async ({ page }) => {
  await page.goto("/biblioteca")
  const lista = page.getByRole("list", { name: "Materiales" })
  const filtros = page.getByRole("group", { name: "Filtrar por estado" })
  await expect(filtros.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page")

  await filtros.getByRole("link", { name: "Con error · 1" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=fallido(?:[?&]v=\d+)?$/)
  await expect(filtros.getByRole("link", { name: "Con error · 1" })).toHaveAttribute("aria-current", "page")
  await expect(filtros.getByRole("link", { name: "Todos" })).not.toHaveAttribute("aria-current", "page")
  await expect(lista.getByRole("listitem")).toHaveCount(1)

  await filtros.getByRole("link", { name: "Procesando · 2" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=procesando(?:[?&]v=\d+)?$/)
  await expect(lista.getByRole("listitem")).toHaveCount(2)

  // Back undoes a filter: each one is a link.
  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca\?estado=fallido(?:[?&]v=\d+)?$/)
  await expect(lista.getByRole("listitem")).toHaveCount(1)

  await tocarHastaLlegar(page, filtros.getByRole("link", { name: "Todos" }), /\/biblioteca(?:[?&]v=\d+)?$/)
  await expect(lista.getByRole("listitem")).toHaveCount(5)
})

test("Más filtros folds author, who she is for you and type, and keeps the quick filter", async ({ page }) => {
  await page.goto("/biblioteca?estado=listo")
  await page.getByText("Más filtros", { exact: true }).click()
  await page.getByLabel("¿Quién es para ti?").selectOption({ label: "Estrategia interna" })
  await page.getByRole("button", { name: "Filtrar" }).click()

  // The list writes its params in one order (hrefDeLista), whatever the form sent.
  await expect(page).toHaveURL(/\/biblioteca\?rol=estrategia&estado=listo(?:[?&]v=\d+)?$/)
  const lista = page.getByRole("list", { name: "Materiales" })
  await expect(lista.getByRole("listitem")).toHaveCount(1)
  await expect(lista).toContainText(TITULO_ESTRATEGIA)
  // With a folded filter on, the chip says how many and comes open.
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "Quitar estos filtros" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=listo(?:[?&]v=\d+)?$/)
  await expect(lista.getByRole("listitem")).toHaveCount(2)
})

test("a material that finishes while the list is open turns Listo on its own, without a tap or a reload", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  const tarjeta = page
    .getByRole("list", { name: "Materiales" })
    .getByRole("listitem")
    .filter({ hasText: "Liderar con IA" })
  await expect(tarjeta).toContainText("Procesando")
  await page.evaluate(() => window.scrollTo(0, 120))

  await pool.query("update public.materiales set estado = 'listo' where id = $1", [escena.procesando])

  // The list asks again every 10 s while something works: two rounds at most.
  await expect(tarjeta).toContainText("Listo", { timeout: 25_000 })
  expect(await page.evaluate(() => window.scrollY)).toBe(120)
})

test("a material's page says it is processing and, once the task estimated it, what it will cost; nothing to confirm", async ({
  page,
}) => {
  await page.goto(`/biblioteca/materiales/${escena.conEstimado}`)
  await expect(
    page.getByRole("heading", { name: "Charla larga sobre el síndrome del impostor", level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole("status").filter({ hasText: AVISO_CON_COSTO })).toHaveText(AVISO_CON_COSTO)
  await expect(page.getByText("Procesando", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Procesar por/ })).toHaveCount(0)
  expect(await revisarConAxe(page, "material procesando con su costo")).toEqual([])
  // For Federico (Task 14): not a baseline, only a picture of the notice.
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, "material-procesando-telefono.png"), fullPage: true })
  }

  await page.goto(`/biblioteca/materiales/${escena.procesando}`)
  await expect(page.getByRole("status").filter({ hasText: "Lo estoy procesando." })).toHaveText("Lo estoy procesando.")

  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  await expect(page.getByText(/^Lo estoy procesando/)).toHaveCount(0)
  expect(disparosDeMateriales()).toEqual([])
})

test("the detail goes back honestly, edits who she is for you, and Reprocesar records a new run", async ({ page }) => {
  await page.goto("/biblioteca")
  await page.getByRole("link", { name: /Burnout y teletrabajo/ }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/materiales/${escena.listo}$`))
  // 4f: the way back says where it goes and sits on the left.
  const volver = page.getByRole("link", { name: "Materiales" })
  await expect(volver).toHaveAttribute("href", "/biblioteca")
  expect((await volver.boundingBox())?.x ?? 999).toBeLessThan(40)
  // 4h: her words on the main text.
  await expect(page.getByRole("heading", { name: "Ideas sacadas" })).toBeVisible()
  await expect(page.getByText("Papel", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "Cambiar autor o quién es para ti" }).click()
  await page.getByRole("radio", { name: "Estudio o libro" }).check()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Reprocesa el material para que use el cambio.")).toBeVisible()
  const { rows } = await pool.query<{ rol: string }>("select rol from public.materiales where id = $1", [escena.listo])
  expect(rows[0]?.rol).toBe("evidencia")

  await page.getByRole("button", { name: "Reprocesar" }).click()
  await page.getByRole("button", { name: "Sí, reprocesar" }).click()
  await expect(page.getByText("Procesando", { exact: true })).toBeVisible()
  const disparos = disparosDeMateriales()
  expect(disparos.map((disparo) => disparo.materialId)).toEqual([escena.listo])
  expect(disparos[0]?.clave).toMatch(CLAVE_CON_INTENTO(escena.listo))
})

test("Reintentar twice records two runs of the material, each with a new key", async ({ page }) => {
  for (const vuelta of [1, 2]) {
    await pool.query("update public.materiales set estado = 'fallido', motivo_fallo = 'sin_texto' where id = $1", [
      escena.conError,
    ])
    await page.goto(`/biblioteca/materiales/${escena.conError}`)
    await page.getByRole("button", { name: "Reintentar" }).click()
    await page.getByRole("button", { name: "Sí, reintentar" }).click()
    await expect(page.getByText("Procesando", { exact: true })).toBeVisible()
    expect(disparosDeMateriales()).toHaveLength(vuelta)
  }
  const disparos = disparosDeMateriales()
  expect(disparos.map((disparo) => disparo.materialId)).toEqual([escena.conError, escena.conError])
  for (const disparo of disparos) expect(disparo.clave).toMatch(CLAVE_CON_INTENTO(escena.conError))
  expect(new Set(disparos.map((disparo) => disparo.clave)).size).toBe(2)
})

test("Descargar texto original answers a 302 to the signed text in the store, and the browser downloads it", async ({
  page,
}) => {
  const ruta = `/biblioteca/materiales/${escena.listo}/texto`
  const respuesta = await page.request.get(ruta, { maxRedirects: 0 })
  expect(respuesta.status()).toBe(302)
  expect(respuesta.headers()["cache-control"]).toBe("no-store")
  const destino = respuesta.headers().location ?? ""
  expect(
    destino.startsWith(`${URL_DEL_ALMACEN}/${BALDE_DE_PRUEBA}/materiales/${escena.listo}/texto-original.txt?`),
  ).toBe(true)
  expect(destino).toContain("X-Amz-Signature=")
  const texto = await page.request.get(destino)
  expect(texto.status()).toBe(200)
  expect(await texto.text()).toBe("Texto original de la revisión.")

  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  const descarga = page.waitForEvent("download")
  await page.getByRole("link", { name: "Descargar texto original" }).click()
  const archivo = await descarga
  expect(archivo.suggestedFilename()).toBe("texto-original.txt")
  expect(archivo.url()).toContain(`/${BALDE_DE_PRUEBA}/materiales/${escena.listo}/texto-original.txt`)
})

test("a strategy material shows its editable card", async ({ page }) => {
  await page.goto(`/biblioteca/materiales/${escena.estrategia}`)
  await expect(page.getByText("Adaptado a la voz de Coni")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible()
  await expect(page.getByText(RESUMEN_ESTRATEGIA)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Ideas sacadas" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "https://ejemplo.test/plan-noviembre" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible()
})

test("a material that is not there shows the section's own not-found page (4m)", async ({ page }) => {
  for (const ruta of [
    "/biblioteca/materiales/00000000-0000-4000-8000-000000000000",
    "/biblioteca/materiales/no-es-un-id",
  ]) {
    await page.goto(ruta)
    await expect(page.getByRole("heading", { name: "No encontré lo que buscabas" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Materiales" })).toHaveAttribute("href", "/biblioteca")
  }
})

test("only Coni: without a session it asks to sign in, and the maintainer is refused the list, a detail and the text", async ({
  browser,
}) => {
  const sinSesion = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const visitante = await sinSesion.newPage()
  await visitante.goto("/biblioteca")
  await expect(visitante).toHaveURL(/\/ingreso$/)
  await sinSesion.close()

  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const wav = await contexto.newPage()
  for (const ruta of ["/biblioteca", `/biblioteca/materiales/${escena.listo}`]) {
    await wav.goto(ruta)
    await expect(wav.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
    await expect(wav.getByText(TITULO_LISTO)).toHaveCount(0)
    await expect(wav.getByRole("heading", { name: "Biblioteca" })).toHaveCount(0)
  }
  const texto = await contexto.request.get(`/biblioteca/materiales/${escena.listo}/texto`, { maxRedirects: 0 })
  expect(texto.status()).toBe(403)
  expect(texto.headers().location).toBeUndefined()
  await contexto.close()
})

test("the list, the detail and the card pass WCAG 2.x AA (4n)", async ({ page }) => {
  const hallazgos: string[] = []
  await page.goto("/biblioteca")
  hallazgos.push(...(await revisarConAxe(page, "lista")))
  await page.getByText("Más filtros", { exact: true }).click()
  await expect(page.getByRole("button", { name: "Filtrar" })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "lista con más filtros")))
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  hallazgos.push(...(await revisarConAxe(page, "detalle")))
  await page.getByRole("button", { name: "Reprocesar" }).click()
  await expect(page.getByRole("button", { name: "Sí, reprocesar" })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "detalle preguntando")))
  await page.getByRole("button", { name: "Cambiar autor o quién es para ti" }).click()
  await expect(page.getByRole("radio", { name: "Estudio o libro" })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "detalle cambiando autor y quién es para ti")))
  await page.goto(`/biblioteca/materiales/${escena.estrategia}`)
  await page.getByRole("button", { name: "Editar" }).click()
  await expect(page.getByLabel("Resumen")).toBeFocused()
  hallazgos.push(...(await revisarConAxe(page, "ficha en edición")))
  await page.goto("/biblioteca/materiales/00000000-0000-4000-8000-000000000000")
  await expect(page.getByRole("heading", { name: "No encontré lo que buscabas" })).toBeVisible()
  hallazgos.push(...(await revisarConAxe(page, "no encontrado")))
  expect(hallazgos).toEqual([])
})

test("at 375 px with large text the section menu and the quick filters fit, 44 px or more, nothing scrolls sideways (4c)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/biblioteca")
  await conLetraGrande(page)

  const { boton } = menuDeSecciones(page)
  await expect(boton).toBeVisible()
  expect((await boton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  const filtros = page.getByRole("group", { name: "Filtrar por estado" })
  for (const nombre of ["Todos", "Procesando · 2", "Listos", "Con error · 1"]) {
    const chip = filtros.getByRole("link", { name: nombre })
    await expect(chip).toBeVisible()
    expect((await chip.boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
  const masFiltros = page.getByText("Más filtros", { exact: true })
  await expect(masFiltros).toBeVisible()
  expect((await masFiltros.boundingBox())?.height ?? 0, "Más filtros").toBeGreaterThanOrEqual(44)
  const sinDesborde = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
  expect(sinDesborde).toBe(true)
  expect(await revisarConAxe(page, "lista con letra grande")).toEqual([])
})
