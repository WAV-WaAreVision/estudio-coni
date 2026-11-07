import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import {
  abrirDesplegable,
  abrirMenuDeSecciones,
  alerta,
  bloquearRedExterna,
  conLetraGrande,
  disparosDelMotor,
  entrarComo,
  irASeccion,
  limpiarDisparos,
  menuDeSecciones,
  revisarConAxe,
  tocarHastaLlegar,
} from "./ayudas"
import {
  MOTIVO_DE_FALLA,
  OTRA_RAZON_DE_CRUCE,
  RAZON_DE_CRUCE,
  sembrarSemana,
  TEMA_DE_UN_AUTOR,
  TEMA_PRINCIPAL,
  TEMA_QUE_YA_NO_ESTA,
  TEORIA_DEBIL,
  TEORIA_PRINCIPAL,
} from "./biblioteca-escena"
import { CORREO_DEL_MANTENEDOR } from "./entorno"

const YA_PROPUSO = "El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes."
const PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."
const LO_CRUZADO = "Lo que el motor cruzó esta semana"

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  limpiarDisparos()
})

test("shows the run first, then what the engine crossed with its topics, the folded crossings and what to upload", async ({
  page,
}) => {
  const escena = await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  const corrida = page.getByRole("complementary", { name: "Corrida del motor" })
  await expect(corrida.getByText("Lista", { exact: true })).toBeVisible()
  await expect(corrida.getByText("3 ideas nuevas · Costó US$ 0,21")).toBeVisible()
  await expect(corrida.getByText("Cuesta cerca de US$ 0,23")).toBeVisible()

  const cruzado = page.getByRole("region", { name: LO_CRUZADO })
  await expect(cruzado.getByRole("heading", { level: 3 })).toHaveText([TEORIA_PRINCIPAL, TEORIA_DEBIL])
  await expect(cruzado.getByText("Respaldo: fuerte")).toBeVisible()
  await expect(cruzado.getByText("Respaldo: débil")).toBeVisible()
  await expect(cruzado.getByText("Puntaje: 0,82")).toBeHidden()
  const temas = cruzado.getByRole("list", { name: `Temas de «${TEORIA_PRINCIPAL}»` })
  await expect(temas.getByRole("link", { name: TEMA_PRINCIPAL })).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.carga}`,
  )
  await expect(cruzado.getByRole("list", { name: `Temas de «${TEORIA_DEBIL}»` }).getByRole("link")).toHaveCount(1)

  await expect(page.getByText(RAZON_DE_CRUCE)).toBeHidden()
  await abrirDesplegable(page, "Cruces que no sirvieron (2)")
  await expect(page.getByText(RAZON_DE_CRUCE)).toBeVisible()
  await expect(page.getByText(OTRA_RAZON_DE_CRUCE)).toBeVisible()

  const subir = page.getByRole("region", { name: "Qué subir después" })
  await expect(subir.getByRole("link", { name: TEMA_DE_UN_AUTOR })).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.deUnAutor}`,
  )
  await expect(subir.getByText(TEMA_QUE_YA_NO_ESTA)).toBeVisible()
  await expect(subir.getByRole("link", { name: TEMA_QUE_YA_NO_ESTA })).toHaveCount(0)
  await expect(subir.getByText("Psicología en la mesa · LinkedIn")).toBeVisible()
  await expect(subir.getByText(/Pareja/)).toHaveCount(0)

  // One column, in the phone's order.
  const [arriba, medio, abajo] = await Promise.all([corrida.boundingBox(), cruzado.boundingBox(), subir.boundingBox()])
  expect((arriba?.y ?? 0) < (medio?.y ?? 0) && (medio?.y ?? 0) < (abajo?.y ?? 0)).toBe(true)
  expect(await revisarConAxe(page, "semana con los cruces abiertos")).toEqual([])
})

test("Detalle para WAV opens on a theory with its score", async ({ page }) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  const teoria = page
    .getByRole("region", { name: LO_CRUZADO })
    .getByRole("listitem")
    .filter({ hasText: TEORIA_PRINCIPAL })
  await abrirDesplegable(teoria, "Detalle para WAV")
  await expect(teoria.getByText("Puntaje: 0,82")).toBeVisible()
})

test("a theory's topic leads to the topic's page", async ({ page }) => {
  const escena = await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  await tocarHastaLlegar(
    page,
    page
      .getByRole("list", { name: `Temas de «${TEORIA_PRINCIPAL}»` })
      .getByRole("link", { name: TEMA_PRINCIPAL, exact: true }),
    new RegExp(`/biblioteca/temas/${escena.carga}$`),
  )
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
})

test("Proponer ahora on a ready week or a run still alive says the engine already proposed, and starts nothing", async ({
  page,
}) => {
  for (const estado of ["lista", "corriendo"] as const) {
    await sembrarSemana({ estado })
    await page.goto("/biblioteca/semana")
    await page.getByRole("button", { name: "Proponer ahora" }).click()
    await expect(alerta(page, YA_PROPUSO)).toBeVisible()
  }
  expect(disparosDelMotor()).toEqual([])
})

test("a failed week shows its reason and can be asked again: the note says the ideas are on their way", async ({
  page,
}) => {
  const escena = await sembrarSemana({ estado: "fallida" })
  await page.goto("/biblioteca/semana")
  await expect(page.getByText("Falló", { exact: true })).toBeVisible()
  await expect(page.getByText(MOTIVO_DE_FALLA)).toBeVisible()
  await expect(page.getByText("Cuesta cerca de US$ 0,25")).toBeVisible()
  await page.getByRole("button", { name: "Proponer ahora" }).click()
  await expect(page.getByRole("status").filter({ hasText: PEDIDO })).toBeVisible()
  // A retry is keyed by the failed run it replaces too (motor:<semana>:<creada_en>), so Trigger never swallows it.
  expect(disparosDelMotor()).toEqual([
    {
      tarea: "motor-manual",
      semana: escena.semana,
      clave: expect.stringMatching(new RegExp(`^motor:${escena.semana}:.+`)),
    },
  ])
  expect(await revisarConAxe(page, "semana fallida tras pedir de nuevo")).toEqual([])
})

test("a run stuck for more than half an hour can be asked again", async ({ page }) => {
  const escena = await sembrarSemana({ estado: "corriendo" })
  await pool.query("update public.motor_corridas set creada_en = now() - interval '31 minutes' where semana = $1", [
    escena.semana,
  ])
  await page.goto("/biblioteca/semana")
  await expect(page.getByText("Trabajando", { exact: true })).toBeVisible()
  await expect(page.getByText("El motor todavía está trabajando en esta semana.")).toBeVisible()
  await page.getByRole("button", { name: "Proponer ahora" }).click()
  await expect(page.getByRole("status").filter({ hasText: PEDIDO })).toBeVisible()
  expect(disparosDelMotor()).toHaveLength(1)
})

test("a run that crossed nothing reads in one line, and before any run one line says when the first comes", async ({
  page,
}) => {
  await sembrarSemana({ estado: "lista", teorias: false })
  await page.goto("/biblioteca/semana")
  await expect(page.getByText("Esta semana el motor no encontró cruces nuevos.")).toBeVisible()
  await expect(page.getByRole("heading", { name: LO_CRUZADO })).toHaveCount(0)
  await expect(page.getByText(/Cruces que no sirvieron/)).toHaveCount(0)

  await sembrarSemana({ estado: null })
  await page.goto("/biblioteca/semana")
  await expect(
    page.getByText("Todavía no corre el motor. La primera tanda llega el domingo a las 20:00."),
  ).toBeVisible()
  await expect(page.getByText("Cuesta cerca de US$ 0,30")).toBeVisible()
  await expect(page.getByRole("region", { name: "Qué subir después" })).toHaveCount(0)
})

test("the section menu reaches Semana from Temas and marks it as the open section", async ({ page }) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/temas")
  await irASeccion(page, "Semana", /\/biblioteca\/semana(?:[?&]v=\d+)?$/)
  const { nav, boton } = menuDeSecciones(page)
  await expect(boton).toHaveAccessibleName("Sección de la Biblioteca: Semana")
  await abrirMenuDeSecciones(page)
  await expect(nav.getByRole("link", { name: "Semana" })).toHaveAttribute("aria-current", "page")
})

test("at 375 px with large text the section menu, the button and the theories fit, 44 px or more, nothing scrolls sideways (4n)", async ({
  page,
}) => {
  await sembrarSemana({ estado: "lista" })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/biblioteca/semana")
  await conLetraGrande(page)
  const menu = menuDeSecciones(page).boton
  expect((await menu.boundingBox())?.height ?? 0, "menú").toBeGreaterThanOrEqual(44)
  const secciones = await abrirMenuDeSecciones(page)
  for (const nombre of ["Materiales", "Autores", "Temas", "Semana"]) {
    const caja = await secciones.filter({ hasText: nombre }).boundingBox()
    expect(caja?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
    expect(caja && caja.x >= 0 && caja.x + caja.width <= 375, `${nombre} en pantalla`).toBe(true)
  }
  expect(await revisarConAxe(page, "semana con letra grande y el menú abierto")).toEqual([])
  await page.keyboard.press("Escape")
  const boton = page.getByRole("button", { name: "Proponer ahora" })
  await expect(boton).toBeVisible()
  expect((await boton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole("heading", { name: TEORIA_PRINCIPAL, level: 3 })).toBeVisible()
  const sinDesborde = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
  expect(sinDesborde).toBe(true)
  expect(await revisarConAxe(page, "semana con letra grande")).toEqual([])
})

test("only Coni: without a session it asks to sign in, and the maintainer is refused", async ({ browser }) => {
  await sembrarSemana({ estado: "lista" })
  const sinSesion = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const visitante = await sinSesion.newPage()
  await visitante.goto("/biblioteca/semana")
  await expect(visitante).toHaveURL(/\/ingreso$/)
  await sinSesion.close()

  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const wav = await contexto.newPage()
  await wav.goto("/biblioteca/semana")
  await expect(wav.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
  await expect(wav.getByText(TEORIA_PRINCIPAL)).toHaveCount(0)
  await contexto.close()
})
