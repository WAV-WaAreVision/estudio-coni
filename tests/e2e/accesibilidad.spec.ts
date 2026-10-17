import { readFileSync } from "node:fs"
import { join } from "node:path"
import AxeBuilder from "@axe-core/playwright"
import { expect, type Page, test } from "@playwright/test"
import { TEXTO_NO_ESCRIBI, TEXTO_NO_TERMINE, TEXTO_VIDEO_DETENIDO } from "@/app/(app)/guion/[id]/textos"
import { TEXTO_ARMADO } from "@/lib/diseno/deslizador"
import { pool } from "../integration/db"
import { sembrarPieza } from "../integration/siembra"
import {
  abrirDesplegable,
  bloquearRedExterna,
  conectarLinkedin,
  configurarServicios,
  desconectarLinkedin,
  simularMedios,
} from "./ayudas"
import { sembrarEscena } from "./escena"

test("the app text is set in Geist, one family", async ({ page }) => {
  await page.goto("/")
  const familia = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(familia).toMatch(/Geist/i)
  expect(familia).not.toMatch(/Hanken|Young/i)
  // The approx sign is in the npm Geist and not in the Google subset (brandkit section 4).
  const cargada = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].some((f) => /geist/i.test(f.family) && f.status === "loaded")
  })
  expect(cargada).toBe(true)
})

test("the app stays light even when the phone is in dark mode (light only)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" })
  await page.goto("/")
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(fondo).toBe("rgb(235, 235, 234)") // #ebebea, piedra
  const esquema = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
  expect(esquema).toBe("light")
})

// Light only: there is no dark theme to audit.
async function rutas(): Promise<string[]> {
  const { guion, video } = await sembrarEscena()
  return [
    "/",
    "/ideas",
    "/calendario",
    "/calendario?vista=agenda",
    "/calendario?vista=ritmo",
    "/metricas",
    "/ajustes",
    "/ajustes/cuentas",
    `/guion/${guion}`,
    `/video/${video}`,
    "/l",
  ]
}

/**
 * Gate 1 folds its editor (and "Más opciones" once a look is chosen) and gate 2 folds its options: a folded control is skipped by axe and by the
 * size audit, so both open them first to measure the script and caption fields, "Guardar cambios", "Pedir cambios" and
 * the rest.
 */
async function abrirPliegues(page: Page, ruta: string): Promise<void> {
  if (ruta.startsWith("/video/")) {
    // Gate 2: the destinations, the zones and "Regrabar video" sit in "Más opciones"; "Cambiar" opens the dates.
    await abrirDesplegable(page, "Más opciones")
    await page.getByRole("button", { name: "Cambiar" }).click()
    await expect(page.getByRole("radio").first()).toBeVisible()
    return
  }
  if (ruta === "/") {
    await abrirPlieguesDeInicio(page)
    return
  }
  if (!ruta.startsWith("/guion/")) return
  await abrirDesplegable(page, "Editar el guion")
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toBeVisible()
  // With no looks to choose and no LinkedIn text there is no "Más opciones" to open.
  if ((await page.locator("summary", { hasText: "Más opciones" }).count()) > 0)
    await abrirDesplegable(page, "Más opciones")
}

/** Inicio folds the week's ideas and the consultations: a folded control is skipped by axe and by the size audit. */
async function abrirPlieguesDeInicio(page: Page): Promise<void> {
  await abrirDesplegable(page, "Elegir ideas de la semana")
  await abrirDesplegable(page, "Consultas")
  await expect(page.getByRole("button", { name: "Llegó una consulta" })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // The idea card fades in: axe would read the colours halfway. Reduced motion is also a real way to use the app.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await configurarServicios()
  await simularMedios(page)
})

test("every screen passes WCAG 2.x AA", async ({ page }) => {
  // Tall enough that the sticky bottom bar never covers content while axe measures target sizes (it depends on scroll).
  await page.setViewportSize({ width: 390, height: 2600 })
  const hallazgos: string[] = []
  for (const ruta of await rutas()) {
    await page.goto(ruta)
    await abrirPliegues(page, ruta)
    // The frame of the video is the user's footage: its contrast is not the app's.
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .exclude("video")
      .analyze()
    hallazgos.push(...violations.map((v) => `${ruta}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`))
  }
  expect(hallazgos).toEqual([])
})

test("every control on every screen is at least 44 x 44", async ({ page }) => {
  const hallazgos: string[] = []
  for (const ruta of await rutas()) {
    await page.goto(ruta)
    await abrirPliegues(page, ruta)
    const chicos = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button, [role=slider], [role=switch], input:not([type=hidden]), select, summary",
        ),
      ]
        .filter((el) => el.offsetParent !== null && !el.closest("[aria-hidden=true], [data-en-linea]"))
        // A native input that is invisible or covers its row is measured through its label: the label is the target.
        .map((el) => ({ el, caja: (el.closest("label") ?? el).getBoundingClientRect() }))
        .filter(({ caja }) => caja.width < 44 || caja.height < 44)
        .map(
          ({ el, caja }) =>
            `${el.tagName} "${el.textContent?.trim().slice(0, 30) || el.getAttribute("aria-label")}" ${Math.round(caja.width)}x${Math.round(caja.height)}`,
        ),
    )
    hallazgos.push(...chicos.map((chico) => `${ruta}: ${chico}`))
  }
  expect(hallazgos).toEqual([])
})

const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOK = { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" }

async function hallazgosDeAxe(page: Page, estado: string): Promise<string[]> {
  // The frame of the video is the user's footage: its contrast is not the app's.
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .exclude("video")
    .analyze()
  return violations.map((v) => `${estado}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
}

// Amendment 1: the states the Soft UI kit adds (Lote 2 on), opened before axe reads them. Later lotes add theirs here.
test("the states the Soft UI kit adds pass WCAG 2.x AA: sign, undo window, failures and the toast", async ({
  page,
}) => {
  // The undo window lasts 8 s and is read twice, open and closed.
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 2600 })
  const { guion } = await sembrarEscena()
  const {
    rows: [anterior],
  } = await pool.query<{ produccion: unknown }>("select produccion from public.ajustes limit 1")
  await pool.query("update public.ajustes set produccion = $1::jsonb", [
    JSON.stringify({ ...BASE, heygen: { ...BASE.heygen, avatares: [LOOK] } }),
  ])
  try {
    const hallazgos: string[] = []

    // Gate 1 with the track armed by a first tap: the thumb at the end and the trail in --firma-rastro.
    await page.goto(`/guion/${guion}`)
    await page.getByRole("radio", { name: LOOK.nombre }).locator("xpath=ancestor::label").click()
    await page.getByRole("button", { name: "Escuchar la voz" }).click()
    await expect(page.getByText("La escuchaste completa")).toBeVisible({ timeout: 15_000 })

    // Gate 1 with the editor open and the "Pedir cambios" confirm asked.
    await abrirDesplegable(page, "Editar el guion")
    await page.getByRole("button", { name: "Pedir cambios" }).click()
    await expect(page.getByRole("button", { name: "Sí, pedir cambios" })).toBeVisible()
    hallazgos.push(...(await hallazgosDeAxe(page, "pedir cambios")))
    await page.getByRole("button", { name: "Volver", exact: true }).click()

    const pista = page.getByRole("slider", { name: "Desliza para firmar" })
    await expect(pista).toHaveAttribute("aria-disabled", "false")
    await pista.click()
    await expect(pista).toHaveAttribute("aria-valuetext", TEXTO_ARMADO)
    hallazgos.push(...(await hallazgosDeAxe(page, "firma armada")))

    // Signing (from the keyboard: the armed tap may have lapsed while axe read) opens the undo window, an <output>
    // holding the focused "Deshacer"; then the recording going on.
    await pista.focus()
    await page.keyboard.press("End")
    await page.waitForURL(/\?firmada=\d+$/)
    await expect(page.getByRole("button", { name: "Deshacer" })).toBeFocused()
    hallazgos.push(...(await hallazgosDeAxe(page, "ventana de deshacer")))
    await expect(page.getByText("Estoy grabando tu video.")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("button", { name: "Deshacer" })).toHaveCount(0)
    hallazgos.push(...(await hallazgosDeAxe(page, "ventana cerrada")))

    // A video that failed: the large error block with its one way forward and the quiet discard.
    const fallida = await sembrarPieza("en_render", {
      estado: "error_produccion",
      estado_antes_del_error: "en_render",
      explicacion: "HeyGen no pudo terminar el video",
    })
    await page.goto(`/guion/${fallida}`)
    await expect(page.getByText(TEXTO_NO_TERMINE)).toBeVisible()
    hallazgos.push(...(await hallazgosDeAxe(page, "error de produccion")))

    // A script that could not be written, with the destructive confirm of the discard asked.
    const sinGuion = await sembrarPieza("guion_en_proceso", { explicacion: "Claude no respondió a tiempo." })
    await page.goto(`/guion/${sinGuion}`)
    await expect(page.getByText(TEXTO_NO_ESCRIBI)).toBeVisible()
    await page.getByRole("button", { name: "Descartar esta pieza" }).click()
    await expect(page.getByRole("button", { name: "Sí, descartar" })).toBeVisible()
    hallazgos.push(...(await hallazgosDeAxe(page, "guion sin escribir")))

    // A render stopped with a reason.
    const detenida = await sembrarPieza("en_render", {
      explicacion: "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir.",
    })
    await page.goto(`/guion/${detenida}`)
    await expect(page.getByText(TEXTO_VIDEO_DETENIDO)).toBeVisible()
    hallazgos.push(...(await hallazgosDeAxe(page, "video detenido")))

    // The toast, portalled to <body>, above the bottom nav.
    await page.goto("/")
    await abrirDesplegable(page, "Consultas")
    await page.getByRole("button", { name: "Llegó una consulta" }).click()
    await expect(page.getByRole("status").filter({ hasText: /^Anotada\./ })).toBeVisible()
    hallazgos.push(...(await hallazgosDeAxe(page, "aviso")))

    expect(hallazgos).toEqual([])
  } finally {
    await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(anterior?.produccion ?? {})])
  }
})

// Lote 5: Inicio with a failure (the large block holds the one primary), a signable piece (the card) and both folds open.
test("Inicio with a failure, a piece to sign and its folds open passes WCAG 2.x AA", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 2600 })
  await sembrarEscena()
  await sembrarPieza("en_render", {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: "HeyGen no pudo terminar el video",
  })
  await page.goto("/")
  await expect(page.getByRole("alert")).toContainText("No pude terminar el video.")
  await abrirPlieguesDeInicio(page)
  expect(await hallazgosDeAxe(page, "inicio con falla")).toEqual([])
})

// Lote 6: Cuentas with LinkedIn connected, its danger disclosure and a key's "Más opciones" open.
test("Cuentas with LinkedIn connected and its folds open passes WCAG 2.x AA", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 2600 })
  await sembrarEscena()
  await conectarLinkedin()
  // A stored key folds "Cambiar la llave" under its "Más opciones"; a missing one shows "Agregar la llave" instead.
  await pool.query("delete from vault.secrets where name = 'heygen'")
  await pool.query("select vault.create_secret('llave-de-heygen-e2e', 'heygen')")
  try {
    await page.goto("/ajustes/cuentas")
    await abrirDesplegable(page, "Desconectar LinkedIn")
    await expect(page.getByRole("button", { name: "Sí, desconectar" })).toBeVisible()
    await abrirDesplegable(page, "Más opciones")
    await expect(page.getByRole("button", { name: /^Cambiar la llave de / }).first()).toBeVisible()
    expect(await hallazgosDeAxe(page, "cuentas con pliegues")).toEqual([])
  } finally {
    await pool.query("delete from vault.secrets where name = 'heygen'")
    await desconectarLinkedin()
  }
})
