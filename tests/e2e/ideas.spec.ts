import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarCorrida, sembrarIdea, sembrarIdeaDelMotor, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  abrirDesplegable,
  alerta,
  bloquearRedExterna,
  capturar,
  configurarServicios,
  disparosRegistrados,
  limpiarDisparos,
  registroDeServicios,
} from "./ayudas"
import { IDEA_DEL_MOTOR, lineaDeFuenteDe, sembrarEscena } from "./escena"

const ALERTA = [{ tipo: "verificar dato", texto: "La fuente cita proxémica sin estudio." }]

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await configurarServicios()
  await pool.query("update public.ajustes set tope_mensual_usd = 40")
})

test.afterAll(async () => {
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await pool.query("update public.ajustes set tope_mensual_usd = 40")
})

async function sembrarBanco() {
  await sembrarIdea({
    pilar: "ia-salud-mental",
    gancho: "Si van a discutir, siéntense del mismo lado.",
    alertas: ALERTA,
    numero: 1,
  })
  await sembrarIdea({ pilar: "practica-clinica", gancho: "El deseo no se apaga: se esconde.", numero: 2 })
  await sembrarIdea({ pilar: "etica-regulacion", gancho: "¿Por qué sientes culpa al descansar?", numero: 3 })
}

test("the bank shows one idea at a time with its pillar, strength and alerts", async ({ page }) => {
  await sembrarBanco()

  await page.goto("/ideas")

  await expect(page.getByRole("heading", { name: "Ideas", level: 1 })).toBeVisible()
  await expect(page.getByText("Idea 1 de 3")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeVisible()
  await expect(page.getByText("IA y salud mental")).toBeVisible()
  await expect(page.getByText("Verificar dato", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Usar esta" })).toBeVisible()
  await capturar(page, "ideas-mazo")

  await page.getByRole("button", { name: "Después" }).click()
  await expect(page.getByRole("heading", { name: "El deseo no se apaga: se esconde." })).toBeVisible()
  await expect(page.getByText("Idea 2 de 3")).toBeVisible()
})

test("the idea card shows its source under the hook", async ({ page }) => {
  await sembrarEscena()
  await page.goto("/ideas")
  await expect(page.getByText(lineaDeFuenteDe(IDEA_DEL_MOTOR.fuente), { exact: true })).toBeVisible()
})

test("Usar esta puts the idea first among the week's ideas on Inicio, and Deshacer takes it out", async ({ page }) => {
  await sembrarBanco()
  await page.goto("/ideas")
  await page.getByRole("button", { name: "Después" }).click()

  await page.getByRole("button", { name: "Usar esta" }).click()

  await expect(page.getByText("La sumé a las ideas de la semana.")).toBeVisible()
  await page.goto("/")
  await abrirDesplegable(page, "Elegir ideas de la semana")
  await expect(page.getByRole("checkbox").first()).toHaveAccessibleName(/El deseo no se apaga/)

  await page.goto("/ideas")
  await page.getByRole("button", { name: "Usar esta" }).first().click()
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByRole("heading", { name: /El deseo no se apaga|Si van a discutir/ })).toBeVisible()
  const { rows } = await pool.query("select count(*)::int as n from public.ideas where fijada_en is not null")
  expect(rows[0].n).toBe(1)
})

test("Inicio links to the whole bank", async ({ page }) => {
  await sembrarBanco()

  await page.goto("/")
  await abrirDesplegable(page, "Elegir ideas de la semana")
  await page.getByRole("link", { name: "Ver todas las ideas" }).click()

  await expect(page).toHaveURL(/\/ideas$/)
})

test("search narrows by word and opens the idea she taps", async ({ page }) => {
  await sembrarBanco()
  await page.goto("/ideas")

  await page.getByRole("button", { name: "Buscar" }).click()
  await expect(page.getByText("3 resultados")).toBeVisible()
  await page.getByLabel("Buscar por palabra o tema").fill("culpa")
  await expect(page.getByText("1 resultado")).toBeVisible()
  await capturar(page, "ideas-buscar")

  await page.getByRole("button", { name: /culpa al descansar/ }).click()
  await expect(page.getByRole("heading", { name: "¿Por qué sientes culpa al descansar?" })).toBeVisible()

  await page.getByRole("button", { name: "Buscar" }).click()
  await page.getByLabel("Buscar por palabra o tema").fill("zzz")
  await expect(page.getByText("No encontré ideas con esa palabra.")).toBeVisible()
})

test("she writes an idea of her own, Claude proposes the pillar and alerts, and she confirms them", async ({
  page,
}) => {
  await sembrarBanco()
  await pool.query("select vault.create_secret('sk-ant-de-prueba-de-coni', 'anthropic')")
  await page.goto("/ideas")

  await page.getByRole("button", { name: "Escribir una idea mía" }).click()
  await page.getByLabel("Tu idea").fill("Tu pareja te revisa el celular y lo llama amor.")
  await page.getByRole("button", { name: "Proponer pilar y alertas" }).click()

  await expect(page.getByRole("radio", { name: "Acceso y salud pública" })).toBeChecked()
  await expect(page.getByRole("checkbox", { name: /Líneas de ayuda/ })).toBeChecked()
  await capturar(page, "ideas-propia")
  await page.getByRole("checkbox", { name: /Verificar dato/ }).check()
  await page.getByRole("button", { name: "Guardar idea" }).click()

  await expect(page.getByText("Guardé tu idea y la sumé a las ideas de la semana.")).toBeVisible()
  const { rows } = await pool.query(
    "select pilar, alertas, numero, fijada_en from public.ideas where gancho like 'Tu pareja te revisa%'",
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ pilar: "acceso-salud-publica", numero: null })
  expect(rows[0].alertas.map((a: { tipo: string }) => a.tipo)).toEqual(["verificar dato", "líneas de ayuda"])
  expect(rows[0].fijada_en).not.toBeNull()
  const llamadas = await registroDeServicios()
  expect(llamadas.filter((l) => l.ruta === "/v1/messages")).toHaveLength(1)
})

test("without her Anthropic key the proposal explains it and she can still choose the pillar", async ({ page }) => {
  await sembrarBanco()
  await page.goto("/ideas")

  await page.getByRole("button", { name: "Escribir una idea mía" }).click()
  await page.getByLabel("Tu idea").fill("Tu pareja te revisa el celular y lo llama amor.")
  await page.getByRole("button", { name: "Proponer pilar y alertas" }).click()

  await expect(alerta(page, "necesito tu llave de Anthropic")).toBeVisible()
  await page.getByRole("button", { name: "Elegir yo el pilar" }).click()
  await page.getByRole("radio", { name: "Caso Coni: humana + avatar" }).check()
  await page.getByRole("button", { name: "Guardar idea" }).click()

  await expect(page.getByText("Guardé tu idea y la sumé a las ideas de la semana.")).toBeVisible()
  expect((await registroDeServicios()).filter((l) => l.ruta === "/v1/messages")).toEqual([])
})

test.describe("ideas del motor", () => {
  const SEMANA = "2026-09-27"

  async function sembrarSemana() {
    await sembrarCorrida(SEMANA)
    await sembrarIdea({ gancho: "Una idea de siempre", numero: 1 })
    await sembrarIdeaDelMotor({
      gancho: "Estar cansada no siempre es cansancio.",
      semana: SEMANA,
      numero: 10,
      alertas: [{ tipo: "respaldo", texto: "respaldo débil" }],
      teoria: {
        titulo: "El deseo se esconde detrás del cansancio",
        tesis: "Quien dice estar cansada muchas veces protege su deseo.",
        nivel: "debil",
        respaldo: [{ autor: "Siembra Autora Uno", cita: "El cansancio es una forma de decir que no." }],
      },
    })
    await sembrarIdeaDelMotor({ gancho: "Otra del motor.", semana: SEMANA, pilar: "acceso-salud-publica", numero: 11 })
  }

  test("this week's engine ideas come first with their why and backing, and discarding leaves a reason", async ({
    page,
  }) => {
    await sembrarSemana()
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto("/ideas")

    await expect(page.getByText("Nuevas de la semana")).toBeVisible()
    await expect(page.getByText("Idea 1 de 3")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Estar cansada no siempre es cansancio." })).toBeVisible()
    await expect(page.getByText("Respaldo débil")).toBeVisible()
    await page.getByText("Por qué", { exact: true }).click()
    await expect(page.getByText("Evidencia: Débil")).toBeVisible()
    await expect(page.getByText("Solo para ti, no se publica")).toBeVisible()
    await expect(page.getByText("Siembra Autora Uno: El cansancio es una forma de decir que no.")).toBeVisible()
    await capturar(page, "banco-semana")

    await page.getByRole("button", { name: "Descartar" }).click()
    await expect(page.getByRole("group", { name: "¿Por qué la descartas?" })).toBeVisible()
    await page.getByRole("button", { name: "Repetida" }).click()

    await expect(page.getByText("Descarté la idea.")).toBeVisible()
    await expect(page.getByText("Idea 1 de 2")).toBeVisible()
    const { rows } = await pool.query(
      "select estado, motivo_descarte from public.ideas where gancho = 'Estar cansada no siempre es cansancio.'",
    )
    expect(rows[0]).toEqual({ estado: "descartada", motivo_descarte: "repetida" })
  })

  test("an empty bank says when the engine proposes and links to the ingestion app", async ({ page }) => {
    await page.goto("/ideas")

    await expect(page.getByText("El motor propone ideas cada domingo a las 20:00.")).toBeVisible()
    await expect(page.getByRole("link", { name: "Abrir Conidolly Ingesta" })).toHaveAttribute("href", /^https?:\/\//)
  })
})

async function elegirVarias(page: Page, ganchos: string[]) {
  await page.goto("/ideas")
  await page.getByRole("button", { name: "Elegir varias" }).click()
  for (const gancho of ganchos) await page.getByRole("checkbox", { name: gancho }).check()
}

const DOS = ["Si van a discutir, siéntense del mismo lado.", "El deseo no se apaga: se esconde."]

test("she ticks two ideas and both scripts start, each on its way to its own gate 1", async ({ page }) => {
  await sembrarBanco()
  limpiarDisparos()
  await elegirVarias(page, DOS)

  await page.getByRole("button", { name: "Hacer los guiones (2)" }).click()

  await expect(page.getByText("Escribiendo 2 guiones. Te aviso cuando estén.")).toBeVisible()
  expect(disparosRegistrados().filter((d) => d.tarea === "producir")).toHaveLength(2)
  const { rows } = await pool.query("select count(*)::int as n from public.piezas where estado = 'guion_en_proceso'")
  expect(rows[0].n).toBe(2)
})

test("when the month covers one, she is asked and nothing starts until she says yes", async ({ page }) => {
  await sembrarBanco()
  limpiarDisparos()
  await pool.query("update public.ajustes set tope_mensual_usd = 1.5")
  await elegirVarias(page, DOS)

  await page.getByRole("button", { name: "Hacer los guiones (2)" }).click()
  await expect(page.getByText("Alcanza para 1 este mes. ¿Hago ese?")).toBeVisible()
  expect(disparosRegistrados()).toEqual([])
  await capturar(page, "ideas-elegir-varias-alcanza")

  await page.getByRole("button", { name: "Sí, hacer 1 guion" }).click()
  await expect(page.getByText("Escribiendo 1 guion. Te aviso cuando esté.")).toBeVisible()
  const { rows } = await pool.query("select titulo from public.piezas")
  expect(rows).toEqual([{ titulo: DOS[0] }])
})

test("she discards two with one motive and Deshacer brings them back", async ({ page }) => {
  await sembrarBanco()
  await elegirVarias(page, DOS)

  await page.getByRole("button", { name: "Descartar (2)" }).click()
  await page.getByRole("button", { name: "No me representa" }).click()
  await expect(page.getByText("Descarté 2 ideas.")).toBeVisible()
  const descartadas = await pool.query("select motivo_descarte from public.ideas where estado = 'descartada'")
  expect(descartadas.rows).toEqual([{ motivo_descarte: "no_me_representa" }, { motivo_descarte: "no_me_representa" }])

  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByText("Volvieron al banco.")).toBeVisible()
  const libres = await pool.query("select count(*)::int as n from public.ideas where estado = 'idea'")
  expect(libres.rows[0].n).toBe(3)
})
