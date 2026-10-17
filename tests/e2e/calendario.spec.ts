import { expect, test } from "@playwright/test"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { capturar } from "./ayudas"

test.beforeEach(vaciarPiezasEIdeas)
test.afterAll(vaciarPiezasEIdeas)

async function pieza(destino: Parameters<typeof sembrarPieza>[0], titulo: string, pilar: string) {
  const idea = await sembrarIdea({ pilar, gancho: titulo })
  return sembrarPieza(destino, { titulo, idea_id: idea })
}

test("Inicio links to the calendar, which opens on the month with today marked", async ({ page }) => {
  await page.goto("/")

  await page.getByRole("link", { name: "Ver calendario" }).click()

  await expect(page).toHaveURL(/\/calendario$/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByRole("link", { name: "Mes" })).toHaveAttribute("aria-current", "page")
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1)
  await expect(page.getByText("Nada programado este mes.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Elegir ideas" })).toHaveAttribute("href", "/ideas")
  await capturar(page, "calendario-mes-vacio")
})

test("a scheduled piece shows up among the next ones of the month", async ({ page }) => {
  await pieza("programado", "Si van a discutir, siéntense del mismo lado", "ia-salud-mental")

  await page.goto("/calendario")

  await expect(
    page.getByRole("region", { name: "Próximos" }).getByText("Si van a discutir, siéntense del mismo lado"),
  ).toBeVisible()
  await expect(page.getByText("Nada programado este mes.")).toHaveCount(0)
  await capturar(page, "calendario-mes")
})

test("the agenda places what is on its way in the next slots and leaves the rest free, linking to the ideas", async ({
  page,
}) => {
  const video = await pieza("video_por_aprobar", "Ser tu propia diosa", "etica-regulacion")
  const guion = await pieza("guion_por_aprobar", "El deseo no se apaga, se esconde", "practica-clinica")
  await pieza("guion_en_proceso", "Cuando tu mente inventa lo peor", "caso-coni")

  await page.goto("/calendario")
  await page.getByRole("link", { name: "Agenda" }).click()

  await expect(page).toHaveURL(/vista=agenda$/)
  await expect(page.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("link", { name: /Ser tu propia diosa/ })).toHaveAttribute("href", `/video/${video}`)
  await expect(page.getByRole("link", { name: /El deseo no se apaga, se esconde/ })).toHaveAttribute(
    "href",
    `/guion/${guion}`,
  )
  await expect(page.getByText("Falta tu firma: video y fecha")).toBeVisible()
  await expect(page.getByText("Falta tu firma: guion")).toBeVisible()
  await expect(page.getByText("Guion en preparación")).toBeVisible()
  const libres = page.getByRole("link", { name: "Libre · elige una idea" })
  await expect(libres.first()).toHaveAttribute("href", "/ideas")
  expect(await libres.count()).toBeLessThanOrEqual(3)
  await expect(page.getByText(/^y \d+ libres? más$/).first()).toBeVisible()
  await capturar(page, "calendario-agenda")
})

test("the rhythm shows the last four weeks by the days of the schedule and has no advice without history", async ({
  page,
}) => {
  await pieza("publicado", "Un reel", "acceso-salud-publica")

  await page.goto("/calendario?vista=ritmo")

  await expect(page.getByRole("link", { name: "Ritmo" })).toHaveAttribute("aria-current", "page")
  await expect(
    page.getByText(/^Tu horario tiene 3 espacios por semana\. En estas 4 semanas van \d de \d+\.$/),
  ).toBeVisible()
  await expect(page.getByText("Mar", { exact: true })).toBeVisible()
  await expect(page.getByText("casi siempre quedan libres")).toHaveCount(0)
  // A free slot is a sunken honda tile, as fields and tracks are, never an underline.
  const libre = page.getByText("libre", { exact: true }).first()
  await expect(libre).toHaveCSS("background-color", "rgb(220, 220, 219)")
  await expect(libre).toHaveCSS("box-shadow", /inset/)
  await expect(libre).toHaveCSS("border-bottom-width", "0px")
  await capturar(page, "calendario-ritmo")
})

test("before her first publication, Ritmo says her schedule and links to Ajustes", async ({ page }) => {
  await pieza("programado", "Un reel", "acceso-salud-publica")

  await page.goto("/calendario?vista=ritmo")

  await expect(
    page.getByText(
      /^Todavía no publicas\. Tu ritmo es .+ a las \d{2}:\d{2}\. Cuando salga la primera pieza, aquí verás si vas al día\.$/,
    ),
  ).toBeVisible()
  await expect(page.getByText(/van \d+ de \d+/)).toHaveCount(0)
  await page.getByRole("link", { name: "Cambiar días y hora" }).click()
  await expect(page).toHaveURL(/\/ajustes$/)
})

test("an unknown view falls back to the month instead of an error", async ({ page }) => {
  await page.goto("/calendario?vista=inventada")

  await expect(page.getByRole("link", { name: "Mes" })).toHaveAttribute("aria-current", "page")
})
