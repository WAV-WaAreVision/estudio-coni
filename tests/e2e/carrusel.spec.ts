import { expect, test } from "@playwright/test"
import { leerVersionVigente } from "@/lib/datos/carrusel"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"
import { pool } from "../integration/db"
import { clienteDeServicio } from "../integration/servicio"
import { leerFila, sembrarIdea, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  abrirDesplegable,
  bloquearRedExterna,
  configurarServicios,
  disparosRegistrados,
  limpiarDisparos,
  simularMedios,
} from "./ayudas"
import { armarCarruselComoLaTarea, CARRUSEL, escribirCarruselComoLaTarea, sembrarCarruselDeEscena } from "./escena"

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

test("a carousel whose slides are being made says so and refreshes itself", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("armando_carrusel")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
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

test("signing the text starts the render, and Inicio says the slides are being made", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await page.getByRole("slider", { name: "Desliza para firmar" }).focus()
  await page.keyboard.press("End")

  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("armando_carrusel")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "armar", piezaId: id }])

  await page.goto("/")
  await expect(page.getByText("Armando las láminas · te aviso")).toBeVisible()
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

test("the whole flow: Ideas, gate 1, the render, gate 2 with one design change, and scheduling", async ({ page }) => {
  await simularMedios(page)
  await sembrarIdea({ pilar: CARRUSEL.pilar, gancho: CARRUSEL.titulo, numero: 1 })
  await page.goto("/ideas")
  await page.getByRole("radio", { name: "Carrusel de LinkedIn" }).check()
  await page.getByRole("button", { name: "Hacer el carrusel" }).click()
  await expect(page.getByText("Escribiendo el carrusel. Te aviso cuando esté.")).toBeVisible()
  const { rows } = await pool.query("select id from public.piezas where titulo = $1", [CARRUSEL.titulo])
  const id: string = rows[0]?.id
  await escribirCarruselComoLaTarea(id)

  await page.goto(`/guion/${id}`)
  await page.getByRole("slider", { name: "Desliza para firmar" }).focus()
  await page.keyboard.press("End")
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  await armarCarruselComoLaTarea(id)

  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("img", { name: /^Lámina 1 de 6: / })).toBeVisible()
  const programar = page.getByRole("slider", { name: "Desliza para programar" })
  await expect(programar).toHaveAttribute("aria-disabled", "true")

  const antes = await leerVersionVigente(clienteDeServicio(), id)
  await abrirDesplegable(page, "Pedir cambio")
  await page.getByRole("radio", { name: /El diseño/ }).check()
  await page.getByRole("radio", { name: "Oscura" }).check()
  await page.getByRole("button", { name: "Rehacer el diseño" }).click()
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  const despues = await leerVersionVigente(clienteDeServicio(), id)
  expect(despues).toMatchObject({
    origen: "cambio_diseno",
    hashTexto: antes?.hashTexto,
    diseno: { variante: "oscura" },
  })
  expect(disparosRegistrados().filter((d) => d.tarea === "armar")).toHaveLength(2)
  await armarCarruselComoLaTarea(id)

  await page.goto(`/guion/${id}`)
  for (let i = 1; i < 6; i += 1) await page.getByRole("button", { name: "Lámina siguiente" }).click()
  await expect(programar).toHaveAttribute("aria-disabled", "false")
  await programar.focus()
  await page.keyboard.press("End")
  await expect(page.getByText(/^Programado para el /)).toBeVisible()
  expect(await leerFila(id)).toMatchObject({ estado: "programado", puerta2_carrusel_id: despues?.id })
})

test("the manual upload: download the PDF, copy the text, say it is up", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const id = await sembrarCarruselDeEscena("para_subir_a_mano")
  const pedidos: string[] = []
  await page.route("https://almacen.test/**", async (ruta) => {
    pedidos.push(ruta.request().url())
    await ruta.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: { "content-disposition": "attachment" },
      body: "%PDF-1.7",
    })
  })
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Listo para que lo subas a LinkedIn")).toBeVisible()
  await page.getByRole("button", { name: "Descargar PDF" }).click()
  await expect
    .poll(() => pedidos.find((url) => url.includes("carrusel.pdf")))
    .toContain(`descarga=carrusel-${id.slice(0, 8)}.pdf`)
  await page.getByRole("button", { name: "Copiar texto" }).click()
  await expect(page.getByText("Texto copiado")).toBeVisible()
  await page
    .getByLabel("Enlace de la publicación en LinkedIn (opcional)")
    .fill("https://www.linkedin.com/posts/coni-carrusel")
  await page.getByRole("button", { name: "Ya lo subí a LinkedIn" }).click()
  await expect(page.getByText("Subido a LinkedIn")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("publicado_a_mano")
})

test("a failed render offers Reintentar (no se cobra) and starts it again", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("error_produccion")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("No pude armar el carrusel", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Reintentar (no se cobra)" }).click()
  await expect(page.getByText("Estoy armando las láminas")).toBeVisible()
  expect(disparosRegistrados()).toMatchObject([{ tarea: "armar", piezaId: id }])
})

test("/video/<id> of a carousel opens its own screen", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("programado")
  await page.goto(`/video/${id}`)
  await expect(page).toHaveURL(new RegExp(`/guion/${id}$`))
  await expect(page.getByText(/^Programado para el /)).toBeVisible()
})
