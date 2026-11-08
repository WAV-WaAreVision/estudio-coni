import { expect, type Locator, type Page, test } from "@playwright/test"
import { etiquetaDeEtapa } from "@/lib/dominio/biblioteca/borradores"
import { pool } from "../integration/db"
import { limpiarBorradores } from "../integration/limpiar-borradores"
import { bloquearRedExterna, revisarConAxe } from "./ayudas"
import {
  AUTORA,
  BORRADOR_DE_INSTAGRAM,
  type EscenaDeAutoresYTemas,
  PILAR,
  PILAR_SECUNDARIO,
  sembrarAutoresYTemas,
  sembrarBorradores,
  sembrarEtapaDeLinkedin,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"
import { anchoDeLectura, type Caja, cajaDe, ladoALado, rem, sobraDeAncho } from "./medidas-de-escritorio"

// The Biblioteca pages that left the width empty, on a computer at 1440 x 900 (issue 103, group C). Measured, no
// baselines.
test.use({ viewport: { width: 1440, height: 900 } })

let escena: EscenaDeAutoresYTemas
let borradores: { pilar: string; red: string }

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
  borradores = await sembrarBorradores()
})

test.afterAll(async () => {
  await limpiarBorradores()
})

const principal = (page: Page) => page.getByTestId("pagina-principal")
const panel = (page: Page) => page.getByTestId("pagina-panel")

/** Measured once it is on screen: the page streams in. */
async function caja(elemento: Locator): Promise<Caja> {
  await expect(elemento).toBeVisible()
  return cajaDe(elemento)
}

/** The Biblioteca's width, no sideways scroll, no axe violations. */
async function revisarPagina(page: Page, nombre: string): Promise<void> {
  await expect(page.locator("[data-ancho=biblioteca]")).toHaveCount(1)
  expect(await sobraDeAncho(page), nombre).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, nombre)).toEqual([])
}

/** The main area beside a 20rem panel, together wider than 900 px. */
async function principalYPanel(page: Page, nombre: string, izquierda: Locator = principal(page)): Promise<void> {
  ladoALado(await caja(izquierda), await caja(panel(page)), nombre)
  expect(Math.round((await caja(panel(page))).width), nombre).toBe(Math.round(20 * (await rem(page))))
}

/** Two cards of one list side by side in the same row. */
async function dosColumnas(lista: Locator, nombre: string): Promise<void> {
  const cartas = lista.getByRole("listitem")
  const primera = await caja(cartas.nth(0))
  const segunda = await caja(cartas.nth(1))
  expect(segunda.left, nombre).toBeGreaterThanOrEqual(primera.right)
  expect(Math.abs(segunda.top - primera.top), nombre).toBeLessThanOrEqual(1)
}

test("an author's page puts its ideas in two columns and the hidden ones and Unir in a side panel", async ({
  page,
}) => {
  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
  await expect(panel(page).getByRole("button", { name: "Unir con otro autor" })).toBeVisible()
  await principalYPanel(page, "autor")
  await dosColumnas(page.getByRole("list", { name: `Ideas sobre ${TEMA_PRINCIPAL}` }), "autor ideas")
  // The name and its lines stay at reading width.
  const encabezado = await caja(principal(page).locator("header"))
  expect(encabezado.width).toBeLessThanOrEqual(42 * (await rem(page)) + 1)
  await revisarPagina(page, "autor")
})

test("a topic's page puts its pillars in a side panel and its ideas in two columns", async ({ page }) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
  await expect(panel(page).getByRole("heading", { name: "Pilares" })).toBeVisible()
  await principalYPanel(page, "tema")
  await dosColumnas(page.getByRole("list", { name: `Ideas de ${AUTORA}` }), "tema ideas")
  // The ideas start under the title, beside the pillars.
  const ideas = await caja(page.getByRole("list", { name: `Ideas de ${AUTORA}` }))
  expect(ideas.right).toBeLessThanOrEqual((await caja(panel(page))).left)
  await revisarPagina(page, "tema")

  // «Cambiar pilares» opens the form inside the panel, which keeps its width.
  await panel(page).getByRole("button", { name: "Cambiar pilares" }).click()
  await expect(panel(page).getByRole("region", { name: "Cambiar pilares" })).toBeVisible()
  expect(Math.round((await caja(panel(page))).width)).toBe(Math.round(20 * (await rem(page))))
  await revisarPagina(page, "tema cambiar pilares")
})

test("Borradores lays the drafts out as a grid, Pilares beside Redes", async ({ page }) => {
  await pool.query(
    `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
     values ('instagram', 'Sueño y pantallas: lo que cambia de noche', 'Sueño y pantallas', 'Lo que la luz y el scroll hacen con el sueño.', 5)`,
  )
  await page.goto("/biblioteca/temas/borradores")
  const pilares = page.getByRole("region", { name: "Pilares de Instagram" })
  const redes = page.getByRole("region", { name: "Redes" })
  ladoALado(await caja(pilares), await caja(redes), "borradores")
  await dosColumnas(pilares.getByRole("list"), "borradores pilares")
  const minimo = 20 * (await rem(page))
  const tarjeta = await caja(page.getByRole("article", { name: BORRADOR_DE_INSTAGRAM.nombre }))
  expect(tarjeta.width).toBeGreaterThanOrEqual(minimo)
  // Two cards of the same row are as tall as each other.
  const cartas = pilares.getByRole("article")
  expect(Math.abs((await caja(cartas.nth(0))).height - (await caja(cartas.nth(1))).height)).toBeLessThanOrEqual(1)
  await revisarPagina(page, "borradores")
})

/** A draft's form at reading width and the panel that says what saving does. */
async function revisarFormulario(page: Page, nombre: string): Promise<void> {
  await expect(panel(page).getByRole("heading", { name: "Al guardar" })).toBeVisible()
  await principalYPanel(page, nombre)
  const formulario = await caja(principal(page))
  expect(formulario.width, nombre).toBeLessThanOrEqual(42 * (await rem(page)) + 1)
  expect(formulario.width, nombre).toBeLessThanOrEqual((await anchoDeLectura(principal(page))) + 1)
  // The title's lines stay at the form's width.
  const encabezado = await caja(page.locator("main h1"))
  expect(encabezado.width, nombre).toBeLessThanOrEqual(formulario.width + 1)
  await revisarPagina(page, nombre)
}

test("Nuevo pilar and Nueva red keep the form at reading width and say what saving does beside it", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas/pilar-nuevo?red=instagram")
  await expect(page.getByLabel("Nombre corto")).toBeVisible()
  await revisarFormulario(page, "pilar nuevo")
  await page.goto("/biblioteca/temas/red-nueva")
  await expect(page.getByRole("heading", { name: "Nueva red", level: 1 })).toBeVisible()
  await revisarFormulario(page, "red nueva")
})

test("editing a pillar draft and a network draft keeps the form at reading width with its panel", async ({ page }) => {
  await page.goto(`/biblioteca/temas/borradores/${borradores.pilar}/editar`)
  await expect(page.getByLabel("Nombre corto")).toHaveValue(BORRADOR_DE_INSTAGRAM.nombreCorto)
  await revisarFormulario(page, "editar pilar")
  await page.goto(`/biblioteca/temas/borradores/${borradores.red}/editar`)
  await expect(page.getByRole("heading", { name: "Editar borrador de red", level: 1 })).toBeVisible()
  await revisarFormulario(page, "editar red")
})

test("approving a pillar lays the weights out as a table, pillar by stage, with the totals in a side panel", async ({
  page,
}) => {
  // LinkedIn, with a later stage of the scene's own: a column of weights per stage.
  const etapa = await sembrarEtapaDeLinkedin()
  const id = (
    await pool.query<{ id: string }>(
      `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
       values ('linkedin', 'Liderazgo sereno: decidir con IA', 'Liderazgo sereno', 'Cómo decide una líder.', 10)
       returning id`,
    )
  ).rows[0]?.id
  if (!id) throw new Error("No se creó el borrador de LinkedIn")
  await page.goto(`/biblioteca/temas/borradores/${id}/aprobar`)
  const hoy = (pilar: string) => page.getByLabel(`${pilar}, Hoy`, { exact: true })
  const despues = (pilar: string) => page.getByLabel(`${pilar}, ${etiquetaDeEtapa(etapa, "")}`, { exact: true })

  // A pillar's weights in one row, one column per stage; the pillars one under another in each column.
  const enHoy = await caja(hoy(PILAR))
  const enLaOtra = await caja(despues(PILAR))
  expect(enLaOtra.left).toBeGreaterThanOrEqual(enHoy.right)
  expect(Math.abs(enLaOtra.top - enHoy.top)).toBeLessThanOrEqual(1)
  const otroPilar = await caja(hoy(PILAR_SECUNDARIO))
  expect(Math.abs(otroPilar.left - enHoy.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(otroPilar.top - enHoy.top)).toBeGreaterThanOrEqual(enHoy.height)
  // The pillar's name heads its row, on the left of its weights.
  const nombre = await caja(page.getByTestId("pesos").getByText(PILAR, { exact: true }))
  expect(nombre.right).toBeLessThanOrEqual(enHoy.left)
  expect(Math.abs(nombre.top + nombre.height / 2 - (enHoy.top + enHoy.height / 2))).toBeLessThanOrEqual(4)

  // Each stage's total and warning in the panel beside the table.
  await principalYPanel(page, "aprobar")
  const totales = page.getByRole("status").filter({ hasText: "Total:" })
  // Today, the seed's stages still ahead and the scene's own: each adds up to 100, plus the draft's 10.
  await expect(totales.first()).toHaveText("Total: 110 %")
  await expect(totales.last()).toHaveText("Total: 110 %")
  expect(await totales.count()).toBeGreaterThanOrEqual(2)
  await expect(panel(page).getByText(/^Los pesos de LinkedIn suman 110 %/)).toBeVisible()
  await hoy(PILAR).fill("15")
  await expect(totales.first()).toHaveText("Total: 100 %")
  await expect(totales.last()).toHaveText("Total: 110 %")
  await expect(panel(page).getByText(/^Los pesos de LinkedIn suman/)).toHaveCount(0)
  await revisarPagina(page, "aprobar")
})

test.describe("at the narrowest computer width", () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test("no Biblioteca page of group C scrolls sideways, and the weights keep their stage groups", async ({ page }) => {
    await pool.query(
      `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
       values ('instagram', 'Sueño y pantallas: lo que cambia de noche', 'Sueño y pantallas', 'Lo que la luz y el scroll hacen con el sueño.', 5)`,
    )
    await sembrarEtapaDeLinkedin()
    const linkedin = (
      await pool.query<{ id: string }>(
        `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
         values ('linkedin', 'Liderazgo sereno: decidir con IA', 'Liderazgo sereno', 'Cómo decide una líder.', 10)
         returning id`,
      )
    ).rows[0]?.id
    if (!linkedin) throw new Error("No se creó el borrador de LinkedIn")
    const rutas = [
      `/biblioteca/autores/${escena.autora}`,
      `/biblioteca/temas/${escena.carga}`,
      "/biblioteca/temas/borradores",
      "/biblioteca/temas/pilar-nuevo?red=instagram",
      "/biblioteca/temas/red-nueva",
      `/biblioteca/temas/borradores/${borradores.pilar}/editar`,
      `/biblioteca/temas/borradores/${linkedin}/aprobar`,
    ]
    for (const ruta of rutas) {
      await page.goto(ruta)
      await expect(page.locator("main h1")).toBeVisible()
      expect(await sobraDeAncho(page), ruta).toBeLessThanOrEqual(0)
    }
    await expect(page.getByRole("group", { name: "Hoy" })).toBeVisible()
  })
})

for (const width of [768, 1024, 1280]) {
  test.describe(`weights at ${width}`, () => {
    test.use({ viewport: { width, height: 1024 } })

    test(`the weights table stays inside its column at ${width} px`, async ({ page }) => {
      await sembrarEtapaDeLinkedin()
      const id = (
        await pool.query<{ id: string }>(
          `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
           values ('linkedin', 'Liderazgo sereno: decidir con IA', 'Liderazgo sereno', 'Cómo decide una líder.', 10)
           returning id`,
        )
      ).rows[0]?.id
      if (!id) throw new Error("No se creó el borrador de LinkedIn")
      await page.goto(`/biblioteca/temas/borradores/${id}/aprobar`)
      const pesos = page.getByTestId("pesos")
      const tabla = await caja(pesos)
      expect(tabla.right).toBeLessThanOrEqual((await caja(page.locator("main"))).right + 1)
      expect(await pesos.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0)
      // Below xl the stages are cards with their own totals, as on a phone; from xl, a table beside the panel.
      if (width >= 1280) expect(tabla.right).toBeLessThanOrEqual((await caja(panel(page))).left + 1)
    })
  })
}
