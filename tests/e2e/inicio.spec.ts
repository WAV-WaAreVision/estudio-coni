import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  abrirDesplegable,
  alerta,
  capturar,
  disparosRegistrados,
  GUION_VALIDO,
  limpiarDisparos,
  TEXTO_VALIDO,
} from "./ayudas"

const IDEAS = [
  { pilar: "etica-regulacion", gancho: "¿Te achicas para que nadie se incomode?" },
  { pilar: "ia-salud-mental", gancho: "Si van a discutir, siéntense del mismo lado." },
  { pilar: "caso-coni", gancho: "Un visto sin respuesta y ya imaginas lo peor. ¿Te pasa?" },
  { pilar: "acceso-salud-publica", gancho: "Puedes decir que no sin dar explicaciones larguísimas." },
  { pilar: "practica-clinica", gancho: "¿Tu deseo se apagó o tu cuerpo está en modo alerta?" },
]

test.beforeEach(async () => {
  await vaciarPiezasEIdeas()
  limpiarDisparos()
})

async function pareja(
  destino: Parameters<typeof sembrarPieza>[0],
  titulo: string,
  extra: Record<string, unknown> = {},
) {
  const idea = await sembrarIdea({ pilar: "practica-clinica", gancho: titulo })
  return sembrarPieza(destino, { titulo, idea_id: idea, guion: GUION_VALIDO, texto: TEXTO_VALIDO, ...extra })
}

// The seed walks a script to gate 1 without a voice, which carries TEXTO_SIN_VOZ: a failure Inicio raises under
// attention (v6 8). A script that simply waits for her signature has no explanation.
const SIN_FALLA = { explicacion: null }

test("Inicio shows what needs her signature, what is on its way and five ideas for the week", async ({ page }) => {
  const guion = await pareja("guion_por_aprobar", "El deseo no se apaga, se esconde", SIN_FALLA)
  const video = await pareja("video_por_aprobar", "Ser tu propia diosa")
  await pareja("en_render", "Puedes decir que no")
  await pareja("programado", "Si van a discutir, siéntense del mismo lado")
  for (const idea of IDEAS) await sembrarIdea(idea)

  await page.goto("/")

  await expect(page.getByText("Hola, Coni", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2 esperan tu firma")
  await expect(page.getByText("unos 6 min", { exact: true })).toBeVisible()
  // The first signable piece is the card with the one primary; the other is a row of the group.
  const hrefs = [`/guion/${guion}`, `/video/${video}`]
  const enCarta = await page.getByRole("link", { name: "Revisar y firmar" }).getAttribute("href")
  expect(hrefs).toContain(enCarta)
  await expect(page.locator(`a[href="${hrefs.find((href) => href !== enCarta)}"]`)).toBeVisible()
  await expect(page.getByText("Grabando · unos 5 min · te aviso")).toBeVisible()
  await expect(page.getByText(/^Programado · /)).toBeVisible()
  await abrirDesplegable(page, "Elegir ideas de la semana")
  await expect(page.getByRole("checkbox")).toHaveCount(5)
  // The list never offers an approve button: approving happens on the detail screen (A11).
  await expect(page.getByRole("slider")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page")
  await capturar(page, "03-inicio")
})

test("the title is the summary and the signature section starts in the first screenful", async ({ page }) => {
  await pareja("guion_por_aprobar", "El deseo no se apaga, se esconde", SIN_FALLA)
  await pareja("video_por_aprobar", "Ser tu propia diosa")
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/esperan? tu firma/)
  const caja = await page.getByRole("region", { name: "Necesita tu firma" }).boundingBox()
  expect(caja?.y ?? 9999).toBeLessThan(420)
})

test("Inicio with nothing to sign says so and offers the ideas", async ({ page }) => {
  for (const idea of IDEAS) await sembrarIdea(idea)

  await page.goto("/")

  await expect(page.getByText("Nada espera tu firma esta semana.")).toBeVisible()
  await expect(page.getByText("Esta semana está al día")).toBeVisible()
  await expect(page.getByText("Elegir ideas de la semana")).toBeVisible()
})

test("a failed piece raises its reason on top, with the way to it", async ({ page }) => {
  await pareja("video_por_aprobar", "Ser tu propia diosa", {
    explicacion: "La hora aprobada pasó sin publicarse. Elige una nueva fecha.",
  })

  await page.goto("/")

  const aviso = alerta(page, "La hora aprobada pasó sin publicarse. Elige una nueva fecha.")
  await expect(aviso).toBeVisible()
  await expect(aviso.getByRole("link", { name: "Elegir otra fecha" })).toBeVisible()
})

test("she chooses three ideas and the three scripts start", async ({ page }) => {
  for (const idea of IDEAS) await sembrarIdea(idea)

  await page.goto("/")
  await abrirDesplegable(page, "Elegir ideas de la semana")
  await expect(page.getByRole("button", { name: "Escribir guiones" })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText("Elige al menos una idea. Puedes elegir hasta 5.")).toBeVisible()

  for (const gancho of [IDEAS[0], IDEAS[1], IDEAS[2]])
    await page.getByRole("checkbox", { name: new RegExp(gancho.gancho.slice(0, 18)) }).check()
  await page.getByRole("button", { name: "Escribir 3 guiones" }).click()

  await expect(page.getByText("Escribiendo 3 guiones. Te aviso cuando estén.")).toBeVisible()
  await expect(page.getByText("Escribiendo el guion · te aviso")).toHaveCount(3)
  const { rows } = await pool.query("select estado, version from public.piezas order by creada_en")
  expect(rows).toEqual([1, 2, 3].map(() => ({ estado: "guion_en_proceso", version: 1 })))
  const disparos = disparosRegistrados()
  expect(disparos.map((d) => d.tarea)).toEqual(["producir", "producir", "producir"])
  expect(new Set(disparos.map((d) => d.clave)).size).toBe(3)
})
