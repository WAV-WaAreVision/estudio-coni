import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { capturar } from "./ayudas"
import { PIEZAS } from "./escena"

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
  const video = await pieza("video_por_aprobar", PIEZAS.video.titulo, "etica-regulacion")
  const guion = await pieza("guion_por_aprobar", PIEZAS.guion.titulo, "practica-clinica")
  await pieza("guion_en_proceso", "Cuando tu mente inventa lo peor", "caso-coni")

  await page.goto("/calendario")
  await page.getByRole("link", { name: "Agenda" }).click()

  await expect(page).toHaveURL(/vista=agenda$/)
  await expect(page.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("link", { name: new RegExp(PIEZAS.video.titulo) })).toHaveAttribute(
    "href",
    `/video/${video}`,
  )
  await expect(page.getByRole("link", { name: new RegExp(PIEZAS.guion.titulo) })).toHaveAttribute(
    "href",
    `/guion/${guion}`,
  )
  await expect(page.getByText("Falta tu firma: video y fecha")).toBeVisible()
  await expect(page.getByText("Falta tu firma: guion")).toBeVisible()
  await expect(page.getByText("Guion en preparación")).toBeVisible()
  const libres = page.getByRole("link", { name: "Libre · elige una idea" })
  await expect(libres.first()).toHaveAttribute("href", "/ideas")
  // One free slot as a row; the rest of each week is counted in one line.
  expect(await libres.count()).toBeLessThanOrEqual(1)
  await expect(page.getByText(/^(y )?\d+ espacios? libres?( más)?$/).first()).toBeVisible()
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
  // A free slot is flat and silent, never a tile that reads as a button: one line counts them.
  await expect(page.getByText("libre", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/^\d+ espacios? libres?$/)).toBeVisible()
  const libre = page.locator("[data-libre]").first()
  await expect(libre).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await expect(libre).toHaveCSS("box-shadow", "none")
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

test("Repartir fechas proposes the places the Agenda shows and Cambiar moves one; nothing scheduled moves", async ({
  page,
}) => {
  const video = await pieza("video_por_aprobar", PIEZAS.video.titulo, "etica-regulacion")
  await pieza("guion_por_aprobar", PIEZAS.guion.titulo, "practica-clinica")
  const programada = await pieza("programado", "Ya programado", "caso-coni")

  // Through the tab link, as she gets there: the prefetched Agenda is what has to redraw after the action.
  await page.goto("/calendario")
  await page.getByRole("link", { name: "Agenda" }).click()
  await expect(page.getByText("2 piezas en camino sin fecha propuesta.")).toBeVisible()
  await page.getByRole("button", { name: "Repartir fechas" }).click()

  await expect(page.getByText("Propuse fecha para 2 piezas. Puedes cambiarlas.")).toBeVisible()
  await expect(page.getByText(/ · propuesta$/)).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Repartir fechas" })).toHaveCount(0)
  const filas = await pool.query<{ pieza_id: string }>("select pieza_id from public.fechas_propuestas")
  expect(filas.rows.map((f) => f.pieza_id)).not.toContain(programada)

  const fechaDelVideo = async () => {
    const { rows } = await pool.query<{ publicar_en: Date }>(
      "select publicar_en from public.fechas_propuestas where pieza_id = $1",
      [video],
    )
    return rows[0]?.publicar_en.getTime()
  }
  const antes = await fechaDelVideo()
  await page.getByRole("button", { name: `Cambiar la fecha de ${PIEZAS.video.titulo}` }).click()
  const otroDia = page.getByRole("group", { name: "¿Qué otro día?" }).getByRole("button").first()
  const [dia] = (await otroDia.innerText()).split(" · ")
  await otroDia.click()
  await expect.poll(fechaDelVideo).not.toBe(antes)
  await expect(page.getByRole("link", { name: new RegExp(`^${dia}.*${PIEZAS.video.titulo}`) })).toBeVisible()
  await capturar(page, "calendario-agenda-propuestas")
})
