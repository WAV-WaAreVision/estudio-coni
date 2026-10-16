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

const ETIQUETA = "Desliza para aprobar y grabar"
const PREPARANDO = "Estoy preparando tu voz. Tarda unos segundos."
const GRABANDO = "Estoy grabando tu video."
// A literal, so the spec does not import a TSX component.
const AYUDA_DE_MARCAS = "Lo que va entre corchetes marca el tono de la voz. No se lee ni sale en los subtítulos."
const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOK_A = { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" }
const LOOK_B = { avatar_id: "look-b", nombre: "Terraza", imagen: "avatares/look-b.png" }
const TEXTO_CON_AYUDA = `${TEXTO_VALIDO}\n\nSi lo necesitas, las líneas de ayuda de Chile: 1455, *4141 y 133.`
const produccionDeLaPrueba = { ...BASE, heygen: { ...BASE.heygen, avatares: [LOOK_A, LOOK_B] } }
const ELEVENLABS = leerConfigProduccion(produccionDeLaPrueba).elevenlabs

/** A take of `guion` for this piece, as the writer or grabar-voz stores it. */
const tomaDe = (id: string, guion: string, toma: number) => claveDeToma(id, huellaDelGuion(guion, ELEVENLABS), toma)

async function guionPorAprobar(revision: object[] = [], texto = TEXTO_VALIDO, { conVoz = true } = {}) {
  const idea = await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga, se esconde" })
  const id = await sembrarPieza("guion_por_aprobar", {
    titulo: "El deseo no se apaga, se esconde",
    idea_id: idea,
    guion: GUION_VALIDO,
    texto,
    revision: JSON.stringify(revision),
  })
  // The writer delivers the script with her voice of it, without the note of a voice that failed.
  if (conVoz) await ajustarPieza(id, { audio_id: tomaDe(id, GUION_VALIDO, 0), explicacion: null })
  return id
}

/** What grabar-voz does when it finishes: her take of the script on the row, back at gate 1. The screen polls. */
async function vozLista(id: string) {
  const fila = await leerFila(id)
  await ajustarPieza(id, { estado: "guion_por_aprobar", audio_id: tomaDe(id, fila.guion, fila.intento) })
}

/** She plays her voice to the end; the player remembers it for this take. */
async function escucharLaVoz(page: Page) {
  await page.getByRole("button", { name: "Escuchar la voz" }).click()
  await expect(page.getByText("Ya la escuchaste")).toBeVisible({ timeout: 15_000 })
}

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

test("she edits a sentence and her voice is remade by itself; she listens, picks the avatar and signs", async ({
  page,
}) => {
  const id = await guionPorAprobar([AVISO_DE_RIESGO], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  await expect(page.getByText(AYUDA_DE_MARCAS)).toBeVisible()

  const deslizador = page.getByRole("slider", { name: ETIQUETA })
  await expect(page.getByRole("heading", { name: "El deseo no se apaga, se esconde" })).toBeVisible()
  await expect(page.getByText(/^Si lo apruebas hoy, sale el /)).toBeVisible()
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await expect(deslizador).toHaveAttribute("aria-valuetext", "No aprobado")
  await expect(page.getByText("Falta elegir el avatar y confirmar la revisión.")).toBeVisible()
  await capturar(page, "04-guion")

  // Pushing the slider while it is not enabled does nothing.
  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByText(GRABANDO)).toHaveCount(0)
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

  // The new wording needs its own voice: the screen says so, keeps the script still and waits.
  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Guion", exact: true })).toHaveCount(0)
  await capturar(page, "guion-grabando")
  expect((await leerFila(id)).estado).toBe("grabando_voz")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "voz", piezaId: id, nueva: false }])

  await vozLista(id)
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible({ timeout: 15_000 })
  await elegirAvatar(page, "Terraza")
  // Saving ran a new review: the helplines are in the caption, so there is nothing left to confirm.
  await expect(page.getByRole("checkbox", { name: "Lo revisé y está bien" })).toHaveCount(0)
  await expect(page.getByText("Escucha tu voz completa para firmar.")).toBeVisible()
  await escucharLaVoz(page)
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")

  await deslizador.focus()
  await page.keyboard.press("End")

  await expect(page.getByText(GRABANDO)).toBeVisible()
  expect(await leerFila(id)).toMatchObject({
    estado: "en_render",
    guion: GUION_EDITADO,
    puerta1_por: CONI,
    avatar_id: "look-b",
  })
  expect(disparosRegistrados().map((d) => d.tarea)).toEqual(["voz", "grabar"])
})

test("a script without its voice asks to prepare it, and the voice arrives by itself", async ({ page }) => {
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA, { conVoz: false })
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText("Falta preparar tu voz.").first()).toBeVisible()
  await expect(page.getByText(/^~\d+ caracteres$/)).toBeVisible()
  await expect(
    page.getByText("ElevenLabs: te quedan 99.000 de 100.000 caracteres. Se renuevan el 12 de octubre."),
  ).toBeVisible()
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "true")
  await capturar(page, "guion-sin-voz", { completa: true })

  await page.getByRole("button", { name: "Preparar mi voz" }).click()
  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  expect((await leerFila(id)).estado).toBe("grabando_voz")
  expect(disparosRegistrados()).toMatchObject([{ tarea: "voz", piezaId: id, nueva: false }])

  await vozLista(id)
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: "Grabar la voz de nuevo" })).toBeVisible()
  await capturar(page, "guion-con-voz", { completa: true })
})

test("a piece that failed is discarded only after she confirms, and it leaves Inicio", async ({ page }) => {
  const id = await sembrarPieza("en_render", {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: "HeyGen no pudo terminar el video",
  })
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("No se pudo terminar el video")).toBeVisible()
  await expect(page.getByRole("link", { name: "Volver a Inicio" })).toHaveCount(0)
  await capturar(page, "guion-error")

  await page.getByRole("button", { name: "Descartar esta pieza" }).click()
  await expect(page.getByText("Se descarta esta pieza y no sale. ¿Seguro?")).toBeVisible()
  expect((await leerFila(id)).estado).toBe("error_produccion")
  await page.getByRole("button", { name: "Sí, descartar" }).click()
  await expect.poll(async () => (await leerFila(id)).estado).toBe("descartado")

  await page.goto("/")
  await expect(page.getByText("No se pudo terminar el video")).toHaveCount(0)
})

test("gate 1 shows the committed date in the signature colour and the whole script without inner scroll", async ({
  page,
}) => {
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  const fecha = page.getByText(/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo) \d/).first()
  await expect(fecha).toHaveCSS("color", "rgb(168, 40, 90)")
  const guion = page.getByRole("textbox", { name: "Guion", exact: true })
  const [alto, altoDelContenido] = await guion.evaluate((el) => [el.clientHeight, el.scrollHeight])
  expect(altoDelContenido).toBeLessThanOrEqual(alto + 1)
  const barra = page.getByRole("region", { name: "Firma" })
  // 176 px of bar plus the safe area of the iPhone 14 descriptor.
  expect((await barra.boundingBox())?.height ?? 999).toBeLessThanOrEqual(176 + 34)
  await capturar(page, "guion-por-aprobar-completa", { completa: true })
})

test("a tap on the track never approves, a drag to the end does (brandkit 9.12)", async ({ page }) => {
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  const deslizador = page.getByRole("slider", { name: ETIQUETA })
  await elegirAvatar(page, "Estudio")
  await escucharLaVoz(page)
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")

  const pista = await deslizador.locator("..").boundingBox()
  if (!pista) throw new Error("The slider track has no box")
  await page.mouse.click(pista.x + pista.width - 8, pista.y + pista.height / 2)
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  const pulgar = await deslizador.boundingBox()
  if (!pulgar) throw new Error("The thumb has no box")
  await page.mouse.move(pulgar.x + pulgar.width / 2, pulgar.y + pulgar.height / 2)
  await page.mouse.down()
  await page.mouse.move(pista.x + pista.width, pulgar.y + pulgar.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByText(GRABANDO)).toBeVisible()
  expect((await leerFila(id)).estado).toBe("en_render")
})

test("the visible Aprobar button is the alternative to dragging and asks for the same things (WCAG 2.5.7)", async ({
  page,
}) => {
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  const aprobar = page.getByRole("button", { name: "Aprobar", exact: true })

  // Without an avatar it is as disabled as the slider.
  await expect(aprobar).toBeDisabled()
  // Playwright treats aria-disabled as not actionable; forcing the tap is what a finger does.
  await aprobar.click({ force: true })
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  await elegirAvatar(page, "Estudio")
  await escucharLaVoz(page)
  await expect(aprobar).toBeEnabled()
  await aprobar.click()
  await expect(page.getByText(GRABANDO)).toBeVisible()
  expect((await leerFila(id)).estado).toBe("en_render")
})

test("she listens to her voice, signs, undoes inside the window and signs again: the video starts", async ({
  page,
}) => {
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  const deslizador = page.getByRole("slider", { name: ETIQUETA })

  await expect(
    page.getByText(/^Al firmar grabo el video: ~\d+ s, US\$ \d+,\d\d\. Tienes 8 s para deshacer\.$/),
  ).toBeVisible()
  await elegirAvatar(page, "Estudio")
  await expect(page.getByText("Escucha tu voz completa para firmar.")).toBeVisible()
  await expect(deslizador).toHaveAttribute("aria-disabled", "true")
  await escucharLaVoz(page)
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")

  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByText(/Grabo el video en [78] s\./)).toBeVisible()
  await expect(page.getByText(GRABANDO)).toBeVisible()
  await capturar(page, "guion-firmado")
  expect((await leerFila(id)).estado).toBe("en_render")
  const [primera] = disparosRegistrados()
  expect(primera).toMatchObject({ tarea: "grabar", piezaId: id, retraso: "10s" })

  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByText("Listo, no grabé nada. Puedes seguir revisando.")).toBeVisible()
  await expect(deslizador).toBeVisible()
  expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", puerta1_hash: null })

  // The take she already heard is remembered by the player: only the avatar is picked again.
  await elegirAvatar(page, "Estudio")
  await expect(deslizador).toHaveAttribute("aria-disabled", "false")
  await deslizador.focus()
  await page.keyboard.press("End")
  await expect(page.getByText(GRABANDO)).toBeVisible()
  expect((await leerFila(id)).estado).toBe("en_render")
  // The second signature starts its own run: another attempt, so another key than the undone one.
  const [, segunda] = disparosRegistrados()
  expect(segunda).toMatchObject({ tarea: "grabar", piezaId: id, retraso: "10s" })
  expect(segunda?.clave).not.toBe(primera?.clave)
  expect(segunda?.intento).toBe((primera?.intento ?? 0) + 1)
})

test("while her voice is being made the script is read-only and keeps its tone marks with the help", async ({
  page,
}) => {
  const idea = await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga, se esconde" })
  const id = await sembrarPieza("grabando_voz", {
    titulo: "El deseo no se apaga, se esconde",
    idea_id: idea,
    guion: `[warm] ${GUION_VALIDO}`,
    texto: TEXTO_CON_AYUDA,
  })
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Guion", exact: true })).toHaveCount(0)
  await expect(page.getByText("[warm]", { exact: true })).toBeVisible()
  await expect(page.getByText(AYUDA_DE_MARCAS)).toBeVisible()
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "true")
})

test("a render stopped by the monthly cap shows why and stops polling", async ({ page }) => {
  const id = await sembrarPieza("en_render", {
    explicacion: "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir.",
  })
  await page.goto(`/guion/${id}`)

  await expect(page.getByText("Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir.")).toBeVisible()
  await expect(page.getByText(GRABANDO)).toHaveCount(0)
  // Nothing refreshes it: no further navigation requests in the next seconds.
  let pedidos = 0
  page.on("request", (peticion) => {
    if (peticion.url().includes(`/guion/${id}`)) pedidos += 1
  })
  await page.waitForTimeout(6000)
  expect(pedidos).toBe(0)
})

test("an empty HeyGen API wallet keeps the signature closed and says where to top up", async ({ page }) => {
  await configurarServicios({ heygenSaldo: 0 })
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await elegirAvatar(page, "Estudio")
  await escucharLaVoz(page)
  await expect(page.getByText(/^Tu saldo de API de HeyGen no alcanza/)).toBeVisible()
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "true")
  // Her voice alone still works without HeyGen.
  await expect(page.getByRole("button", { name: "Grabar la voz de nuevo" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  )
})

test("a balance that does not answer is said, and blocks nothing", async ({ page }) => {
  await configurarServicios({ elevenlabs: "401" })
  const id = await guionPorAprobar([], TEXTO_CON_AYUDA)
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await expect(page.getByText("No pude ver tu saldo de ElevenLabs.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Grabar la voz de nuevo" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  )
  await elegirAvatar(page, "Estudio")
  await escucharLaVoz(page)
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "false")
})

test("she goes back to Claude's version after editing, and her voice is asked for again reusing earlier takes", async ({
  page,
}) => {
  const id = await guionPorAprobar()
  await pool.query(
    "insert into public.guion_versiones (pieza_id, numero, guion, texto, autor) values ($1, 1, $2, $3, 'claude')",
    [id, GUION_VALIDO, TEXTO_VALIDO],
  )
  await simularMedios(page)
  await page.goto(`/guion/${id}`)

  await page.getByRole("textbox", { name: "Guion", exact: true }).fill(GUION_EDITADO)
  await page.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  await vozLista(id)
  await expect(page.getByRole("button", { name: "Volver a la versión de Claude" })).toBeVisible({ timeout: 15_000 })

  await page.getByRole("button", { name: "Volver a la versión de Claude" }).click()
  await expect(page.getByText("¿Volver al guion que escribió Claude? Se guarda como una versión nueva.")).toBeVisible()
  await page.getByRole("button", { name: "Sí, volver" }).click()

  await expect(page.getByText(PREPARANDO).first()).toBeVisible()
  expect((await leerFila(id)).guion).toBe(GUION_VALIDO)
  // Neither request asks for a new take: Claude's wording finds the take it already had.
  expect(disparosRegistrados().map((d) => [d.tarea, d.nueva])).toEqual([
    ["voz", false],
    ["voz", false],
  ])
})

test("a caption that forgets the avatar notice blocks the approval until she puts it back", async ({ page }) => {
  const id = await guionPorAprobar()
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  const texto = page.getByRole("textbox", { name: "Texto de la publicación" })

  await texto.fill("Un texto sin el aviso.")
  await page.getByRole("button", { name: "Guardar cambios" }).click()

  await expect(page.getByText("Hay que corregirlo", { exact: true })).toBeVisible()
  await expect(page.getByText(/tiene que avisar que es un avatar digital/).first()).toBeVisible()
  await expect(page.getByText("Guarda tus cambios antes de aprobar")).toBeVisible()
  await page.getByRole("slider", { name: ETIQUETA }).focus()
  await page.keyboard.press("End")
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  await texto.fill(`${TEXTO_VALIDO} Y una línea más.`)
  await expect(page.getByText("Hay que corregirlo", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Guardar cambios" }).click()

  await expect(page.getByText("Guardado", { exact: true })).toBeVisible()
  await elegirAvatar(page, "Estudio")
  // The caption is not what her voice says: the voice stays, and only listening to it is left.
  await expect(page.getByText("Escucha tu voz completa para firmar.")).toBeVisible()
  await escucharLaVoz(page)
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "false")
  expect(disparosRegistrados()).toEqual([])
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
  await escucharLaVoz(page)

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
  await escucharLaVoz(page)
  await sembrarAvatares([LOOK_B])

  await page.getByRole("slider", { name: ETIQUETA }).focus()
  await page.keyboard.press("End")

  await expect(alerta(page, "Ese avatar ya no está disponible. Elige otro.")).toBeVisible()
  const fila = await leerFila(id)
  expect(fila.estado).toBe("guion_por_aprobar")
  expect(fila.avatar_id).toBeNull()
})
