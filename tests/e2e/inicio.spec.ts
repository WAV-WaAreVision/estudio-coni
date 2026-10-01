import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { alerta, capturar, disparosRegistrados, GUION_VALIDO, limpiarDisparos, TEXTO_VALIDO } from "./ayudas"

const IDEAS = [
  { pilar: "autoestima", gancho: "¿Te achicas para que nadie se incomode?" },
  { pilar: "pareja", gancho: "Si van a discutir, siéntense del mismo lado." },
  { pilar: "bienestar", gancho: "Un visto sin respuesta y ya imaginas lo peor. ¿Te pasa?" },
  { pilar: "limites", gancho: "Puedes decir que no sin dar explicaciones larguísimas." },
  { pilar: "deseo", gancho: "¿Tu deseo se apagó o tu cuerpo está en modo alerta?" },
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
  const idea = await sembrarIdea({ pilar: "deseo", gancho: titulo })
  return sembrarPieza(destino, { titulo, idea_id: idea, guion: GUION_VALIDO, texto: TEXTO_VALIDO, ...extra })
}

test("Inicio shows what needs her signature, what is on its way and five ideas for the week", async ({ page }) => {
  const guion = await pareja("guion_por_aprobar", "El deseo no se apaga, se esconde")
  const video = await pareja("video_por_aprobar", "Ser tu propia diosa")
  await pareja("en_render", "Puedes decir que no")
  await pareja("programado", "Si van a discutir, siéntense del mismo lado")
  for (const idea of IDEAS) await sembrarIdea(idea)

  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Hola, Coni" })).toBeVisible()
  await expect(page.getByText("2 cosas esperan tu firma · unos 6 min")).toBeVisible()
  await expect(page.getByRole("link", { name: /El deseo no se apaga, se esconde/ })).toHaveAttribute(
    "href",
    `/guion/${guion}`,
  )
  await expect(page.getByRole("link", { name: /Ser tu propia diosa/ })).toHaveAttribute("href", `/video/${video}`)
  await expect(page.getByText("Grabando · unos 5 min · te aviso")).toBeVisible()
  await expect(page.getByText(/^Programado · /)).toBeVisible()
  await expect(page.getByRole("checkbox")).toHaveCount(5)
  // The list never offers an approve button: approving happens on the detail screen (A11).
  await expect(page.getByRole("slider")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page")
  await capturar(page, "03-inicio")
})

test("Inicio with nothing to sign says so and offers the ideas", async ({ page }) => {
  for (const idea of IDEAS) await sembrarIdea(idea)

  await page.goto("/")

  await expect(page.getByText("Nada espera tu firma esta semana.")).toBeVisible()
  await expect(page.getByText("Esta semana está al día")).toBeVisible()
  await expect(page.getByRole("link", { name: "Elegir ideas ahora" })).toBeVisible()
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
  const boton = page.getByRole("button", { name: "Escribir 3 guiones" })
  await expect(boton).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText("Elige 3 más.")).toBeVisible()

  for (const gancho of [IDEAS[0], IDEAS[1], IDEAS[2]])
    await page.getByRole("checkbox", { name: new RegExp(gancho.gancho.slice(0, 18)) }).check()
  await expect(page.getByRole("checkbox", { name: new RegExp(IDEAS[3].gancho.slice(0, 18)) })).toBeDisabled()
  await boton.click()

  await expect(page.getByText("Escribiendo 3 guiones. Te aviso cuando estén.")).toBeVisible()
  await expect(page.getByText("Escribiendo el guion · te aviso")).toHaveCount(3)
  const { rows } = await pool.query("select estado, version from public.piezas order by creada_en")
  expect(rows).toEqual([1, 2, 3].map(() => ({ estado: "guion_en_proceso", version: 1 })))
  const disparos = disparosRegistrados()
  expect(disparos.map((d) => d.tarea)).toEqual(["producir", "producir", "producir"])
  expect(new Set(disparos.map((d) => d.clave)).size).toBe(3)
})
