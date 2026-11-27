import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  type EscenaDeAutoresYTemas,
  type EscenaDeEtiquetas,
  GANCHO_LINKEDIN,
  IDEA_DE_CONI,
  sembrarAutoresYTemas,
  sembrarEtiquetas,
  sinEtiquetasDudosas,
  TEXTO_ANTIGUO,
} from "./biblioteca-escena"

let base: EscenaDeAutoresYTemas
let escena: EscenaDeEtiquetas

const etiqueta = (page: Page, titulo: string) => page.getByRole("button", { name: new RegExp(`^${titulo}`) })
const paginaDe = (id: string) => new RegExp(`/biblioteca/afirmaciones/${id}(?:\\?.*)?$`)
const insigniasDe = (page: Page, texto: string) =>
  page
    .getByRole("listitem")
    .filter({ hasText: texto })
    .getByRole("link", { name: /Ver y corregir las etiquetas/ })

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  base = await sembrarAutoresYTemas()
  escena = await sembrarEtiquetas()
})

test.afterEach(() => sinEtiquetasDudosas())

test("corrects the Instagram emotion of a claim to another value, and the log keeps what it was", async ({ page }) => {
  await page.goto(`/biblioteca/afirmaciones/${escena.nueva}`)
  await expect(page.getByRole("heading", { level: 1, name: `«${GANCHO_LINKEDIN.frase}»` })).toBeVisible()
  await expect(page.getByText("Certeza baja")).toHaveCount(1)
  expect(await revisarConAxe(page, "afirmación en el celular")).toEqual([])
  await page.waitForLoadState("networkidle")

  const emocion = etiqueta(page, "Emoción en Instagram")
  await expect(emocion).toContainText("Curiosidad")
  await emocion.click()
  await page.getByRole("radio", { name: "Sorpresa" }).check()
  await page.getByRole("button", { name: "Cambiar", exact: true }).click()
  await expect(etiqueta(page, "Emoción en Instagram")).toContainText("Sorpresa")
  await expect(page.getByRole("region", { name: "Instagram" }).getByText("Corregida por ti")).toBeVisible()

  const marca = await pool.query(
    "select valor, certeza, origen from public.afirmacion_marcas where afirmacion_id = $1 and marca = 'emocion' and red = 'instagram'",
    [escena.nueva],
  )
  expect(marca.rows).toEqual([{ valor: "sorpresa", certeza: "alta", origen: "coni" }])
  const registro = await pool.query(
    "select campo, red, accion, antes, despues from public.correcciones_de_etiqueta where afirmacion_id = $1",
    [escena.nueva],
  )
  expect(registro.rows).toEqual([
    { campo: "emocion", red: "instagram", accion: "corrige", antes: "curiosidad", despues: "sorpresa" },
  ])
})

test("confirms the hook type with «Está bien»", async ({ page }) => {
  await page.goto(`/biblioteca/afirmaciones/${escena.nueva}`)
  await page.waitForLoadState("networkidle")
  await etiqueta(page, "Tipo de gancho").click()
  await page.getByRole("button", { name: "Está bien" }).click()
  await expect(page.getByRole("region", { name: "Gancho" }).getByText("Confirmada por ti")).toBeVisible()
  const gancho = await pool.query("select tipo, certeza, origen from public.ganchos where afirmacion_id = $1", [
    escena.nueva,
  ])
  expect(gancho.rows).toEqual([{ tipo: "verdad_incomoda", certeza: "alta", origen: "coni" }])
  const registro = await pool.query(
    "select accion from public.correcciones_de_etiqueta where afirmacion_id = $1 and campo = 'tipo_de_gancho'",
    [escena.nueva],
  )
  expect(registro.rows).toEqual([{ accion: "confirma" }])
})

test("adds a mark from «Agregar» and removes it after its confirmation", async ({ page }) => {
  await page.goto(`/biblioteca/afirmaciones/${escena.nueva}`)
  await page.waitForLoadState("networkidle")
  const linkedin = page.getByRole("region", { name: "LinkedIn" })
  await linkedin.getByRole("button", { name: "Agregar Solución en LinkedIn" }).click()
  await linkedin.getByRole("radio", { name: "Liderar con incertidumbre" }).check()
  await linkedin.getByRole("textbox", { name: "Frase" }).fill("Decidir sin tenerlo todo claro")
  await linkedin.getByRole("button", { name: "Guardar" }).click()
  const solucion = linkedin.getByRole("button", { name: /^Solución en LinkedIn/ })
  await expect(solucion).toContainText("Liderar con incertidumbre")

  await solucion.click()
  await linkedin.getByRole("button", { name: "Quitar" }).click()
  await expect(linkedin.getByText("¿Quito esta marca? Queda anotado que la quitaste.")).toBeVisible()
  await linkedin.getByRole("button", { name: "Quitar" }).click()
  await expect(linkedin.getByRole("button", { name: "Agregar Solución en LinkedIn" })).toBeVisible()

  const marcas = await pool.query(
    "select 1 from public.afirmacion_marcas where afirmacion_id = $1 and marca = 'solucion'",
    [escena.nueva],
  )
  expect(marcas.rowCount).toBe(0)
  const registro = await pool.query<{ accion: string }>(
    "select accion from public.correcciones_de_etiqueta where afirmacion_id = $1 and campo = 'solucion' order by accion",
    [escena.nueva],
  )
  expect(registro.rows.map((fila) => fila.accion)).toEqual(["agrega", "quita"])
})

test("an old claim corrects tipo and evidencia, and shows the marks note with its old text", async ({ page }) => {
  await page.goto(`/biblioteca/afirmaciones/${escena.antigua}`)
  await expect(page.getByRole("heading", { level: 1, name: `«${IDEA_DE_CONI}»` })).toBeVisible()
  const marcas = page.getByRole("region", { name: "Marcas" })
  await expect(marcas.getByText("Llegan al reprocesar la Biblioteca")).toBeVisible()
  await expect(marcas.getByText(TEXTO_ANTIGUO.dolor)).toBeVisible()
  await expect(page.getByRole("button", { name: /Emoción en/ })).toHaveCount(0)
  expect(await revisarConAxe(page, "afirmación antigua en el celular")).toEqual([])

  await page.waitForLoadState("networkidle")
  await etiqueta(page, "Qué la respalda").click()
  await page.getByRole("radio", { name: "Testimonio" }).check()
  await page.getByRole("button", { name: "Cambiar", exact: true }).click()
  await expect(etiqueta(page, "Qué la respalda")).toContainText("Testimonio")
  const fila = await pool.query("select evidencia from public.afirmaciones where id = $1", [escena.antigua])
  expect(fila.rows).toEqual([{ evidencia: "testimonio" }])
})

test("badges open the claim from an author, a topic and a material; «Volver» comes back; a hook links to it", async ({
  page,
}) => {
  await page.goto(`/biblioteca/autores/${base.autora}`)
  const insignias = insigniasDe(page, GANCHO_LINKEDIN.frase)
  await expect(insignias).toContainText("Dato")
  await expect(insignias).toContainText("LinkedIn: Escepticismo")
  await expect(insignias).toContainText("Instagram: Curiosidad")
  await tocarHastaLlegar(page, insignias, paginaDe(escena.nueva))
  await tocarHastaLlegar(
    page,
    page.getByRole("link", { name: "Autor", exact: true }),
    new RegExp(`/biblioteca/autores/${base.autora}(?:\\?v=\\d+)?$`),
  )

  await page.goto(`/biblioteca/temas/${base.carga}`)
  await expect(insigniasDe(page, GANCHO_LINKEDIN.frase)).toHaveAttribute(
    "href",
    new RegExp(`/biblioteca/afirmaciones/${escena.nueva}\\?desde=`),
  )

  await page.goto(`/biblioteca/materiales/${base.listo}`)
  await page.waitForLoadState("networkidle")
  await page.getByText(/^Cada idea \(3\)$/).click()
  await expect(
    page.getByRole("list", { name: "Cada idea" }).getByRole("link", { name: /Ver y corregir las etiquetas/ }),
  ).toHaveCount(3)

  await page.goto(`/biblioteca/ganchos/${escena.nueva}`)
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Ver la afirmación" }), paginaDe(escena.nueva))
  await expect(page.getByRole("link", { name: "Gancho", exact: true })).toBeVisible()
})

test("a hidden claim is not found", async ({ page }) => {
  await pool.query("update public.afirmaciones set excluida = true where id = $1", [escena.nueva])
  await page.goto(`/biblioteca/afirmaciones/${escena.nueva}`)
  await expect(page.getByRole("heading", { level: 1, name: "No encontré lo que buscabas" })).toBeVisible()
})
