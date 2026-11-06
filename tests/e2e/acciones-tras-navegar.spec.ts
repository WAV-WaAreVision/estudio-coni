// Regression for #71: every redirecting action runs from a page reached by a client navigation, where Next 16.2.6
// dropped the redirect (6 of 24 runs; the button stayed pending). Next 16.4.5 fixed it upstream (vercel/next.js#95391).
import { expect, type Locator, type Page, test } from "@playwright/test"
import { bloquearRedExterna, entrarComo, leerCodigo, tocarHastaLlegar, vaciarBuzon } from "./ayudas"
import {
  AUTORA,
  CREDENCIAL,
  type EscenaDeAutoresYTemas,
  IDEA_QUE_SE_OCULTA,
  IDEA_UNICA_DE_PAUSAS,
  OTRA_AUTORA,
  OTRO_TEMA,
  sembrarAutoresYTemas,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"
import { CORREO_DE_CONI } from "./entorno"

let escena: EscenaDeAutoresYTemas

function vigilarAcciones(page: Page): string[] {
  const vistas: string[] = []
  page.on("response", async (r) => {
    const h = await r.request().allHeaders()
    if (h["next-action"]) vistas.push(`${r.status()}`)
  })
  return vistas
}

async function llegar(page: Page, destino: RegExp, boton: Locator, acciones: string[], etapa: string) {
  try {
    await expect(page).toHaveURL(destino, { timeout: 10_000 })
  } catch {
    const ocupado = await boton
      .evaluate((b) => (b as HTMLButtonElement).disabled || b.getAttribute("aria-busy") === "true")
      .catch(() => "boton-ausente")
    throw new Error(
      `ACCION_NO_LLEGO[${etapa}] url=${page.url()} botonOcupado=${ocupado} respuestasDeAccion=${acciones.join(",")}`,
    )
  }
}

test.describe("biblioteca", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await bloquearRedExterna(page)
    escena = await sembrarAutoresYTemas()
  })

  test("unir autores from an author page reached by links", async ({ page }) => {
    const acciones = vigilarAcciones(page)
    await page.goto("/biblioteca")
    const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    await tocarHastaLlegar(page, nav.getByRole("link", { name: "Autores" }), /\/biblioteca\/autores(?:[?&]v=\d+)?$/)
    await tocarHastaLlegar(
      page,
      page.getByRole("list", { name: "Autores" }).getByRole("link", { name: new RegExp(OTRA_AUTORA) }),
      new RegExp(`/biblioteca/autores/${escena.otraAutora}$`),
    )
    await page.getByRole("button", { name: "Unir con otro autor" }).click()
    await page.getByLabel("Buscar por nombre").fill("daniela")
    await page
      .getByRole("list", { name: "Con quién unir" })
      .getByRole("button", { name: `${AUTORA}, ${CREDENCIAL}` })
      .click()
    const si = page.getByRole("button", { name: "Sí, unir" })
    await si.click()
    await llegar(page, new RegExp(`/biblioteca/autores/${escena.autora}$`), si, acciones, "unir")
    await expect(page.getByText("3 materiales · 5 ideas sacadas")).toBeVisible()
  })

  test("ocultar, then mostrar, from pages reached by links", async ({ page }) => {
    const acciones = vigilarAcciones(page)
    await page.goto("/biblioteca")
    const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    await tocarHastaLlegar(page, nav.getByRole("link", { name: "Temas" }), /\/biblioteca\/temas(?:[?&]v=\d+)?$/)
    await tocarHastaLlegar(
      page,
      page.getByRole("list", { name: "Temas" }).getByRole("link", { name: new RegExp(TEMA_PRINCIPAL) }),
      new RegExp(`/biblioteca/temas/${escena.carga}$`),
    )
    const ocultar = page
      .getByRole("list", { name: `Ideas de ${AUTORA}` })
      .getByRole("listitem")
      .filter({ hasText: IDEA_QUE_SE_OCULTA })
      .getByRole("button", { name: "Ocultar" })
    await ocultar.click()
    try {
      await expect(page.locator("#aviso-de-ideas")).toHaveText(/La oculté/, { timeout: 10_000 })
    } catch {
      throw new Error(`ACCION_NO_LLEGO[ocultar] url=${page.url()} respuestasDeAccion=${acciones.join(",")}`)
    }

    await tocarHastaLlegar(
      page,
      page.getByRole("heading", { name: AUTORA, level: 2 }).getByRole("link"),
      new RegExp(`/biblioteca/autores/${escena.autora}$`),
    )
    await page.getByText("Ideas ocultas (1)").click()
    const mostrar = page
      .getByRole("list", { name: "Ideas ocultas" })
      .getByRole("listitem")
      .getByRole("button", { name: "Mostrar" })
    await mostrar.click()
    try {
      await expect(page.locator("#aviso-de-ideas")).toHaveText(/La volví a mostrar/, { timeout: 10_000 })
    } catch {
      throw new Error(`ACCION_NO_LLEGO[mostrar] url=${page.url()} respuestasDeAccion=${acciones.join(",")}`)
    }
  })

  test("ocultar the last idea of a topic reached by links lands on Temas", async ({ page }) => {
    const acciones = vigilarAcciones(page)
    await page.goto("/biblioteca")
    const nav = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    await tocarHastaLlegar(page, nav.getByRole("link", { name: "Temas" }), /\/biblioteca\/temas(?:[?&]v=\d+)?$/)
    await tocarHastaLlegar(
      page,
      page.getByRole("list", { name: "Temas" }).getByRole("link", { name: new RegExp(OTRO_TEMA) }),
      new RegExp(`/biblioteca/temas/${escena.pausas}$`),
    )
    const ocultar = page
      .getByRole("listitem")
      .filter({ hasText: IDEA_UNICA_DE_PAUSAS })
      .getByRole("button", { name: "Ocultar" })
    await ocultar.click()
    await llegar(page, /\/biblioteca\/temas(?:\?.*)?$/, ocultar, acciones, "ocultar-ultima")
  })
})

test("cerrar sesión from Ajustes reached by a link, then verificar código on /ingreso", async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await entrarComo(contexto, CORREO_DE_CONI)
  const page = await contexto.newPage()
  const acciones = vigilarAcciones(page)
  await page.goto("/")
  await tocarHastaLlegar(page, page.getByRole("navigation").getByRole("link", { name: "Ajustes" }), /\/ajustes$/)
  await page.getByRole("button", { name: "Cerrar sesión" }).click()
  const si = page.getByRole("button", { name: "Sí, cerrar sesión" })
  await si.click()
  await llegar(page, /\/ingreso$/, si, acciones, "cerrar-sesion")

  await vaciarBuzon()
  await page.getByRole("button", { name: "Mandarme el código" }).click()
  const primera = page.getByRole("textbox", { name: "Número 1 de 6" })
  await expect(primera).toBeVisible()
  const codigo = await leerCodigo(CORREO_DE_CONI)
  await primera.click()
  await page.keyboard.type(codigo)
  await llegar(page, /\/$/, primera, acciones, "verificar-codigo")
  await expect(page.getByText("Hola, Coni", { exact: true })).toBeVisible()
  await contexto.close()
})
