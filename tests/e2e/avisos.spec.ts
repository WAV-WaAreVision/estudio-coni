import { createECDH, randomBytes } from "node:crypto"
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, capturar as capturarPantalla, configurarServicios, registroDeServicios } from "./ayudas"

const ENDPOINT = "https://push.fake.test/push/dispositivo-de-coni"

interface Simulacion {
  instalada: boolean
  permiso: "default" | "denied" | "granted"
  /** What the iPhone answers when she taps "Permitir" in its own dialog. */
  respuesta: "granted" | "denied"
}

/**
 * Chromium on a computer cannot subscribe to push (it needs Google's service) and is never "installed", so the page
 * gets the browser APIs of an installed iPhone app: the permission prompt, the worker and the subscription are
 * answered locally. The server side (the database, the push sender) is the real one.
 */
async function simularNavegador(page: Page, simulacion: Simulacion): Promise<void> {
  const navegador = createECDH("prime256v1")
  navegador.generateKeys()
  const llaves = { p256dh: navegador.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") }
  await page.addInitScript(
    ({ instalada, permiso, respuesta, endpoint, claves }) => {
      const estado = { permiso, suscripcion: null as null | object }
      const Notificacion = {
        get permission() {
          return estado.permiso
        },
        async requestPermission() {
          estado.permiso = respuesta
          return respuesta
        },
      }
      Object.defineProperty(window, "Notification", { value: Notificacion, configurable: true })
      Object.defineProperty(window, "PushManager", { value: class {}, configurable: true })
      const suscripcion = {
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: claves.p256dh, auth: claves.auth } }),
        unsubscribe: async () => {
          estado.suscripcion = null
          return true
        },
      }
      const registro = {
        pushManager: {
          getSubscription: async () => estado.suscripcion,
          subscribe: async () => {
            estado.suscripcion = suscripcion
            return suscripcion
          },
        },
      }
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          register: async () => registro,
          ready: Promise.resolve(registro),
          getRegistration: async () => registro,
        },
        configurable: true,
      })
      if (instalada) {
        const original = window.matchMedia.bind(window)
        window.matchMedia = (consulta: string) =>
          consulta.includes("standalone")
            ? ({
                matches: true,
                media: consulta,
                onchange: null,
                addEventListener() {},
                removeEventListener() {},
                addListener() {},
                removeListener() {},
                dispatchEvent: () => false,
              } satisfies MediaQueryList)
            : original(consulta)
      }
    },
    { ...simulacion, endpoint: ENDPOINT, claves: llaves },
  )
}

async function suscripciones() {
  const { rows } = await pool.query<{ endpoint: string }>("select endpoint from public.suscripciones_push")
  return rows
}

/** The section starts below the status block: scroll it to the top so the capture shows the states, not the checklist. */
async function capturar(page: Page, nombre: string) {
  await page.getByRole("heading", { name: "Avisos en tu celular", level: 2 }).scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    const titulo = document.getElementById("avisos")
    if (titulo) window.scrollTo(0, titulo.getBoundingClientRect().top + window.scrollY - 16)
  })
  return capturarPantalla(page, nombre)
}

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await pool.query("delete from public.suscripciones_push")
  await configurarServicios()
})

test.afterAll(async () => {
  await pool.query("delete from public.suscripciones_push")
})

test("an iPhone that opened the app in Safari sees the install sheet and no button to turn notices on", async ({
  page,
}) => {
  await page.goto("/ajustes")

  await expect(page.getByRole("heading", { name: "Agrégala a tu pantalla de inicio" })).toBeVisible()
  await expect(page.getByText("Agregar a inicio")).toBeVisible()
  await expect(page.getByRole("button", { name: "Activar avisos" })).toHaveCount(0)
  await capturar(page, "avisos-instalar")
})

test("the installed app turns notices on after her tap, saves the device and sends a test push", async ({ page }) => {
  await simularNavegador(page, { instalada: true, permiso: "default", respuesta: "granted" })
  await page.goto("/ajustes")

  await expect(page.getByRole("heading", { name: /Configuración: \d de 5 listos/ })).toBeVisible()
  await expect(page.getByRole("listitem").filter({ hasText: "Avisos en tu celular" })).toContainText("Falta")
  await capturar(page, "avisos-listo")
  expect(await suscripciones()).toEqual([])

  await page.getByRole("button", { name: "Activar avisos" }).click()

  await expect(page.getByText("Avisos activados en este celular")).toBeVisible()
  expect(await suscripciones()).toEqual([{ endpoint: ENDPOINT }])
  await capturar(page, "avisos-activo")

  await page.getByRole("button", { name: "Enviar uno de prueba" }).click()
  await expect(page.getByText(/te lo mandé/)).toBeVisible()
  const registro = await registroDeServicios()
  expect(registro.filter((r) => r.ruta === "/push/[x]" && r.metodo === "POST")).toHaveLength(1)
  await capturar(page, "avisos-prueba-enviada")

  // The next visit shows the step as done.
  await page.reload()
  await expect(page.getByRole("listitem").filter({ hasText: "Avisos en tu celular" })).toContainText("Listo")
})

test("tells her how to turn notices on again when she says no, and saves nothing", async ({ page }) => {
  await simularNavegador(page, { instalada: true, permiso: "default", respuesta: "denied" })
  await page.goto("/ajustes")

  await page.getByRole("button", { name: "Activar avisos" }).click()

  await expect(page.getByText("Los avisos están bloqueados")).toBeVisible()
  await expect(page.getByText(/busca Conidolly/)).toBeVisible()
  expect(await suscripciones()).toEqual([])
  await capturar(page, "avisos-denegado")
})

test("a device the push service forgot is dropped and she is told to turn them on again", async ({ page }) => {
  await simularNavegador(page, { instalada: true, permiso: "default", respuesta: "granted" })
  await page.goto("/ajustes")
  await page.getByRole("button", { name: "Activar avisos" }).click()
  await expect(page.getByText("Avisos activados en este celular")).toBeVisible()
  await configurarServicios({ push: "410" })

  await page.getByRole("button", { name: "Enviar uno de prueba" }).click()

  await expect(page.getByRole("alert").filter({ hasText: "Este celular ya no recibe avisos" })).toBeVisible()
  expect(await suscripciones()).toEqual([])
})

test.describe("Avisos en Inicio", () => {
  test.beforeEach(vaciarPiezasEIdeas)

  test("lists what she has not opened, opens the piece on a tap and does not list it again", async ({ page }) => {
    const id = await sembrarPieza("guion_por_aprobar")
    await pool.query(
      "insert into public.avisos (tipo, clave, mensaje) values ('ideas_propuestas', 'ideas_propuestas:e2e', 'Ya tienes ideas nuevas para elegir esta semana.')",
    )
    await page.goto("/")

    const seccion = page.getByRole("region", { name: "Avisos" })
    await expect(seccion.getByRole("link")).toHaveCount(2)
    await expect(seccion.getByText("Tu guion «Prueba» está listo para revisar.")).toBeVisible()
    await seccion.scrollIntoViewIfNeeded()
    await capturarPantalla(page, "avisos-inicio")

    await seccion.getByRole("link", { name: /Prueba/ }).click()
    await expect(page).toHaveURL(new RegExp(`/guion/${id}$`))
    const { rows } = await pool.query("select leido_en from public.avisos where tipo = 'guion_listo'")
    expect(rows[0]?.leido_en).not.toBeNull()

    await page.goto("/")
    await expect(seccion.getByRole("link")).toHaveCount(1)
    await expect(seccion.getByText(/Prueba/)).toHaveCount(0)
  })

  test("shows no Avisos block when there is nothing unread", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Hola, Coni", { exact: true })).toBeVisible()
    await expect(page.getByRole("region", { name: "Avisos" })).toHaveCount(0)
  })
})
