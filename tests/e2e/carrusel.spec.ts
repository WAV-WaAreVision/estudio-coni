import { expect, test } from "@playwright/test"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"
import { pool } from "../integration/db"
import { leerFila, sembrarIdea, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  abrirDesplegable,
  bloquearRedExterna,
  configurarServicios,
  disparosRegistrados,
  limpiarDisparos,
} from "./ayudas"
import { CARRUSEL, sembrarCarruselDeEscena } from "./escena"

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  limpiarDisparos()
  await configurarServicios()
})

test("a carousel being written says so and refreshes itself", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("guion_en_proceso")
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("heading", { name: CARRUSEL.titulo, level: 1 })).toBeVisible()
  await expect(page.getByText("Estoy escribiendo el carrusel")).toBeVisible()
})

test("gate 1 of a carousel shows its numbered slides and post, with no voice or avatar step", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Carrusel de LinkedIn · 6 láminas")).toBeVisible()
  await expect(page.getByText("Lámina 1 · Portada")).toBeVisible()
  await expect(page.getByText(LAMINAS_DE_PRUEBA[5]?.texto ?? "")).toBeVisible()
  await expect(page.getByRole("heading", { name: "2. Revisa el texto de la publicación" })).toBeVisible()
  await expect(page.getByText("Elige tu avatar")).toHaveCount(0)
  await expect(page.getByText("Preparar mi voz")).toHaveCount(0)
  await expect(page.getByRole("slider", { name: "Desliza para firmar" })).toHaveAttribute("aria-disabled", "false")
})

test("a signed carousel waits, read only, and says what comes next", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("armando_carrusel")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Firmaste el texto del carrusel")).toBeVisible()
  await expect(page.getByText(/El diseño de las láminas llega en la próxima versión de la app/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Así quedó firmado" })).toBeVisible()
  await expect(page.getByRole("slider")).toHaveCount(0)
})

test("Ideas turns an idea into a LinkedIn carousel and starts writing it", async ({ page }) => {
  await sembrarIdea({ pilar: CARRUSEL.pilar, gancho: CARRUSEL.titulo, numero: 1 })
  await page.goto("/ideas")
  await expect(page.getByRole("radio", { name: "Reel" })).toBeChecked()
  // The radio covers its row (Eleccion): the click lands on the input, as her tap does.
  await page.getByRole("radio", { name: "Carrusel de LinkedIn" }).check()
  await page.getByRole("button", { name: "Hacer el carrusel" }).click()
  await expect(page.getByText("Escribiendo el carrusel. Te aviso cuando esté.")).toBeVisible()

  const { rows } = await pool.query("select id, tipo, destinos, estado from public.piezas where titulo = $1", [
    CARRUSEL.titulo,
  ])
  expect(rows).toMatchObject([{ tipo: "carrusel", destinos: ["linkedin"], estado: "guion_en_proceso" }])
  expect(disparosRegistrados()).toMatchObject([{ tarea: "producir", piezaId: rows[0]?.id }])
})

test("Pedir cambio sends her sentence and the carousel goes back to be written", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await abrirDesplegable(page, "Pedir cambio")
  await expect(page.getByText(/Te quedan 3 cambios\./)).toBeVisible()
  await page.getByLabel("¿Qué quieres cambiar?").fill("Más corto, con un ejemplo de la vida diaria")
  await page.getByRole("button", { name: "Pedir este cambio" }).click()

  await expect(page.getByText("Estoy escribiendo el carrusel")).toBeVisible()
  expect(await leerFila(id)).toMatchObject({
    estado: "guion_en_proceso",
    pedido_de_cambio: "Más corto, con un ejemplo de la vida diaria",
  })
  expect(disparosRegistrados()).toMatchObject([{ tarea: "producir", piezaId: id }])
})

test("signing the text leaves the carousel waiting, starts nothing, and Inicio says what is missing", async ({
  page,
}) => {
  const id = await sembrarCarruselDeEscena("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await page.getByRole("slider", { name: "Desliza para firmar" }).focus()
  await page.keyboard.press("End")

  await expect(page.getByText("Firmaste el texto del carrusel")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("armando_carrusel")
  expect(disparosRegistrados()).toEqual([])

  await page.goto("/")
  await expect(page.getByText("Texto firmado · falta el diseño")).toBeVisible()
})

test("a warning has to be ticked before the signature opens", async ({ page }) => {
  const revision = [
    { regla: "largo_lamina", tipo: "advierte", mensaje: "La lámina 2 tiene 230 caracteres. Cabe bien hasta 220." },
  ]
  const id = await sembrarCarruselDeEscena("guion_por_aprobar", { revision })
  await page.goto(`/guion/${id}`)
  const deslizador = page.getByRole("slider", { name: "Desliza para firmar" })
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await page.getByRole("checkbox", { name: "Lo revisé y está bien" }).check()
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")
})
