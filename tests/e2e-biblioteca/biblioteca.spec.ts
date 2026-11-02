import AxeBuilder from "@axe-core/playwright"
import { type BrowserContext, expect, type Page, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { entrarComo } from "../e2e/ayudas"
import {
  CLAVE_ANONIMA,
  CLAVE_DE_SERVICIO,
  CORREO_DE_CONI,
  CORREO_DEL_MANTENEDOR,
  SUPABASE_URL,
  URL_DE_INGESTA,
  URL_SEGURA_DE_LA_APP,
} from "../e2e/entorno"

async function sinViolaciones(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  expect(violations).toEqual([])
}

/** WAV's session in Ingesta: the Datos section is WAV's only (Ingesta's NavegacionPrincipal). */
async function conSesionDeWavEnIngesta(context: BrowserContext, page: Page) {
  await entrarComo(context, CORREO_DEL_MANTENEDOR, URL_DE_INGESTA)
  await page.goto(`${URL_DE_INGESTA}/`)
  const secciones = page.getByRole("navigation", { name: "Secciones" })
  await expect(secciones.getByRole("link", { name: "Datos" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Volver a Conidolly" })).toHaveCount(0)
}

const galletasDeIngesta = async (context: BrowserContext) =>
  (await context.cookies(URL_DE_INGESTA)).map(({ name, value }) => `${name}=${value}`).sort()

test("Coni taps Biblioteca and lands on Ingesta's Materiales signed in, replacing WAV's session there", async ({
  context,
  page,
}) => {
  // A shared computer: WAV left its Ingesta session open.
  await conSesionDeWavEnIngesta(context, page)
  await entrarComo(context, CORREO_DE_CONI)
  const direcciones: string[] = []
  page.on("request", (pedido) => direcciones.push(pedido.url()))
  const puentes = () => direcciones.filter((direccion) => new URL(direccion).pathname === "/ir-a-biblioteca")

  await page.goto("/")
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Biblioteca" }).click()

  await page.waitForURL(`${URL_DE_INGESTA}/`)
  await expect(page.getByRole("heading", { name: "Material de Coni" })).toBeVisible()
  // Only Coni sees the way back, and only WAV sees Datos: this is Coni's session, not WAV's.
  await expect(page.getByRole("link", { name: "Volver a Conidolly" })).toHaveAttribute("href", URL_SEGURA_DE_LA_APP)
  await expect(page.getByRole("link", { name: "Datos" })).toHaveCount(0)
  // The token travelled in a POST body: no address of the trip carries it.
  expect(direcciones.filter((direccion) => /token_hash|[0-9a-f]{56}/.test(direccion))).toEqual([])
  expect(puentes()).toHaveLength(1)

  // Back leaves Ingesta for the Conidolly screen she came from: the bridge page replaced itself, so Back does not
  // land on it and mint another link.
  await page.goBack()
  await expect(page).toHaveURL(`${URL_SEGURA_DE_LA_APP}/`)
  await expect(
    page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Biblioteca" }),
  ).toBeVisible()
  expect(puentes()).toHaveLength(1)

  // Forward again to Ingesta, still as Coni, and back to Conidolly by its own link: her session there is untouched.
  await page.goForward()
  await expect(page).toHaveURL(`${URL_DE_INGESTA}/`)
  await page.getByRole("link", { name: "Volver a Conidolly" }).click()
  await expect(page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Inicio" })).toBeVisible()
  expect(puentes()).toHaveLength(1)
})

test("a bridge POST from another site goes to Ingesta's sign-in and leaves the open session as it was", async ({
  context,
  page,
}) => {
  await conSesionDeWavEnIngesta(context, page)
  const antes = await galletasDeIngesta(context)
  // A real, unused token of Coni: if the Origin check were missing, this POST would swap WAV for Coni.
  const servicio = createClient(SUPABASE_URL, CLAVE_DE_SERVICIO, { auth: { persistSession: false } })
  const enlace = await servicio.auth.admin.generateLink({ type: "magiclink", email: CORREO_DE_CONI })
  if (enlace.error) throw new Error(`No pude generar el enlace de prueba: ${enlace.error.message}`)
  const token = enlace.data.properties.hashed_token

  const respuesta = await page.request.post(`${URL_DE_INGESTA}/ingreso/puente`, {
    form: { token_hash: token },
    headers: { origin: "http://evil.test" },
    maxRedirects: 0,
  })

  expect(respuesta.status()).toBe(303)
  expect(respuesta.headers().location).toBe("/ingreso")
  expect(respuesta.headersArray().filter(({ name }) => name.toLowerCase() === "set-cookie")).toEqual([])
  expect(await galletasDeIngesta(context)).toEqual(antes)
  await page.goto(`${URL_DE_INGESTA}/`)
  await expect(page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Datos" })).toBeVisible()
  // Ingesta never spent the token: it still opens Coni's session once (here, in a throwaway client).
  const anonimo = createClient(SUPABASE_URL, CLAVE_ANONIMA, { auth: { persistSession: false } })
  const verificacion = await anonimo.auth.verifyOtp({ token_hash: token, type: "email" })
  expect(verificacion.error).toBeNull()
})

test("a used or invalid token lands on Ingesta's sign-in with the message, which passes axe", async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, ignoreHTTPSErrors: true })
  const page = await contexto.newPage()

  const respuesta = await page.request.post(`${URL_DE_INGESTA}/ingreso/puente`, {
    form: { token_hash: "0".repeat(56) },
    headers: { origin: URL_SEGURA_DE_LA_APP },
    maxRedirects: 0,
  })
  expect(respuesta.status()).toBe(303)
  expect(respuesta.headers().location).toBe("/ingreso?puente=vencido")

  await page.goto(`${URL_DE_INGESTA}/ingreso?puente=vencido`)
  await expect(page.getByRole("status")).toHaveText(
    "El enlace ya se usó o venció. Vuelve a Conidolly y toca Biblioteca otra vez.",
  )
  await sinViolaciones(page)
  await contexto.close()
})

test("the failure page says what happened, offers the way forward and passes axe", async ({ context, page }) => {
  await entrarComo(context, CORREO_DE_CONI)

  await page.goto("/biblioteca-no-abrio")

  await expect(page.getByText("No pude abrir la Biblioteca.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Volver a intentar" })).toHaveAttribute("href", "/ir-a-biblioteca")
  await sinViolaciones(page)
})
