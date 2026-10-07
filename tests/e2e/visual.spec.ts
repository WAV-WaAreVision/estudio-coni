import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { pool } from "../integration/db"
import { ajustarPieza, leerFila, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, GUION_VALIDO, simularMedios, TEXTO_VALIDO } from "./ayudas"
import { sembrarEscena } from "./escena"

/**
 * 390 px captures of every screen, light only, for two jobs: the review sheet against the mockups (`pnpm comparar`,
 * which wants VISUAL_SHEET=1: device scale and no masks, to read) and the committed baselines every later run diffs
 * against (css scale, date text masked). The app server reads the real clock, which a test cannot freeze: the masks
 * hide the leaf nodes that carry dates and the month grid, but a month change moves the calendar rows, so the baselines
 * may need regenerating then (`pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots`, after reviewing the diff).
 */
const PARA_LA_HOJA = Boolean(process.env.VISUAL_SHEET)
// VISUAL_FINALES=<folder> writes plain 390 px css PNGs of every screen there (no masks, no comparison) for review by eye.
const CARPETA_FINALES = process.env.VISUAL_FINALES

const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOKS = [
  { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" },
  { avatar_id: "look-b", nombre: "Terraza", imagen: "avatares/look-b.png" },
]
const CONFIG = { ...BASE, heygen: { ...BASE.heygen, avatares: LOOKS } }

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await pool.query("delete from vault.secrets where name in ('anthropic', 'heygen', 'elevenlabs')")
  for (const nombre of ["anthropic", "heygen", "elevenlabs"]) {
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(CONFIG)])
  await configurarServicios()
  await simularMedios(page)
})

test.afterAll(async () => {
  await pool.query("delete from vault.secrets where name in ('anthropic', 'heygen', 'elevenlabs')")
})

const DIAS = "lunes|martes|miércoles|jueves|viernes|sábado|domingo"
const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre"
const MESES_CORTOS = "ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic"
const FECHAS = new RegExp(
  `\\b(${DIAS}|${MESES}|${MESES_CORTOS}|Lun|Mar|Mié|Jue|Vie|Sáb|Dom)\\b|\\d{1,2}:\\d{2}|Semana del|hoy a las`,
  "i",
)

/** The text-only nodes that say a date or an hour, and the month grid: what moves with the real clock. */
function mascaras(page: Page) {
  const hojas = page
    .locator("span, p, h1, h2, h3, summary, div")
    .filter({ hasText: FECHAS })
    .filter({ hasNot: page.locator("*") })
  return [hojas, page.locator("ol.grid-cols-7")]
}

async function capturaDe(page: Page, nombre: string) {
  // Ajustes streams its status block and its accounts behind Suspense: wait until the skeletons are gone.
  await page.waitForLoadState("networkidle")
  await expect(page.locator("output[aria-label^='Revisando']")).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  // A full-page capture would stop the sticky nav and the fixed bars halfway down: let them take their place at the end.
  await page.addStyleTag({
    content:
      "nav[aria-label='Secciones'], section[aria-label='Firma'], section[aria-label='Grabación'] { position: static !important }",
  })
  if (CARPETA_FINALES) {
    mkdirSync(CARPETA_FINALES, { recursive: true })
    await page.screenshot({ path: join(CARPETA_FINALES, `${nombre}.png`), fullPage: true, scale: "css" })
    return
  }
  await expect(page).toHaveScreenshot(`${nombre}.png`, {
    fullPage: true,
    ...(PARA_LA_HOJA ? { scale: "device" as const } : { mask: mascaras(page) }),
  })
}

const PANTALLAS = [
  ["inicio", "/"],
  ["ideas", "/ideas"],
  ["calendario-mes", "/calendario"],
  ["calendario-agenda", "/calendario?vista=agenda"],
  ["calendario-ritmo", "/calendario?vista=ritmo"],
  ["ajustes", "/ajustes"],
  ["ajustes-cuentas", "/ajustes/cuentas"],
  ["l", "/l"],
] as const

for (const [nombre, ruta] of PANTALLAS) {
  test(nombre, async ({ page }) => {
    await sembrarEscena()
    await page.goto(ruta)
    await capturaDe(page, nombre)
  })
}

test("inicio vacio", async ({ page }) => {
  await vaciarPiezasEIdeas()
  for (const gancho of [
    "Un visto sin respuesta y ya imaginas lo peor. ¿Te pasa?",
    "¿Por qué sientes culpa al descansar?",
  ])
    await sembrarIdea({ pilar: "bienestar", gancho })
  await page.goto("/")
  await capturaDe(page, "inicio-vacio")
})

test("guion por aprobar", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await page.goto(`/guion/${guion}`)
  await capturaDe(page, "guion-por-aprobar")
})

test("video por aprobar", async ({ page }) => {
  const { video } = await sembrarEscena()
  await page.goto(`/video/${video}`)
  await capturaDe(page, "video-por-aprobar")
})

async function guionAprobado(estado: "guion_aprobado" | "grabando_voz") {
  await vaciarPiezasEIdeas()
  const idea = await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga, se esconde" })
  return sembrarPieza(estado, {
    titulo: "El deseo no se apaga, se esconde",
    idea_id: idea,
    guion: GUION_VALIDO,
    texto: TEXTO_VALIDO,
  })
}

test("guion aprobado sin voz", async ({ page }) => {
  const id = await guionAprobado("guion_aprobado")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "guion-aprobado-sin-voz")
})

test("guion con voz", async ({ page }) => {
  const id = await guionAprobado("guion_aprobado")
  const fila = await leerFila(id)
  const config = leerConfigProduccion(CONFIG)
  await ajustarPieza(id, { audio_id: claveDeToma(id, huellaDelGuion(fila.guion, config.elevenlabs), fila.intento) })
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible()
  await capturaDe(page, "guion-con-voz")
})

test("guion grabando", async ({ page }) => {
  const id = await guionAprobado("grabando_voz")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "guion-grabando")
})

test("guion error", async ({ page }) => {
  const id = await guionAprobado("guion_aprobado")
  await ajustarPieza(id, {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: "HeyGen no pudo terminar el video",
  })
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "guion-error")
})

test("metricas", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.consultas")
  const reels = [
    ["Ser tu propia diosa", "autoestima", 20, 2000, 10],
    ["Si van a discutir, siéntense del mismo lado", "pareja", 12, 2400, 121],
    ["El deseo no se apaga, se esconde", "deseo", 8, 1000, 12],
  ] as const
  for (const [titulo, pilar, haceDias, alcance, guardados] of reels) {
    const idea = await sembrarIdea({ pilar, gancho: titulo })
    const id = await sembrarPieza("publicado", { titulo, idea_id: idea, media_id: `media_${titulo}` })
    const cliente = await pool.connect()
    try {
      await cliente.query("begin")
      await cliente.query("set local session_replication_role = replica")
      await cliente.query(
        "update public.piezas set puerta2_publicar_en = now() - make_interval(days => $2) where id = $1",
        [id, haceDias],
      )
      await cliente.query("commit")
    } finally {
      cliente.release()
    }
    await pool.query(
      "insert into public.metricas_reel (pieza_id, dia, alcance, guardados, compartidos, comentarios, tiempo_promedio) values ($1, (now() at time zone 'America/Santiago')::date, $2, $3, 30, 7, 24400)",
      [id, alcance, guardados],
    )
  }
  await page.goto("/metricas")
  await capturaDe(page, "metricas")
})

test("ingreso", async ({ browser }) => {
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    storageState: { cookies: [], origins: [] },
  })
  const page = await contexto.newPage()
  await page.goto("/ingreso")
  await capturaDe(page, "ingreso")
  await contexto.close()
})

test("ingreso con codigo equivocado", async ({ browser }) => {
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    storageState: { cookies: [], origins: [] },
  })
  const page = await contexto.newPage()
  await page.goto("/ingreso")
  await page.getByRole("button", { name: "Mandarme el código" }).click()
  await page.getByRole("textbox", { name: "Número 1 de 6" }).click()
  await page.keyboard.type("000000")
  await expect(page.getByRole("alert").filter({ hasText: "Ese código no sirve" })).toBeVisible()
  await capturaDe(page, "ingreso-codigo-error")
  await contexto.close()
})
