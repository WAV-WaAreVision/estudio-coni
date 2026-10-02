import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { CONI, pool } from "../integration/db"
import { leerFila, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  alerta,
  capturar,
  disparosRegistrados,
  GUION_VALIDO,
  limpiarDisparos,
  simularMedios,
  TEXTO_VALIDO,
} from "./ayudas"

const ETIQUETA = "Desliza para aprobar y grabar"
const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOK_A = { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" }
const LOOK_B = { avatar_id: "look-b", nombre: "Terraza", imagen: "avatares/look-b.png" }

/** Taps the card like she would: the radio itself is visually hidden. */
async function elegirAvatar(page: Page, nombre: string) {
  await page.getByRole("radio", { name: nombre }).locator("xpath=ancestor::label").click()
  await expect(page.getByRole("radio", { name: nombre })).toBeChecked()
}

async function sembrarAvatares(avatares: object[]) {
  const produccion = { ...BASE, heygen: { ...BASE.heygen, avatares } }
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(produccion)])
}
const AVISO_DE_RIESGO = {
  regla: "tema_de_riesgo",
  tipo: "advierte",
  mensaje: "El tema es sexualidad. HeyGen revisa estos guiones con más cuidado; confirma que el lenguaje es educativo.",
}

test.beforeEach(async () => {
  await vaciarPiezasEIdeas()
  limpiarDisparos()
  await sembrarAvatares([LOOK_A, LOOK_B])
})

async function guionPorAprobar(revision: object[] = []) {
  const idea = await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga, se esconde" })
  return sembrarPieza("guion_por_aprobar", {
    titulo: "El deseo no se apaga, se esconde",
    idea_id: idea,
    guion: GUION_VALIDO,
    texto: TEXTO_VALIDO,
    audio_id: "voces/e2e.wav",
    revision: JSON.stringify(revision),
  })
}

test("she hears the voice, confirms the review and slides: the script is approved and recording starts", async ({
  page,
}) => {
  const id = await guionPorAprobar([AVISO_DE_RIESGO])
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  const deslizador = page.getByRole("slider", { name: ETIQUETA })
  await expect(page.getByRole("heading", { name: "El deseo no se apaga, se esconde" })).toBeVisible()
  await expect(page.getByText(/^Si lo apruebas hoy, sale el /)).toBeVisible()
  await expect(page.getByText(/Grabar cuesta unos US\$ \d+,\d\d · te quedan US\$ \d+,\d\d este mes/)).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await expect(deslizador).toHaveAttribute("aria-valuetext", "No aprobado")
  await expect(page.getByText("Falta escuchar la voz, elegir el avatar y confirmar la revisión.")).toBeVisible()
  await capturar(page, "04-guion")

  // Pushing the slider while it is not enabled does nothing.
  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByText("Aprobado. Estoy grabando el video.")).toHaveCount(0)
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  await page.getByRole("button", { name: "Escuchar la voz" }).click()
  await expect(page.getByText("Ya la escuchaste")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Falta elegir el avatar y confirmar la revisión.")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")

  await elegirAvatar(page, "Terraza")
  await expect(page.getByText("Falta confirmar la revisión.")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")

  await page.getByRole("checkbox", { name: "Lo revisé y está bien" }).check()
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")

  await deslizador.focus()
  await page.keyboard.press("End")

  await expect(page.getByText("Aprobado. Estoy grabando el video.")).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("en_render")
  expect(fila.puerta1_por).toBe(CONI)
  expect(fila.avatar_id).toBe("look-b")
  const disparos = disparosRegistrados()
  expect(disparos).toHaveLength(1)
  expect(disparos[0]).toMatchObject({ tarea: "grabar", piezaId: id })
})

test("a caption that forgets the avatar notice blocks the approval until she puts it back", async ({ page }) => {
  const id = await guionPorAprobar()
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await page.getByRole("button", { name: "Editar el texto" }).click()
  await page.getByRole("textbox", { name: "Texto de la publicación" }).fill("Un texto sin el aviso.")
  await page.getByRole("button", { name: "Guardar el texto" }).click()

  await expect(page.getByText("Hay que corregirlo:")).toBeVisible()
  await expect(page.getByText(/tiene que avisar que es un avatar digital/)).toBeVisible()
  await page.getByRole("button", { name: "Escuchar la voz" }).click()
  await expect(page.getByText("Ya la escuchaste")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Hay algo que corregir antes de aprobar.")).toBeVisible()
  await page.getByRole("slider", { name: ETIQUETA }).focus()
  await page.keyboard.press("End")
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  await page.getByRole("button", { name: "Editar el texto" }).click()
  await page.getByRole("textbox", { name: "Texto de la publicación" }).fill(TEXTO_VALIDO)
  await page.getByRole("button", { name: "Guardar el texto" }).click()

  await expect(page.getByText("Hay que corregirlo:")).toHaveCount(0)
  await elegirAvatar(page, "Estudio")
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "false")
})

test("asking for changes sends the script back to be rewritten", async ({ page }) => {
  const id = await guionPorAprobar()
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await page.getByRole("button", { name: "Pedir cambios" }).click()
  await page.getByRole("button", { name: "Sí, pedir cambios" }).click()

  await expect(page.getByText("Estoy escribiendo el guion")).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("guion_en_proceso")
  expect(fila.intento).toBe(1)
  expect(disparosRegistrados().map((d) => d.tarea)).toEqual(["producir"])
})

test("a screen opened before the piece changed does not approve", async ({ page }) => {
  const id = await guionPorAprobar()
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  await page.getByRole("button", { name: "Escuchar la voz" }).click()
  await expect(page.getByText("Ya la escuchaste")).toBeVisible({ timeout: 15_000 })
  await elegirAvatar(page, "Estudio")

  // While the screen is open, the script changes underneath it.
  await pool.query("update public.piezas set guion = guion || ' Una frase más.', version = version + 1 where id = $1", [
    id,
  ])
  await page.getByRole("slider", { name: ETIQUETA }).focus()
  await page.keyboard.press("End")

  await expect(alerta(page, "Esto cambió mientras lo revisabas y no quedó aprobado.")).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("guion_por_aprobar")
  expect(fila.puerta1_hash).toBeNull()
  expect(disparosRegistrados()).toEqual([])
})

test("the picker offers the curated looks with nothing chosen, and keeps her choice on screen", async ({ page }) => {
  const id = await guionPorAprobar()
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  const grupo = page.getByRole("radiogroup", { name: "Elige con qué avatar se graba" })
  await expect(grupo).toBeVisible()
  await expect(page.getByRole("radio")).toHaveCount(2)
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0)
  await expect(page.getByRole("img", { name: "Estudio" })).toBeVisible()
  await expect(page.getByRole("img", { name: "Terraza" })).toBeVisible()
  await expect
    .poll(() => page.getByRole("img", { name: "Estudio" }).evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
  await grupo.scrollIntoViewIfNeeded()
  await capturar(page, "guion-avatar-sin-elegir")

  await page.getByRole("radio", { name: "Estudio" }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("radio", { name: "Terraza" })).toBeChecked()
  await expect(page.getByRole("radio", { name: "Terraza" })).toBeFocused()
  const alto = await page.getByRole("radio", { name: "Terraza" }).locator("xpath=ancestor::label").boundingBox()
  expect(alto?.height).toBeGreaterThanOrEqual(44)
  await capturar(page, "guion-avatar-elegido")
  expect((await leerFila(id)).avatar_id).toBeNull()
})

test("with an empty list it says so and approval stays blocked", async ({ page }) => {
  await sembrarAvatares([])
  const id = await guionPorAprobar()
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText("Todavía no hay avatares para elegir: avísale a Federico.")).toBeVisible()
  await expect(page.getByRole("radio")).toHaveCount(0)
  await page.getByRole("button", { name: "Escuchar la voz" }).click()
  await expect(page.getByText("Ya la escuchaste")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText("Todavía no hay avatares para elegir.", { exact: false }).last()).toBeVisible()
  await capturar(page, "guion-avatar-lista-vacia")
  await page.getByRole("slider", { name: ETIQUETA }).focus()
  await page.keyboard.press("End")
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")
})

test("a look removed from the list while the screen was open is refused, with a message for Coni", async ({ page }) => {
  const id = await guionPorAprobar()
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  await page.getByRole("button", { name: "Escuchar la voz" }).click()
  await expect(page.getByText("Ya la escuchaste")).toBeVisible({ timeout: 15_000 })
  await elegirAvatar(page, "Estudio")
  await sembrarAvatares([LOOK_B])

  await page.getByRole("slider", { name: ETIQUETA }).focus()
  await page.keyboard.press("End")

  await expect(alerta(page, "Ese avatar ya no está disponible. Elige otro.")).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("guion_por_aprobar")
  expect(fila.avatar_id).toBeNull()
})
