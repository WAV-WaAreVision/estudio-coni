import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { capturar } from "./ayudas"

const HOY_EN_SANTIAGO = "(now() at time zone 'America/Santiago')::date"

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.consultas")
  await pool.query("delete from public.clics_enlace_dia")
}

test.beforeEach(limpiar)
test.afterAll(limpiar)

/**
 * The flow approves a time tomorrow; a published reel in a test went out some days ago. Only the database owner can
 * rewrite an approval, and only with the triggers off, so this is done here, on purpose, in one transaction.
 */
async function moverLaHoraAprobada(piezaId: string, haceDias: number) {
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    await cliente.query("set local session_replication_role = replica")
    await cliente.query(
      "update public.piezas set puerta2_publicar_en = now() - make_interval(days => $2) where id = $1",
      [piezaId, haceDias],
    )
    await cliente.query("commit")
  } catch (error) {
    await cliente.query("rollback")
    throw error
  } finally {
    cliente.release()
  }
}

async function reelPublicado(opciones: {
  titulo: string
  pilar: string
  haceDias: number
  alcance: number
  guardados: number
  dia?: string
}) {
  const idea = await sembrarIdea({ pilar: opciones.pilar, gancho: opciones.titulo })
  const id = await sembrarPieza("publicado", {
    titulo: opciones.titulo,
    idea_id: idea,
    media_id: `media_${opciones.titulo}`,
  })
  await moverLaHoraAprobada(id, opciones.haceDias)
  await pool.query(
    `insert into public.metricas_reel (pieza_id, dia, alcance, guardados, compartidos, comentarios, tiempo_promedio)
     values ($1, ${opciones.dia ?? HOY_EN_SANTIAGO}, $2, $3, 30, 7, 24400)`,
    [id, opciones.alcance, opciones.guardados],
  )
  return id
}

test("with few reels it orders by what served, shows the sample size and refuses to compare themes", async ({
  page,
}) => {
  await reelPublicado({
    titulo: "Ser tu propia diosa",
    pilar: "autoestima",
    haceDias: 20,
    alcance: 2000,
    guardados: 10,
  })
  await reelPublicado({
    titulo: "Si van a discutir, siéntense del mismo lado",
    pilar: "pareja",
    haceDias: 12,
    alcance: 2400,
    guardados: 121,
  })
  await reelPublicado({
    titulo: "El deseo no se apaga, se esconde",
    pilar: "deseo",
    haceDias: 8,
    alcance: 1000,
    guardados: 12,
  })
  await pool.query("insert into public.consultas default values")
  await pool.query(`insert into public.clics_enlace_dia (dia, enlace, clics) values (${HOY_EN_SANTIAGO}, 'agenda', 8)`)

  await page.goto("/metricas")

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  // How many of the three went out this month depends on the day the test runs; the unit tests pin that count.
  await expect(page.getByText(/^\d reels? publicados? · 1 consulta · 8 toques en tu link$/)).toBeVisible()
  const barras = page.getByRole("region", { name: "Lo que sirvió" }).getByRole("listitem")
  await expect(barras.nth(0)).toContainText("Si van a discutir, siéntense del mismo lado")
  await expect(barras.nth(0)).toContainText("50,4")
  await expect(barras.nth(0)).toContainText("cada 1.000")
  await expect(barras.nth(0)).toContainText("121 guardados de 2.400 personas")
  await expect(barras.nth(0)).toContainText("Pareja y conversación · 1 reel de este tema")
  await expect(barras.nth(1)).toContainText("El deseo no se apaga, se esconde")
  await expect(barras.nth(2)).toContainText("Ser tu propia diosa")

  // The panel that stops the order from being read as a conclusion sits right under the bars.
  const panel = page.getByRole("region", { name: "Todavía es temprano para concluir" })
  await expect(panel).toContainText(
    "El tema con más reels lleva 1 de 8. Cuento los reels desde que cumplen una semana.",
  )
  await expect(panel).toContainText("Autoestima · 1")
  await expect(page.getByText("Comparación de temas")).toHaveCount(0)

  await expect(page.getByRole("heading", { name: "Semana a semana" })).toBeVisible()
  await expect(page.getByText(/en promedio se vio 24 s/).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Métricas" })).toHaveAttribute("aria-current", "page")
  await capturar(page, "metricas-temprano")
})

test("without published reels it says so and still counts consultations", async ({ page }) => {
  await pool.query("insert into public.consultas default values")

  await page.goto("/metricas")

  await expect(page.getByText("Todavía no hay reels publicados.")).toBeVisible()
  await expect(page.getByText("0 reels publicados · 1 consulta · 0 toques en tu link")).toBeVisible()
  await expect(page.getByText("Todavía es temprano para concluir")).toHaveCount(0)
  await capturar(page, "metricas-vacio")
})

test("compares themes only once two of them have eight reels, with the interval", async ({ page }) => {
  const guardados = [20, 22, 21, 19, 23, 20, 22, 21]
  for (const [i, g] of guardados.entries()) {
    await reelPublicado({
      titulo: `Autoestima ${i}`,
      pilar: "autoestima",
      haceDias: 20 + i,
      alcance: 1000,
      guardados: g,
    })
    await reelPublicado({ titulo: `Pareja ${i}`, pilar: "pareja", haceDias: 20 + i, alcance: 1000, guardados: g - 10 })
  }

  await page.goto("/metricas")

  const panel = page.getByRole("region", { name: "Comparación de temas" })
  await expect(panel).toContainText("Autoestima · 8 reels · promedio 21 cada 1.000 (entre 19,9 y 22,1)")
  await expect(panel).toContainText("Autoestima va por delante de Pareja y conversación por 10 cada 1.000")
  await expect(panel).toContainText("La diferencia es mayor que lo que varían tus reels entre sí.")
  await expect(page.getByText("Todavía es temprano para concluir")).toHaveCount(0)
  await capturar(page, "metricas-comparable")
})

test("warns when the morning reading did not arrive and shows the last one it has", async ({ page }) => {
  await reelPublicado({
    titulo: "Un reel",
    pilar: "pareja",
    haceDias: 6,
    alcance: 1000,
    guardados: 10,
    dia: `${HOY_EN_SANTIAGO} - 5`,
  })

  await page.goto("/metricas")

  await expect(page.getByText(/^No pude traer las métricas de hoy; muestro las del /)).toBeVisible()
  await expect(page.getByText("10 guardados de 1.000 personas")).toBeVisible()
})
