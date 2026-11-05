import { expect, type Locator, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, capturar, conLetraGrande, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  CAPA,
  OTRO_TEMA,
  PILAR,
  PILAR_DE_INSTAGRAM,
  sembrarAutoresYTemas,
  TEMA_DE_UN_AUTOR,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

// Coni's acceptance list (respuesta-coni-temas-pilares-2026-11-04.md, part 1, section 7), without 15c's buttons.

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
})

const fila = (page: Page) => page.getByRole("group", { name: "Filtrar temas" })
const red = (page: Page, nombre: "LinkedIn" | "Instagram") =>
  fila(page).getByRole("link", { name: nombre, exact: true })
const pilaresDe = (page: Page, nombre: "LinkedIn" | "Instagram") =>
  page.getByRole("list", { name: `Pilares de ${nombre}` })
// Exact: "Más filtros de temas" also holds "temas", and its list is open when one of its switches is on.
const lista = (page: Page) => page.getByRole("list", { name: "Temas", exact: true })
const tarjetas = (page: Page) => lista(page).getByRole("listitem")
const UN_PILAR = "[0-9a-f-]{36}"

/** Tailwind's shadow-none computes to transparent layers, not "none": relief is a layer with some color. */
async function conRelieve(enlace: Locator): Promise<boolean> {
  return enlace.evaluate((elemento) =>
    getComputedStyle(elemento)
      .boxShadow.split(/,(?![^(]*\))/)
      .some((capa) => capa.trim() !== "none" && !/rgba\([^)]*,\s*0\)/.test(capa)),
  )
}

async function ultimaRed(): Promise<string | null> {
  const { rows } = await pool.query<{ ultima_red: string | null }>("select ultima_red from public.ajustes")
  return rows[0]?.ultima_red ?? null
}

test("Temas opens on the last network she used, LinkedIn the first time, and remembers the one she picks", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas")
  await expect(red(page, "LinkedIn")).toHaveAttribute("aria-current", "true")
  await expect(red(page, "Instagram")).not.toHaveAttribute("aria-current")
  await expect.poll(ultimaRed).toBe("linkedin")

  await tocarHastaLlegar(page, red(page, "Instagram"), /\/biblioteca\/temas\?red=instagram(?:&v=\d+)?$/)
  await expect.poll(ultimaRed).toBe("instagram")
  await page.goto("/biblioteca/temas")
  await expect(red(page, "Instagram")).toHaveAttribute("aria-current", "true")
  await expect(pilaresDe(page, "Instagram")).toBeVisible()
  await expect(pilaresDe(page, "LinkedIn")).toHaveCount(0)
})

test("each network opens its own pillars in order, Capa TDAH last and only outlined; the same network again shows all", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=linkedin")
  await expect(pilaresDe(page, "LinkedIn").getByRole("link")).toHaveText([
    "Todos los pilares",
    "Diagnóstico doble",
    "Bienestar e impacto",
    "Psicología en la mesa",
    "Mujeres líderes",
  ])
  await tocarHastaLlegar(page, red(page, "Instagram"), /\?red=instagram(?:&v=\d+)?$/)
  const deInstagram = pilaresDe(page, "Instagram").getByRole("link")
  await expect(deInstagram).toHaveText([
    "Todos los pilares",
    "Game Over Impostora",
    "Mi nueva partida",
    "Inteligencia emocional",
    CAPA,
  ])
  await expect(pilaresDe(page, "LinkedIn")).toHaveCount(0)
  await expect(deInstagram.last()).toHaveCSS("border-top-style", "solid")
  expect(await conRelieve(deInstagram.last())).toBe(false)
  expect(await conRelieve(deInstagram.nth(1))).toBe(true)
  await capturar(page, "temas-instagram")

  await tocarHastaLlegar(page, deInstagram.last(), new RegExp(`\\?red=instagram&pilar=${UN_PILAR}(?:&v=\\d+)?$`))
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(OTRO_TEMA)
  await tocarHastaLlegar(page, red(page, "Instagram"), /\?red=instagram(?:&v=\d+)?$/)
  await expect(tarjetas(page)).toHaveCount(3)
})

test("a pillar with «Sin tratar» shows only that pillar's topics with nothing out on that network", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=linkedin")
  await tocarHastaLlegar(
    page,
    pilaresDe(page, "LinkedIn").getByRole("link", { name: PILAR, exact: true }),
    new RegExp(`\\?red=linkedin&pilar=${UN_PILAR}(?:&v=\\d+)?$`),
  )
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(TEMA_PRINCIPAL)
  await expect(tarjetas(page).nth(0)).toContainText("Ya lo traté")
  // Carga mental went out on LinkedIn: under its pillar nothing is untreated, and the chip drops its zero.
  await tocarHastaLlegar(
    page,
    fila(page).getByRole("link", { name: "Sin tratar", exact: true }),
    /&sin-tratar=1(?:&v=\d+)?$/,
  )
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
  await expect(fila(page).getByRole("link", { name: "Sin tratar", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  )

  // The switch stays on across networks; the pillar does not.
  await tocarHastaLlegar(page, red(page, "Instagram"), /\?red=instagram&sin-tratar=1(?:&v=\d+)?$/)
  await tocarHastaLlegar(
    page,
    pilaresDe(page, "Instagram").getByRole("link", { name: PILAR_DE_INSTAGRAM, exact: true }),
    new RegExp(`\\?red=instagram&pilar=${UN_PILAR}&sin-tratar=1(?:&v=\\d+)?$`),
  )
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(TEMA_DE_UN_AUTOR)
  // One tap off.
  await tocarHastaLlegar(
    page,
    fila(page).getByRole("link", { name: /^Sin tratar/ }),
    new RegExp(`\\?red=instagram&pilar=${UN_PILAR}(?:&v=\\d+)?$`),
  )
  await expect(fila(page).getByRole("link", { name: /^Sin tratar/ })).not.toHaveAttribute("aria-current")
})

test("a topic out on LinkedIn and not on Instagram is «sin tratar» on Instagram and not on LinkedIn", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=linkedin&sin-tratar=1")
  await expect(tarjetas(page)).toHaveCount(2)
  await expect(lista(page)).not.toContainText(TEMA_PRINCIPAL)
  await page.goto("/biblioteca/temas?red=instagram&sin-tratar=1")
  await expect(tarjetas(page)).toHaveCount(3)
  await expect(tarjetas(page).filter({ hasText: TEMA_PRINCIPAL })).not.toContainText("Ya lo traté")
  await page.goto("/biblioteca/temas?red=linkedin")
  await expect(tarjetas(page).filter({ hasText: TEMA_PRINCIPAL })).toContainText("Ya lo traté")
})

test("under Más filtros «Ya los traté» clears «Sin tratar» and «Un solo autor» combines; old addresses still read", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=linkedin&sin-tratar=1")
  await page.getByText("Más filtros", { exact: true }).click()
  await tocarHastaLlegar(
    page,
    page.getByRole("link", { name: "Ya los traté · 1" }),
    /\?red=linkedin&tratados=1(?:&v=\d+)?$/,
  )
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(fila(page).getByRole("link", { name: /^Sin tratar/ })).not.toHaveAttribute("aria-current")
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()
  await tocarHastaLlegar(
    page,
    page.getByRole("link", { name: /^Un solo autor/ }),
    /\?red=linkedin&tratados=1&un-autor=1(?:&v=\d+)?$/,
  )
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
  await page.goBack()
  await expect(tarjetas(page)).toHaveCount(1)

  // Batch 3's ?cobertura= and 15a's ?pilar= without ?red.
  await page.goto("/biblioteca/temas?cobertura=un-autor")
  await expect(tarjetas(page)).toHaveCount(2)
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()
  const { rows } = await pool.query<{ id: string }>(
    "select id from public.categorias where nombre_corto = $1 and red is not null",
    [PILAR_DE_INSTAGRAM],
  )
  await page.goto(`/biblioteca/temas?pilar=${rows[0]?.id ?? ""}`)
  await expect(red(page, "Instagram")).toHaveAttribute("aria-current", "true")
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(TEMA_DE_UN_AUTOR)
  // An invalid value reads as absent: the stored network, no switch.
  await expect.poll(ultimaRed).toBe("instagram")
  await page.goto("/biblioteca/temas?red=youtube&sin-tratar=si")
  await expect(red(page, "Instagram")).toHaveAttribute("aria-current", "true")
  await expect(tarjetas(page)).toHaveCount(3)
})

test("the row passes WCAG 2.x AA, keeps 44 px targets and wraps at large text without sideways scroll", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=instagram")
  expect(await revisarConAxe(page, "temas en instagram")).toEqual([])
  await page.getByText("Más filtros", { exact: true }).click()
  await expect(page.getByRole("link", { name: /^Un solo autor/ })).toBeVisible()
  expect(await revisarConAxe(page, "temas con más filtros")).toEqual([])
  await conLetraGrande(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  )
  for (const enlace of await fila(page).getByRole("link").all()) {
    const nombre = (await enlace.textContent()) ?? ""
    expect((await enlace.boundingBox())?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
  expect(await revisarConAxe(page, "temas con letra grande")).toEqual([])
  await capturar(page, "temas-letra-grande", { completa: true })
})
