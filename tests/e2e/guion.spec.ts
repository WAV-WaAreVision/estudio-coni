import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { CONI, pool } from "../integration/db"
import { ajustarPieza, leerFila, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  alerta,
  capturar,
  configurarServicios,
  disparosRegistrados,
  GUION_VALIDO,
  limpiarDisparos,
  simularMedios,
  TEXTO_VALIDO,
} from "./ayudas"

const ETIQUETA = "Desliza para aprobar el guion"
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
const produccionDeLaPrueba = { ...BASE, heygen: { ...BASE.heygen, avatares: [LOOK_A, LOOK_B] } }
const AVISO_DE_RIESGO = {
  regla: "tema_de_riesgo",
  tipo: "advierte",
  mensaje: "El tema es sexualidad. HeyGen revisa estos guiones con más cuidado; confirma que el lenguaje es educativo.",
}

// Prepended: the script has to keep ending with her signature.
const GUION_EDITADO = `Esto lo agregué yo. ${GUION_VALIDO}`

test.beforeEach(async () => {
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await pool.query("select vault.create_secret('sk-ant-de-prueba-de-coni', 'anthropic')")
  await vaciarPiezasEIdeas()
  limpiarDisparos()
  // The balances are read with these keys, against the fake services.
  for (const nombre of ["heygen", "elevenlabs"]) {
    await pool.query("delete from vault.secrets where name = $1", [nombre])
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
  await configurarServicios()
  await sembrarAvatares([LOOK_A, LOOK_B])
})

test.afterAll(async () => {
  await pool.query("delete from vault.secrets where name in ('anthropic', 'heygen', 'elevenlabs')")
})

async function guionPorAprobar(revision: object[] = [], texto = TEXTO_VALIDO) {
  const idea = await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga, se esconde" })
  return sembrarPieza("guion_por_aprobar", {
    titulo: "El deseo no se apaga, se esconde",
    idea_id: idea,
    guion: GUION_VALIDO,
    texto,
    revision: JSON.stringify(revision),
  })
}

test("she edits a sentence, saves, picks the avatar and slides: approved without any audio, recording starts", async ({
  page,
}) => {
  const id = await guionPorAprobar(
    [AVISO_DE_RIESGO],
    `${TEXTO_VALIDO}\n\nSi lo necesitas, las líneas de ayuda de Chile: 1455, *4141 y 133.`,
  )
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  const deslizador = page.getByRole("slider", { name: ETIQUETA })
  await expect(page.getByRole("heading", { name: "El deseo no se apaga, se esconde" })).toBeVisible()
  await expect(page.getByText(/^Si lo apruebas hoy, sale el /)).toBeVisible()
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toHaveCount(0)
  await expect(page.getByText("Aprobar no gasta nada. Después grabas la voz y el video.")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await expect(deslizador).toHaveAttribute("aria-valuetext", "No aprobado")
  await expect(page.getByText("Falta elegir el avatar y confirmar la revisión.")).toBeVisible()
  await capturar(page, "04-guion")

  // Pushing the slider while it is not enabled does nothing.
  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByText("Aprobado. Estoy grabando el video.")).toHaveCount(0)
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  const guion = page.getByRole("textbox", { name: "Guion", exact: true })
  await expect(guion).toHaveValue(GUION_VALIDO)
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveAttribute("aria-disabled", "true")
  await guion.fill(GUION_EDITADO)
  await expect(page.getByText(/palabras · ≈ \d+ s/)).toBeVisible()
  await expect(page.getByText("Guarda tus cambios antes de aprobar")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await capturar(page, "guion-editor")
  await page.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByRole("status")).toContainText("Guardado")
  await expect(page.getByText("Guarda tus cambios antes de aprobar")).toHaveCount(0)

  await elegirAvatar(page, "Terraza")
  // Saving runs a new review: the helplines are in the caption, so there is nothing left to confirm.
  await expect(page.getByRole("checkbox", { name: "Lo revisé y está bien" })).toHaveCount(0)
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")

  await deslizador.focus()
  await page.keyboard.press("End")

  await expect(page.getByRole("button", { name: "Grabar voz" })).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("guion_aprobado")
  expect(fila.guion).toBe(GUION_EDITADO)
  expect(fila.puerta1_por).toBe(CONI)
  expect(fila.avatar_id).toBe("look-b")
  expect(disparosRegistrados()).toEqual([])
})

test("she records the voice alone, listens to it, and then records the video reusing it", async ({ page }) => {
  const id = await sembrarPieza("guion_aprobado")
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText(/^Grabar voz: ~\d+ caracteres \(US\$ \d+,\d\d\)$/)).toBeVisible()
  await expect(
    page.getByText("ElevenLabs: te quedan 99.000 de 100.000 caracteres. Se renuevan el 12 de octubre."),
  ).toBeVisible()
  await expect(page.getByText("Saldo de API de HeyGen: US$ 50,00. Es aparte de tu plan de HeyGen.")).toBeVisible()
  await page.getByRole("button", { name: "Grabar voz" }).click()
  await expect(page.getByText("Estoy grabando tu voz")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("grabando_voz")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "voz", piezaId: id, nueva: false }])

  // What grabar-voz does when it finishes; the screen picks it up by itself.
  const fila = await leerFila(id)
  const config = leerConfigProduccion(produccionDeLaPrueba)
  await ajustarPieza(id, {
    estado: "guion_aprobado",
    audio_id: claveDeToma(id, huellaDelGuion(fila.guion, config.elevenlabs), fila.intento),
  })
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: "Volver a grabar voz" })).toBeVisible()
  await expect(page.getByText(/^Volver a grabar voz: ~\d+ caracteres/)).toBeVisible()
  await expect(page.getByText(/^Grabar voz: ~/)).toHaveCount(0)
  await expect(page.getByText(/incluye la voz/)).toHaveCount(0)

  await page.getByRole("button", { name: "Grabar video" }).click()
  await page.getByRole("button", { name: "Sí, grabar" }).click()
  await expect(page.getByText("Aprobado. Estoy grabando el video.")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("en_render")
  expect(disparosRegistrados().at(-1)).toMatchObject({ tarea: "grabar", piezaId: id })
})

test("approve, take it back, edit, save and approve again, all on the same screen", async ({ page }) => {
  const id = await guionPorAprobar(
    [],
    `${TEXTO_VALIDO}\n\nSi lo necesitas, las líneas de ayuda de Chile: 1455, *4141 y 133.`,
  )
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  const deslizador = page.getByRole("slider", { name: ETIQUETA })

  await elegirAvatar(page, "Estudio")
  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByRole("button", { name: "Grabar voz" })).toBeVisible()
  expect((await leerFila(id)).estado).toBe("guion_aprobado")

  await page.getByRole("button", { name: "Volver a revisar el guion" }).click()
  await expect(deslizador).toBeVisible()
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  const guion = page.getByRole("textbox", { name: "Guion", exact: true })
  await guion.fill(GUION_EDITADO)
  await page.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByRole("status")).toContainText("Guardado")
  await elegirAvatar(page, "Terraza")
  await deslizador.focus()
  await page.keyboard.press("End")

  await expect(page.getByRole("button", { name: "Grabar voz" })).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("guion_aprobado")
  expect(fila.guion).toBe(GUION_EDITADO)
  expect(fila.avatar_id).toBe("look-b")
})

test("an empty HeyGen API wallet disables the video and says where to top up", async ({ page }) => {
  await configurarServicios({ heygenSaldo: 0 })
  const id = await sembrarPieza("guion_aprobado")
  await page.goto(`/guion/${id}`)

  await expect(page.getByRole("button", { name: "Grabar video" })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(/^Tu saldo de API de HeyGen no alcanza/)).toBeVisible()
  // The voice alone still works without HeyGen.
  await expect(page.getByRole("button", { name: "Grabar voz" })).not.toHaveAttribute("aria-disabled", "true")
})

test("a balance that does not answer is said, and blocks nothing", async ({ page }) => {
  await configurarServicios({ elevenlabs: "401" })
  const id = await sembrarPieza("guion_aprobado")
  await page.goto(`/guion/${id}`)

  await expect(page.getByText("No pude ver tu saldo de ElevenLabs.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Grabar voz" })).not.toHaveAttribute("aria-disabled", "true")
  await expect(page.getByRole("button", { name: "Grabar video" })).not.toHaveAttribute("aria-disabled", "true")
})

test("she goes back to Claude's version after editing and the original text returns", async ({ page }) => {
  const id = await guionPorAprobar()
  await pool.query(
    "insert into public.guion_versiones (pieza_id, numero, guion, texto, autor) values ($1, 1, $2, $3, 'claude')",
    [id, GUION_VALIDO, TEXTO_VALIDO],
  )
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  const guion = page.getByRole("textbox", { name: "Guion", exact: true })

  await guion.fill(GUION_EDITADO)
  await page.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Volver a la versión de Claude" }).click()
  await expect(page.getByText("¿Volver al guion que escribió Claude? Se guarda como una versión nueva.")).toBeVisible()
  await page.getByRole("button", { name: "Sí, volver" }).click()

  await expect(guion).toHaveValue(GUION_VALIDO)
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible()
  expect((await leerFila(id)).guion).toBe(GUION_VALIDO)
})

test("a caption that forgets the avatar notice blocks the approval until she puts it back", async ({ page }) => {
  const id = await guionPorAprobar()
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  const texto = page.getByRole("textbox", { name: "Texto de la publicación" })

  await texto.fill("Un texto sin el aviso.")
  await page.getByRole("button", { name: "Guardar cambios" }).click()

  await expect(page.getByText("Hay que corregirlo:")).toBeVisible()
  await expect(page.getByText(/tiene que avisar que es un avatar digital/).first()).toBeVisible()
  await expect(page.getByText("Guarda tus cambios antes de aprobar")).toBeVisible()
  await page.getByRole("slider", { name: ETIQUETA }).focus()
  await page.keyboard.press("End")
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  await texto.fill(`${TEXTO_VALIDO} Y una línea más.`)
  await expect(page.getByText("Hay que corregirlo:")).toHaveCount(0)
  await page.getByRole("button", { name: "Guardar cambios" }).click()

  await expect(page.getByText("Guardado", { exact: true })).toBeVisible()
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
  await elegirAvatar(page, "Estudio")
  await sembrarAvatares([LOOK_B])

  await page.getByRole("slider", { name: ETIQUETA }).focus()
  await page.keyboard.press("End")

  await expect(alerta(page, "Ese avatar ya no está disponible. Elige otro.")).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("guion_por_aprobar")
  expect(fila.avatar_id).toBeNull()
})
