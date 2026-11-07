import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { capturar, GUION_VALIDO, TEXTO_VALIDO } from "./ayudas"
import { PIEZAS } from "./escena"
import { cajaDe, conTextoDoble, sobraDeAncho } from "./medidas-de-escritorio"

// Inicio on a computer, 1280 x 900 (Federico, 07-11): what asks for her on the left at reading width, the week and
// what is on its way on the right. Measured and captured, no baselines.
const SIN_FALLA = { explicacion: null }

async function pareja(
  destino: Parameters<typeof sembrarPieza>[0],
  titulo: string,
  extra: Record<string, unknown> = {},
) {
  const idea = await sembrarIdea({ pilar: "practica-clinica", gancho: titulo })
  return sembrarPieza(destino, { titulo, idea_id: idea, guion: GUION_VALIDO, texto: TEXTO_VALIDO, ...extra })
}

async function sembrarSemana() {
  await pareja("guion_por_aprobar", PIEZAS.guion.titulo, SIN_FALLA)
  await pareja("video_por_aprobar", PIEZAS.video.titulo)
  await pareja("en_render", "Puedes decir que no")
  await pareja("programado", "Si van a discutir, siéntense del mismo lado")
  await pool.query("select public.abrir_pausa_de_proveedor('elevenlabs', 'pago', 'e2e')")
}

const firma = (page: Page) => page.getByRole("region", { name: "Necesita tu firma" })
const semana = (page: Page) => page.getByRole("region", { name: "Tu semana" })

test.beforeEach(async () => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.pausas_de_proveedor")
})

test.afterAll(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
  await vaciarPiezasEIdeas()
})

test("Inicio uses the width: her signature on the left, the week on the right", async ({ page }) => {
  await sembrarSemana()
  await page.goto("/")

  const izquierda = await cajaDe(firma(page))
  const derecha = await cajaDe(semana(page))
  const camino = await cajaDe(page.getByRole("region", { name: "En camino" }))
  expect(derecha.left).toBeGreaterThan(izquierda.right)
  expect(camino.left).toBeGreaterThan(izquierda.right)
  // The side column starts at the top of the content, not under the left one.
  const lado = await cajaDe(page.locator("[data-columna=lado]"))
  const atencion = await cajaDe(page.getByRole("region", { name: "Necesita atención" }))
  expect(Math.abs(lado.top - atencion.top)).toBeLessThan(16)
  // The reading column keeps about 70 characters (40rem at the 17 px root).
  expect(izquierda.width).toBeLessThanOrEqual(680)
  expect(izquierda.width).toBeGreaterThan(560)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  await capturar(page, "inicio-escritorio")
})

test("Inicio falls back to one column with a large text", async ({ page }) => {
  await sembrarSemana()
  await page.goto("/")
  await conTextoDoble(page)

  const izquierda = await cajaDe(firma(page))
  const derecha = await cajaDe(semana(page))
  expect(derecha.top).toBeGreaterThan(izquierda.bottom)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
})

test("Inicio with only a pause keeps the week beside it", async ({ page }) => {
  await pool.query("select public.abrir_pausa_de_proveedor('elevenlabs', 'pago', 'e2e')")
  await page.goto("/")

  const atencion = await cajaDe(page.getByRole("region", { name: "Necesita atención" }))
  const derecha = await cajaDe(semana(page))
  expect(derecha.left).toBeGreaterThan(atencion.right)
  expect(Math.abs(derecha.top - atencion.top)).toBeLessThan(16)
  await capturar(page, "inicio-escritorio-solo-pausa")
})
