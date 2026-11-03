import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, disparosDeMateriales, entrarComo, limpiarDisparos } from "./ayudas"
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
  await expect(
    page.getByRole("navigation", { name: "Secciones de la Biblioteca" }).getByRole("link", { name: "Materiales" }),
  ).toHaveAttribute("aria-current", "page")

  const lista = page.getByRole("list", { name: "Materiales" })
  await expect(lista.getByRole("listitem")).toHaveCount(5)
  const burnout = lista.getByRole("listitem").filter({ hasText: "Burnout y teletrabajo" })
  await expect(burnout).toContainText(`Documento · ${AUTORA} · Referente`)
  await expect(burnout).toContainText(`${TEMA_PRINCIPAL} +1`)
  await expect(burnout).toContainText("Listo")
  await expect(burnout).toContainText("Hace 2 días")
  await expect(lista.getByRole("listitem").filter({ hasText: "Notas del taller" })).toContainText("Con error")
  await expect(lista.getByRole("listitem").filter({ hasText: "Liderar con IA" })).toContainText("Procesando")
  await expect(lista.getByRole("listitem").filter({ hasText: "síndrome del impostor" })).toContainText("Espera tu OK")

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
  await expect(page).toHaveURL(/\/biblioteca\?estado=fallido$/)
  await expect(filtros.getByRole("link", { name: "Con error · 1" })).toHaveAttribute("aria-current", "page")
  await expect(filtros.getByRole("link", { name: "Todos" })).not.toHaveAttribute("aria-current", "page")
  await expect(lista.getByRole("listitem")).toHaveCount(1)

  await filtros.getByRole("link", { name: "Procesando · 2" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=procesando$/)
  await expect(lista.getByRole("listitem")).toHaveCount(2)

  // Back undoes a filter: each one is a link.
  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca\?estado=fallido$/)
  await expect(lista.getByRole("listitem")).toHaveCount(1)

  await filtros.getByRole("link", { name: "Todos" }).click()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(lista.getByRole("listitem")).toHaveCount(5)
})

test("Más filtros folds author, who she is for you and type, and keeps the quick filter", async ({ page }) => {
  await page.goto("/biblioteca?estado=listo")
  await page.getByText("Más filtros", { exact: true }).click()
  await page.getByLabel("¿Quién es para ti?").selectOption({ label: "Estrategia interna" })
  await page.getByRole("button", { name: "Filtrar" }).click()

  // The list writes its params in one order (hrefDeLista), whatever the form sent.
  await expect(page).toHaveURL(/\/biblioteca\?rol=estrategia&estado=listo$/)
  const lista = page.getByRole("list", { name: "Materiales" })
  await expect(lista.getByRole("listitem")).toHaveCount(1)
  await expect(lista).toContainText(TITULO_ESTRATEGIA)
  // With a folded filter on, the chip says how many and comes open.
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "Quitar estos filtros" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=listo$/)
  await expect(lista.getByRole("listitem")).toHaveCount(2)
})

test("Procesar por ~US$ 1,20 on a card starts the run with a key of its own", async ({ page }) => {
  await page.goto("/biblioteca")
  await page.getByRole("button", { name: "Procesar por ~US$ 1,20" }).click()
  await expect(page.getByRole("button", { name: "Procesar por ~US$ 1,20" })).toHaveCount(0, { timeout: 30_000 })
  const disparos = disparosDeMateriales()
  expect(disparos.map((disparo) => disparo.materialId)).toEqual([escena.esperaOk])
  expect(disparos[0]?.clave).toMatch(CLAVE_CON_INTENTO(escena.esperaOk))
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
