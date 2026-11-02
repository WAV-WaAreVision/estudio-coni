import { expect, test } from "@playwright/test"
import coniConfig from "../fixtures/coni.config.json"
import { pool } from "../integration/db"
import {
  abrirDesplegable,
  alerta,
  bloquearRedExterna,
  capturar,
  configurarServicios,
  conLetraGrande,
  registroDeServicios,
} from "./ayudas"
import { URL_DE_LA_APP } from "./entorno"

const NOMBRES_DE_LLAVES = "('heygen','elevenlabs','anthropic','meta')"
const DIA = 24 * 60 * 60 * 1000

async function limpiar() {
  await pool.query(`delete from vault.secrets where name in ${NOMBRES_DE_LLAVES}`)
  await pool.query(
    "update public.ajustes set produccion = '{}'::jsonb, meta_cuenta_id = null, meta_token_expira_en = null, meta = 'consultas', dias_publicacion = '{2,4,6}', hora_publicacion = '19:00', tope_mensual_usd = 40, limite_duro_usd = null, avisos_resumen = true, avisos_urgentes = true",
  )
  await pool.query("delete from public.gastos")
}

async function conectarTodo(vence: number = 40 * DIA) {
  for (const nombre of ["heygen", "elevenlabs", "anthropic", "meta"]) {
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
  await pool.query(
    "update public.ajustes set produccion = $1::jsonb, meta_cuenta_id = '17841400000000000', meta_token_expira_en = $2",
    [JSON.stringify(coniConfig), new Date(Date.now() + vence).toISOString()],
  )
}

async function ajustes() {
  const { rows } = await pool.query("select * from public.ajustes")
  return rows[0]
}

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await limpiar()
  await configurarServicios()
})

test.afterAll(limpiar)

test("while nothing is set up the block counts the steps and offers the first one", async ({ page }) => {
  await page.goto("/ajustes")

  await expect(page.getByRole("heading", { name: "Ajustes", level: 1 })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Configuración: 0 de 4 listos" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Conectar Instagram" }).first()).toHaveAttribute(
    "href",
    "/api/meta/conectar",
  )
  await expect(page.getByRole("link", { name: "Ajustes" })).toHaveAttribute("aria-current", "page")
  await capturar(page, "ajustes-configurando")
})

test("when every account answers, the block says everything is connected", async ({ page }) => {
  await conectarTodo()

  // Once nothing is missing the status block leaves Ajustes and the good news lives with the accounts.
  await page.goto("/ajustes")
  await expect(page.getByRole("heading", { name: /Configuración|Todo conectado/ })).toHaveCount(0)
  await abrirDesplegable(page, "Para WAV")
  await page.getByRole("link", { name: "Cuentas conectadas" }).click()
  await expect(page).toHaveURL(/\/ajustes\/cuentas$/)

  await expect(page.getByRole("heading", { name: "Todo conectado" })).toBeVisible()
  await expect(page.getByText(/respondieron hoy a las \d\d:\d\d\./)).toBeVisible()
  await expect(page.getByText("Conectada", { exact: true })).toHaveCount(4)
  await capturar(page, "ajustes-todo-bien")
})

test("when Instagram is about to expire, the block warns with the days and one action", async ({ page }) => {
  await conectarTodo(6 * DIA - 60_000)

  await page.goto("/ajustes")

  await expect(page.getByRole("heading", { name: "Instagram vence en 6 días" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Renovar Instagram" }).first()).toHaveAttribute(
    "href",
    "/api/meta/conectar",
  )
  await capturar(page, "ajustes-vence")
})

test("a key a provider refuses is flagged, and one that cannot be checked is not blamed", async ({ page }) => {
  await conectarTodo()
  await configurarServicios({ heygen: "401", anthropic: "500" })

  await page.goto("/ajustes")

  await expect(page.getByRole("heading", { name: "HeyGen no aceptó la llave" })).toBeVisible()
  await abrirDesplegable(page, "Para WAV")
  await page.getByRole("link", { name: "Cuentas conectadas" }).click()
  await expect(page.getByText("No aceptó la llave", { exact: true })).toBeVisible()
  await expect(page.getByText("Sin revisar")).toBeVisible()
})

test("settings save by themselves and can be undone", async ({ page }) => {
  await page.goto("/ajustes")

  const meta = page.getByRole("combobox", { name: "Meta de este mes" })
  await meta.selectOption("talleres")
  await expect(page.getByText("Guardado")).toBeVisible()
  await expect.poll(async () => (await ajustes()).meta).toBe("talleres")
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect.poll(async () => (await ajustes()).meta).toBe("consultas")
  await expect(meta).toHaveValue("consultas")

  await page.getByRole("button", { name: "Lun" }).click()
  await expect.poll(async () => (await ajustes()).dias_publicacion).toEqual([1, 2, 4, 6])

  const hora = page.getByLabel("Hora de publicación")
  await hora.fill("20:30")
  await expect.poll(async () => (await ajustes()).hora_publicacion).toBe("20:30:00")

  await page.getByRole("switch", { name: "Avisarme apenas falle algo" }).click()
  await expect.poll(async () => (await ajustes()).avisos_urgentes).toBe(false)

  await page.reload()
  await expect(page.getByRole("button", { name: "Lun" })).toHaveAttribute("aria-pressed", "true")
  await capturar(page, "ajustes-editar")
})

test("she enters a key: it is checked with the provider, saved only if it works, and the status follows", async ({
  page,
}) => {
  await configurarServicios({ heygen: "401" })
  await page.goto("/ajustes/cuentas")

  await page.getByRole("button", { name: "Agregar la llave de HeyGen" }).click()
  await page.getByLabel("Llave de HeyGen").fill("hg-la-llave-mala-de-prueba")
  await page.getByRole("button", { name: "Guardar y comprobar" }).click()
  await expect(alerta(page, "HeyGen no aceptó esa llave")).toBeVisible()
  const { rows: antes } = await pool.query("select 1 from vault.secrets where name = 'heygen'")
  expect(antes).toEqual([])

  await configurarServicios({ heygen: "ok" })
  await page.getByLabel("Llave de HeyGen").fill("hg-la-llave-buena-de-prueba")
  await page.getByRole("button", { name: "Guardar y comprobar" }).click()

  await expect(page.getByText("Guardada y comprobada.")).toBeVisible()
  const { rows } = await pool.query("select decrypted_secret from vault.decrypted_secrets where name = 'heygen'")
  expect(rows[0].decrypted_secret).toBe("hg-la-llave-buena-de-prueba")
  await page.goto("/ajustes")
  await expect(page.getByRole("heading", { name: "Configuración: 1 de 4 listos" })).toBeVisible()
  // The key is never written back into the page.
  expect(await page.content()).not.toContain("hg-la-llave-buena-de-prueba")
})

test.describe("Conectar Instagram", () => {
  /**
   * Instagram's window, answered by the test: it sends her back with a code, the state it was given, or a refusal.
   * Chromium does not hand a server redirect's next hop to `page.route`, so the real Instagram would be reached. The
   * redirect is read here, where the app answers it, and the hop to Instagram is replaced by the way back.
   */
  async function instagramResponde(page: import("@playwright/test").Page, llegada: (estado: string) => string) {
    await page.route(`${URL_DE_LA_APP}/api/meta/conectar`, async (ruta) => {
      const respuesta = await ruta.fetch({ maxRedirects: 0 })
      const destino = new URL(respuesta.headers().location ?? "")
      expect(`${destino.origin}${destino.pathname}`).toBe("https://www.instagram.com/oauth/authorize")
      expect(destino.searchParams.get("client_id")).toBe("1234567890")
      expect(destino.searchParams.get("scope")).toBe(
        "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights",
      )
      expect(destino.searchParams.get("redirect_uri")).toBe(`${URL_DE_LA_APP}/api/meta/callback`)
      const estado = destino.searchParams.get("state") ?? ""
      await ruta.fulfill({
        response: respuesta,
        headers: { ...respuesta.headers(), location: `${URL_DE_LA_APP}/api/meta/callback${llegada(estado)}` },
      })
    })
  }

  test("she says yes: the token, the account and the expiry are saved and the status follows", async ({ page }) => {
    await instagramResponde(page, (estado) => `?code=el-codigo-e2e&state=${estado}`)
    await page.goto("/ajustes")

    await page.getByRole("link", { name: "Conectar Instagram" }).first().click()

    await expect(page).toHaveURL(/\/ajustes\/cuentas\?instagram=conectada$/)
    await expect(page.getByText("Instagram quedó conectado.")).toBeVisible()
    const fila = await ajustes()
    expect(fila.meta_cuenta_id).toBe("17841400000000000")
    expect(Date.parse(fila.meta_token_expira_en) - Date.now()).toBeGreaterThan(59 * DIA)
    const { rows } = await pool.query("select decrypted_secret from vault.decrypted_secrets where name = 'meta'")
    expect(rows[0].decrypted_secret).toBe("IGQ_largo_falso")
    const rutas = (await registroDeServicios()).map((l) => l.ruta)
    expect(rutas).toEqual(["/oauth/access_token", "/access_token", "/v25.0/me"])
    // The secrets never reach the log of the fake service.
    expect((await registroDeServicios()).map((l) => l.cuerpo).join("")).not.toContain("secreto-de-la-app-e2e")
    await capturar(page, "ajustes-instagram-conectado")
  })

  test("a callback that did not start here is refused and saves nothing", async ({ page }) => {
    await page.goto("/api/meta/callback?code=cualquiera&state=inventado")

    await expect(page).toHaveURL(/\/ajustes\/cuentas\?instagram=estado$/)
    await expect(page.getByText("La conexión con Instagram venció antes de terminar.")).toBeVisible()
    expect((await ajustes()).meta_cuenta_id).toBeNull()
    expect(await registroDeServicios()).toEqual([])
  })

  test("the state works once: replaying the callback is refused", async ({ page }) => {
    let usado = ""
    await instagramResponde(page, (estado) => {
      usado = estado
      return `?code=el-codigo-e2e&state=${estado}`
    })
    await page.goto("/api/meta/conectar")
    await expect(page).toHaveURL(/instagram=conectada$/)

    await page.goto(`/api/meta/callback?code=otra-vez&state=${usado}`)

    await expect(page).toHaveURL(/instagram=estado$/)
  })

  test("she cancels in Instagram's window and nothing changes", async ({ page }) => {
    await instagramResponde(page, (estado) => `?error=access_denied&error_reason=user_denied&state=${estado}`)

    await page.goto("/api/meta/conectar")

    await expect(page).toHaveURL(/\/ajustes\/cuentas\?instagram=cancelada$/)
    await expect(page.getByText("Cancelaste la conexión con Instagram.")).toBeVisible()
    expect((await ajustes()).meta_cuenta_id).toBeNull()
  })

  test("Instagram refuses the code: she is told and nothing is saved", async ({ page }) => {
    await configurarServicios({ instagram: "rechazo" })
    await instagramResponde(page, (estado) => `?code=vencido&state=${estado}`)

    await page.goto("/api/meta/conectar")

    await expect(page).toHaveURL(/instagram=rechazada$/)
    await expect(alerta(page, "Instagram no aceptó la conexión.")).toBeVisible()
    expect((await ajustes()).meta_cuenta_id).toBeNull()
  })
})

test("signing out takes her to the code screen and the app asks for it again", async ({ browser }) => {
  // Its own session, so it does not end the one the other specs share.
  const { entrarComo } = await import("./ayudas")
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await entrarComo(contexto, "coni@estudio.test")
  const page = await contexto.newPage()
  await page.goto("/ajustes")

  await page.getByRole("button", { name: "Cerrar sesión" }).click()
  await page.getByRole("button", { name: "Sí, cerrar sesión" }).click()

  await expect(page).toHaveURL(/\/ingreso$/)
  await page.goto("/ajustes")
  await expect(page).toHaveURL(/\/ingreso$/)
  await contexto.close()
})

test("the Saldos section shows the ElevenLabs characters and the HeyGen API wallet, and says they are not the plan", async ({
  page,
}) => {
  await conectarTodo()
  await configurarServicios({ heygenSaldo: 12, elevenlabsUsados: 76_600 })

  await page.goto("/ajustes/cuentas")

  await expect(page.getByRole("heading", { name: "Saldos" })).toBeVisible()
  await expect(
    page.getByText("ElevenLabs: te quedan 23.400 de 100.000 caracteres. Se renuevan el 12 de noviembre."),
  ).toBeVisible()
  await expect(page.getByText("Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen.")).toBeVisible()
  await expect(
    page.getByText(
      "El saldo de API de HeyGen es distinto de los créditos de tu plan: Conidolly graba con el saldo de API.",
    ),
  ).toBeVisible()
})

test("each account's name keeps a usable width beside its state pill at large text, Claude (Anthropic) included", async ({
  page,
}) => {
  await conectarTodo()

  await page.goto("/ajustes/cuentas")
  await conLetraGrande(page)

  // At this size the pill may wrap under a long name; what must not happen is the name shrinking to a sliver beside it.
  for (const cuenta of ["heygen", "elevenlabs", "anthropic"]) {
    const fila = page.locator(`#cuenta-${cuenta}`)
    await expect(fila.locator(".pildora").first()).toBeVisible()
    const cabecera = await fila.locator("span.text-guion").locator("..").boundingBox()
    const nombre = await fila.locator("span.text-guion").boundingBox()
    expect(nombre?.width ?? 0, cuenta).toBeGreaterThanOrEqual((cabecera?.width ?? 0) / 2)
  }
})

test("her checklist names only what she acts on, and each state pill stays whole beside its step at large text", async ({
  page,
}) => {
  await page.goto("/ajustes")
  const bloque = page.getByRole("region", { name: /Configuración/ })
  const pasos = bloque.getByRole("listitem")
  // The count of the title runs over the rows under it, and nothing else: LinkedIn sits apart, under «Opcional».
  const contados = bloque.getByRole("list", { name: "Pasos" }).getByRole("listitem")
  await expect(contados).toHaveText([/^Tu voz/, /^Tu avatar/, /^Instagram/, /^Avisos en tu celular/])
  const denominador = (await bloque.getByRole("heading").textContent())?.match(/de (\d+) listos/)?.[1]
  expect(Number(denominador)).toBe(await contados.count())
  const opcionales = bloque.getByRole("list", { name: "Opcional" }).getByRole("listitem")
  await expect(opcionales).toHaveText([/^LinkedIn/])
  await expect(opcionales).toContainText("A mano")
  await expect(page.getByRole("region", { name: /Configuración/ })).not.toContainText(/HeyGen|ElevenLabs|Claude/)

  await conLetraGrande(page)
  for (const pildora of await pasos.locator(".pildora").all()) {
    const lineas = await pildora.evaluate((nodo) => {
      const texto = nodo.lastElementChild ?? nodo
      return Math.round(texto.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(texto).lineHeight))
    })
    expect(lineas, (await pildora.textContent()) ?? "").toBe(1)
  }
})
