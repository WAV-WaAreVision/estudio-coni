import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, tocarHastaLlegar } from "./ayudas"
import {
  AUTORA,
  type EscenaDeAutoresYTemas,
  IDEA_DE_CONI,
  IDEA_QUE_SE_OCULTA,
  IDEA_UNICA_DE_PAUSAS,
  OTRO_TEMA,
  PILAR,
  sembrarAutoresYTemas,
  sembrarTemasEnBucle,
  TEMA_DE_UN_AUTOR,
  TEMA_FUSIONADO,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

// The query of a Temas address without its cache-busting `v`, so the filters compare whatever their order.
function filtrosDe(direccion: string): Record<string, string> {
  const url = new URL(direccion)
  expect(url.pathname).toBe("/biblioteca/temas")
  return Object.fromEntries([...url.searchParams].filter(([clave]) => clave !== "v"))
}

const NOTA = "La oculté. La puedes volver a mostrar desde su autor."
const NOTA_DE_LA_ULTIMA =
  "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor."
const NOTA_TRAS_MOSTRAR = "La volví a mostrar. Está en «Sin tema todavía»."
/** The note after Ocultar or Mostrar: always mounted, so it can take the focus (deviation 14). */
const AVISO = "#aviso-de-ideas"

let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("Temas shows each topic with counts without zeros and its badges, most authors first; merged ones stay out", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas")
  await expect(
    page.getByRole("navigation", { name: "Secciones de la Biblioteca" }).getByRole("link", { name: "Temas" }),
  ).toHaveAttribute("aria-current", "page")
  const tarjetas = page.getByRole("list", { name: "Temas" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(3)
  await expect(tarjetas.nth(0)).toContainText(TEMA_PRINCIPAL)
  await expect(tarjetas.nth(0)).toContainText("3 ideas sacadas · 2 autores")
  await expect(tarjetas.nth(0)).toContainText("Ya lo traté")
  await expect(tarjetas.nth(0)).not.toContainText("Un solo autor")
  await expect(tarjetas.nth(1)).toContainText(TEMA_DE_UN_AUTOR)
  await expect(tarjetas.nth(1)).toContainText("2 ideas sacadas · 1 autor")
  await expect(tarjetas.nth(1)).toContainText("Un solo autor")
  await expect(tarjetas.nth(2)).toContainText(OTRO_TEMA)
  await expect(tarjetas.nth(2)).toContainText("1 idea sacada · 1 autor")
  await expect(page.getByText(TEMA_FUSIONADO)).toHaveCount(0)
})

test("the quick filters split by coverage in one tap, live in the URL, and an unknown value reads as Todos", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas")
  const tarjetas = page.getByRole("list", { name: "Temas" }).getByRole("listitem")
  const filtros = page.getByRole("group", { name: "Filtrar temas" })
  await expect(filtros.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page")

  await tocarHastaLlegar(
    page,
    filtros.getByRole("link", { name: "Sin tratar · 2" }),
    /\/biblioteca\/temas\?cobertura=sin-tratar(?:[?&]v=\d+)?$/,
  )
  await expect(tarjetas).toHaveCount(2)
  await expect(page.getByRole("list", { name: "Temas" })).not.toContainText(TEMA_PRINCIPAL)

  await tocarHastaLlegar(
    page,
    filtros.getByRole("link", { name: "Ya los traté · 1" }),
    /\/biblioteca\/temas\?cobertura=tratados(?:[?&]v=\d+)?$/,
  )
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(TEMA_PRINCIPAL)

  await tocarHastaLlegar(
    page,
    filtros.getByRole("link", { name: "Un solo autor · 2" }),
    /\/biblioteca\/temas\?cobertura=un-autor(?:[?&]v=\d+)?$/,
  )
  await expect(tarjetas).toHaveCount(2)

  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?cobertura=tratados(?:[?&]v=\d+)?$/)
  await expect(tarjetas).toHaveCount(1)

  await page.goto("/biblioteca/temas?cobertura=otra")
  await expect(filtros.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page")
  await expect(tarjetas).toHaveCount(3)
})

test("the pillar under Más filtros combines with the coverage, and its counts follow it", async ({ page }) => {
  await page.goto("/biblioteca/temas?cobertura=tratados")
  await page.getByText("Más filtros", { exact: true }).click()
  await page.getByLabel("Pilar").selectOption({ label: PILAR })
  await page.getByRole("button", { name: "Filtrar" }).click()

  await expect.poll(() => filtrosDe(page.url())).toEqual({ pilar: escena.pilar, cobertura: "tratados" })
  const tarjetas = page.getByRole("list", { name: "Temas" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(TEMA_PRINCIPAL)
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()

  const filtros = page.getByRole("group", { name: "Filtrar temas" })
  // Under this pillar nothing is untreated: the chip drops its zero.
  await tocarHastaLlegar(
    page,
    filtros.getByRole("link", { name: "Sin tratar", exact: true }),
    /\/biblioteca\/temas\?(?:.*&)?cobertura=sin-tratar(?:&|$)/,
  )
  expect(filtrosDe(page.url())).toEqual({ pilar: escena.pilar, cobertura: "sin-tratar" })
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()

  await page.getByRole("link", { name: "Quitar este filtro" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?cobertura=sin-tratar(?:[?&]v=\d+)?$/)
  await expect(tarjetas).toHaveCount(2)
})

test("a topic's page groups its ideas by author; Ocultar takes one out with a quiet note that takes the focus", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
  await expect(page.getByText("3 ideas sacadas · 2 autores")).toBeVisible()
  await expect(page.getByRole("heading", { name: AUTORA, level: 2 }).getByRole("link")).toHaveAttribute(
    "href",
    `/biblioteca/autores/${escena.autora}`,
  )
  await expect(page.getByRole("list", { name: `Ideas de ${escena.nombreDeConi}` })).toContainText(IDEA_DE_CONI)
  const deDaniela = page.getByRole("list", { name: `Ideas de ${AUTORA}` }).getByRole("listitem")
  await expect(deDaniela).toHaveCount(2)

  await deDaniela.filter({ hasText: IDEA_QUE_SE_OCULTA }).getByRole("button", { name: "Ocultar" }).click()
  // The server answers with the topic's own address and ?oculta=<idea> (deviation 14); the note says it, holds the
  // focus while the button leaves, and the parameter leaves the address so a reload does not say it again.
  const aviso = page.locator(AVISO)
  await expect(aviso).toHaveText(NOTA)
  await expect(aviso).toBeFocused()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/temas/${escena.carga}$`))
  await expect(deDaniela).toHaveCount(1)
  await expect(page.getByText(IDEA_QUE_SE_OCULTA)).toHaveCount(0)
  await expect(page.getByText("2 ideas sacadas · 2 autores")).toBeVisible()
  const { rows } = await pool.query<{ excluida: boolean; tema_id: string | null }>(
    "select excluida, tema_id from public.afirmaciones where texto = $1",
    [IDEA_QUE_SE_OCULTA],
  )
  expect(rows).toEqual([{ excluida: true, tema_id: null }])

  await page.reload()
  await expect(page.getByText(IDEA_DE_CONI)).toBeVisible()
  await expect(aviso).toBeEmpty()
})

test("Mostrar on the author's page brings a hidden idea back under «Sin tema todavía» with its own note (deviation 2)", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await page
    .getByRole("list", { name: `Ideas de ${AUTORA}` })
    .getByRole("listitem")
    .filter({ hasText: IDEA_QUE_SE_OCULTA })
    .getByRole("button", { name: "Ocultar" })
    .click()
  await expect(page.locator(AVISO)).toHaveText(NOTA)

  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByRole("list", { name: "Ideas sin tema todavía" })).toHaveCount(0)
  await page.getByText("Ideas ocultas (1)").click()
  const oculta = page.getByRole("list", { name: "Ideas ocultas" }).getByRole("listitem")
  await expect(oculta).toContainText(IDEA_QUE_SE_OCULTA)
  await oculta.getByRole("button", { name: "Mostrar" }).click()

  const aviso = page.locator(AVISO)
  await expect(aviso).toHaveText(NOTA_TRAS_MOSTRAR)
  await expect(aviso).toBeFocused()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/autores/${escena.autora}$`))
  // Shown again it has no topic until the next maintenance run places it.
  await expect(page.getByRole("heading", { name: "Sin tema todavía", level: 2 })).toBeVisible()
  await expect(page.getByRole("list", { name: "Ideas sin tema todavía" })).toContainText(IDEA_QUE_SE_OCULTA)
  await expect(page.getByText("Ideas ocultas (1)")).toHaveCount(0)
  await expect(page.getByText("2 materiales · 3 ideas sacadas")).toBeVisible()
})

test("hiding the last idea of a topic lands on the list with its own note, the topic gone (deviation 1)", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.pausas}`)
  await page
    .getByRole("listitem")
    .filter({ hasText: IDEA_UNICA_DE_PAUSAS })
    .getByRole("button", { name: "Ocultar" })
    .click()
  await expect(page).toHaveURL(/\/biblioteca\/temas$/)
  const aviso = page.locator(AVISO)
  await expect(aviso).toHaveText(NOTA_DE_LA_ULTIMA)
  await expect(aviso).toBeFocused()
  const lista = page.getByRole("list", { name: "Temas" })
  await expect(lista.getByRole("listitem")).toHaveCount(2)
  await expect(lista).not.toContainText(OTRO_TEMA)
  const { rows } = await pool.query("select 1 from public.temas where id = $1", [escena.pausas])
  expect(rows).toHaveLength(0)

  // The deleted topic's address is not found, not drawn again.
  await page.goto(`/biblioteca/temas/${escena.pausas}`)
  await expect(page.getByRole("heading", { name: "No encontré lo que buscabas" })).toBeVisible()
})

test("a merged topic's address lands on the one that stayed; a loop, a missing topic or a bad id is not found", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.fusionado}`)
  await expect(page).toHaveURL(new RegExp(`/biblioteca/temas/${escena.pausas}$`))
  await expect(page.getByRole("heading", { name: OTRO_TEMA, level: 1 })).toBeVisible()

  const bucle = await sembrarTemasEnBucle()
  for (const ruta of [
    `/biblioteca/temas/${bucle}`,
    "/biblioteca/temas/00000000-0000-4000-8000-000000000000",
    "/biblioteca/temas/no-es-un-id",
    "/biblioteca/autores/00000000-0000-4000-8000-000000000000",
    "/biblioteca/autores/no-es-un-id",
  ]) {
    await page.goto(ruta)
    await expect(page.getByRole("heading", { name: "No encontré lo que buscabas" }), ruta).toBeVisible()
  }
})
