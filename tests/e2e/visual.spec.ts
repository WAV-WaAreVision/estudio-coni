import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Locator, type Page, test } from "@playwright/test"
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion, TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { pool } from "../integration/db"
import {
  ajustarPieza,
  leerFila,
  marcarPublicacion,
  moverHoraAprobada,
  quitarPublicacion,
  sembrarIdea,
  vaciarPiezasEIdeas,
} from "../integration/siembra"
import {
  bloquearRedExterna,
  conectarLinkedin,
  configurarServicios,
  conLetraGrande,
  desconectarLinkedin,
  simularMedios,
  TEXTO_LINKEDIN_VALIDO,
} from "./ayudas"
import { IDEAS, PIEZAS, sembrarCarruselDeEscena, sembrarEscena, sembrarPiezaDeEscena } from "./escena"

/**
 * 390 px captures of every screen, light only, for two jobs: the review sheet against the mockups (`pnpm comparar`,
 * which wants VISUAL_SHEET=1: device scale and no masks, to read) and the committed baselines every later run diffs
 * against (css scale, moving data masked). The app server reads the real clock, which a test cannot freeze: the masks
 * hide every element marked data-snapshot="varia" (dates, times, balances, durations, the month grid), but a month
 * change moves the calendar rows, so the baselines may need regenerating then
 * (`pnpm test:e2e tests/e2e/visual.spec.ts --update-snapshots`, after reviewing the diff).
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

// What moves with the real clock (relative dates, times, balances, durations) carries data-snapshot="varia" in the app.
// The mask is painted in the honda stone (--piedra-honda of app/globals.css) so it reads as a sunken tile.
const COLOR_DE_MASCARA = "#dcdcdb"

function mascaras(page: Page) {
  return [page.locator('[data-snapshot="varia"]')]
}

async function capturaDe(page: Page, nombre: string, ocultar: Locator[] = []) {
  // Ajustes streams its status block and its accounts behind Suspense: wait until the skeletons are gone.
  await page.waitForLoadState("networkidle")
  await expect(page.locator("output[aria-label^='Revisando']")).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  // A full-page capture would stop the sticky nav and bar halfway down: let them take their place at the end.
  await page.addStyleTag({
    content: "nav[aria-label='Secciones'], [data-barra-de-firma], [data-barra-de-lote] { position: static !important }",
  })
  if (!PARA_LA_HOJA && !CARPETA_FINALES) {
    // Inicio's week is masked, but a week across two months ("26 de octubre al 1 de noviembre") wraps under the
    // greeting and moves the whole screen: a fixed one-month week keeps the line the baseline was taken with.
    await page.evaluate(() => {
      for (const nodo of document.querySelectorAll('[data-snapshot="varia"]')) {
        if (nodo.childElementCount === 0 && nodo.textContent?.startsWith("Semana del ")) {
          nodo.textContent = "Semana del 5 al 11 de octubre"
        }
      }
    })
  }
  if (CARPETA_FINALES) {
    mkdirSync(CARPETA_FINALES, { recursive: true })
    await page.screenshot({ path: join(CARPETA_FINALES, `${nombre}.png`), fullPage: true, scale: "css" })
    return
  }
  await expect(page).toHaveScreenshot(`${nombre}.png`, {
    fullPage: true,
    ...(PARA_LA_HOJA
      ? { scale: "device" as const }
      : { mask: [...mascaras(page), ...ocultar], maskColor: COLOR_DE_MASCARA }),
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

test("ideas elegir varias", async ({ page }) => {
  await sembrarEscena()
  await page.goto("/ideas")
  await page.getByRole("button", { name: "Elegir varias" }).click()
  const casillas = page.getByRole("checkbox")
  await casillas.nth(0).check()
  await casillas.nth(1).check()
  await expect(page.getByRole("region", { name: "Ideas elegidas" })).toBeVisible()
  await capturaDe(page, "ideas-elegir-varias")
})

test("calendario agenda con propuestas", async ({ page }) => {
  await sembrarEscena()
  await page.goto("/calendario?vista=agenda")
  await page.getByRole("button", { name: "Repartir fechas" }).click()
  await expect(page.getByText(/ · propuesta$/).first()).toBeVisible()
  // The toast is fixed: in a full-page capture it would sit over the rows. It closes by itself after 8 s.
  await expect(page.getByText(/^Propuse fecha para/)).toHaveCount(0, { timeout: 10_000 })
  await page
    .getByRole("button", { name: /^Cambiar la fecha de/ })
    .first()
    .click()
  await expect(page.getByRole("group", { name: "¿Qué otro día?" })).toBeVisible()
  await capturaDe(page, "calendario-agenda-propuestas")
})

test("inicio vacio", async ({ page }) => {
  await vaciarPiezasEIdeas()
  for (const idea of IDEAS.slice(1, 3)) await sembrarIdea(idea)
  await page.goto("/")
  await capturaDe(page, "inicio-vacio")
})

test("inicio con fallas", async ({ page }) => {
  const { video } = await sembrarEscena()
  const fallida = await sembrarPiezaDeEscena("en_render", PIEZAS.conFalla)
  await ajustarPieza(fallida, {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: "HeyGen no pudo terminar el video",
  })
  await ajustarPieza(video, { explicacion: "La hora aprobada pasó sin publicarse. Elige una nueva fecha." })
  await pool.query("delete from public.avisos")
  await page.goto("/")
  await capturaDe(page, "inicio-con-fallas")
})

test("inicio letra grande", async ({ page }) => {
  await sembrarEscena()
  await page.goto("/")
  await conLetraGrande(page)
  await capturaDe(page, "inicio-letra-grande")
})

test("cuentas desconectar", async ({ page }) => {
  await sembrarEscena()
  await conectarLinkedin()
  try {
    await page.goto("/ajustes/cuentas")
    await page.getByText("Desconectar LinkedIn").click()
    await expect(page.getByText("Tus videos dejarán de salir solos ahí y te quedarán para subir a mano.")).toBeVisible()
    await capturaDe(page, "cuentas-desconectar")
  } finally {
    await desconectarLinkedin()
  }
})

test("ajustes cuentas letra grande", async ({ page }) => {
  await sembrarEscena()
  await page.goto("/ajustes/cuentas")
  await conLetraGrande(page)
  await capturaDe(page, "ajustes-cuentas-letra-grande")
})

test("guion por aprobar", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await page.goto(`/guion/${guion}`)
  await capturaDe(page, "guion-por-aprobar")
})

/** The video she already watched to the end: the player reads it from the browser, as on her phone. */
async function videoVisto(page: Page, id: string) {
  const { video_id } = await leerFila(id)
  await page.addInitScript((clave) => window.localStorage.setItem(clave, "1"), `visto:${video_id}`)
}

// Instagram only, watched to the end: the video is ready to sign.
test("video por aprobar", async ({ page }) => {
  const { video } = await sembrarEscena()
  await videoVisto(page, video)
  await page.goto(`/video/${video}`)
  await capturaDe(page, "video-por-aprobar")
})

// LinkedIn and Instagram: the LinkedIn text leads ("Así sale en LinkedIn") and the caption folds under it.
test("video por aprobar con linkedin", async ({ page }) => {
  const { video } = await sembrarEscena()
  await ajustarPieza(video, { texto_linkedin: TEXTO_LINKEDIN_VALIDO })
  await pool.query("update public.ajustes set destinos_por_defecto = '{instagram,linkedin}'")
  try {
    await videoVisto(page, video)
    await page.goto(`/video/${video}`)
    await expect(page.getByRole("heading", { name: "Así sale en LinkedIn" })).toBeVisible()
    await capturaDe(page, "video-por-aprobar-con-linkedin")
  } finally {
    await pool.query("update public.ajustes set destinos_por_defecto = '{instagram}'")
  }
})

test("video sin terminar", async ({ page }) => {
  const { video } = await sembrarEscena()
  await page.goto(`/video/${video}`)
  await capturaDe(page, "video-sin-terminar")
})

test("video sin terminar letra grande", async ({ page }) => {
  const { video } = await sembrarEscena()
  await page.goto(`/video/${video}`)
  await conLetraGrande(page)
  await capturaDe(page, "video-sin-terminar-letra-grande")
})

/** The scene's script in any state of gate 1, always with its backing, so every state can show its source line. */
async function guionSembrado(estado: "guion_por_aprobar" | "grabando_voz" | "en_render") {
  await vaciarPiezasEIdeas()
  return sembrarPiezaDeEscena(estado, PIEZAS.guion)
}

test("guion sin voz", async ({ page }) => {
  const id = await guionSembrado("guion_por_aprobar")
  // The seed leaves TEXTO_SIN_VOZ on a script without a voice; with no failure the block is the neutral one.
  await ajustarPieza(id, { audio_id: null, explicacion: null })
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Falta preparar tu voz.")).toBeVisible()
  await capturaDe(page, "guion-sin-voz")
})

test("guion con voz", async ({ page }) => {
  const id = await guionSembrado("guion_por_aprobar")
  const fila = await leerFila(id)
  const config = leerConfigProduccion(CONFIG)
  await ajustarPieza(id, {
    audio_id: claveDeToma(id, huellaDelGuion(fila.guion, config.elevenlabs), fila.intento),
    explicacion: null,
  })
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible()
  await capturaDe(page, "guion-con-voz")
})

/** The look already chosen. Only Coni may choose it (a trigger): the seed writes it with the triggers off. */
async function lookElegido(id: string) {
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    await cliente.query("set local session_replication_role = replica")
    await cliente.query("update public.piezas set avatar_id = 'look-a', version = version + 1 where id = $1", [id])
    await cliente.query("commit")
  } finally {
    cliente.release()
  }
}

/** Her voice of this take, already heard to the end, and the look already chosen: gate 1 ready to sign (v6 2). */
async function vozEscuchada(page: Page, id: string) {
  const fila = await leerFila(id)
  const clave = claveDeToma(id, huellaDelGuion(fila.guion, leerConfigProduccion(CONFIG).elevenlabs), fila.intento)
  await ajustarPieza(id, { audio_id: clave, explicacion: null })
  await lookElegido(id)
  await page.addInitScript((visto) => window.localStorage.setItem(visto, "1"), `visto:${clave}`)
}

test("guion escuchada", async ({ page }) => {
  const id = await guionSembrado("guion_por_aprobar")
  await vozEscuchada(page, id)
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("La escuchaste completa")).toBeVisible()
  await capturaDe(page, "guion-escuchada")
})

test("guion escuchada letra grande", async ({ page }) => {
  const id = await guionSembrado("guion_por_aprobar")
  await vozEscuchada(page, id)
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("La escuchaste completa")).toBeVisible()
  await conLetraGrande(page)
  await capturaDe(page, "guion-escuchada-letra-grande")
})

test("guion sin escuchar", async ({ page }) => {
  const id = await guionSembrado("guion_por_aprobar")
  const fila = await leerFila(id)
  await ajustarPieza(id, {
    audio_id: claveDeToma(id, huellaDelGuion(fila.guion, leerConfigProduccion(CONFIG).elevenlabs), fila.intento),
    explicacion: null,
  })
  await lookElegido(id)
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("button", { name: "Escuchar la voz" })).toBeVisible()
  await capturaDe(page, "guion-sin-escuchar")
})

test("guion preparando voz", async ({ page }) => {
  await vaciarPiezasEIdeas()
  // With tone marks, as v6 3 draws them in the script she reads while the voice is made.
  const id = await sembrarPiezaDeEscena("grabando_voz", {
    ...PIEZAS.guion,
    guion: `[warm] ${PIEZAS.guion.guion.replace(". ", ". [pause] ")}`,
  })
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("cálido", { exact: true })).toBeVisible()
  await capturaDe(page, "guion-preparando-voz")
})

test("guion falla voz", async ({ page }) => {
  const id = await guionSembrado("guion_por_aprobar")
  // A provider's reason (v6 7): her words in the block, ElevenLabs folded under "Detalle para WAV".
  await ajustarPieza(id, {
    audio_id: null,
    explicacion: `${TEXTO_SIN_VOZ} ElevenLabs respondió 401: la llave no sirve.`,
  })
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("No pude preparar tu voz.")).toBeVisible()
  await expect(page.getByRole("alert").getByText("Detalle para WAV")).toBeVisible()
  await capturaDe(page, "guion-falla-voz")
})

test("guion sin saldo", async ({ page }) => {
  await configurarServicios({ heygenSaldo: 0 })
  const id = await guionSembrado("guion_por_aprobar")
  await vozEscuchada(page, id)
  await page.goto(`/guion/${id}`)
  // Said twice: at the top, before the steps, and at the sign control.
  await expect(page.getByText("No alcanza el saldo para grabar el video. Avísale a Federico.")).toHaveCount(2)
  await capturaDe(page, "guion-sin-saldo")
})

test("guion firmado ventana", async ({ page }) => {
  const id = await guionSembrado("en_render")
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    await cliente.query("set local session_replication_role = replica")
    await cliente.query("update public.piezas set puerta1_en = now(), explicacion = null where id = $1", [id])
    await cliente.query("commit")
  } finally {
    cliente.release()
  }
  const { version } = await leerFila(id)
  await page.clock.install()
  await page.goto(`/guion/${id}?firmada=${version}`)
  await expect(page.getByText("Firmaste")).toBeVisible()
  // The 8 s window would close before a slow capture ends: the page clock stops, the seconds are masked.
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await capturaDe(page, "guion-firmado-ventana", [page.getByText(/^Grabo tu video en/)])
})

test("guion grabando", async ({ page }) => {
  const id = await guionSembrado("grabando_voz")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "guion-grabando")
})

test("guion error", async ({ page }) => {
  const id = await guionSembrado("en_render")
  await ajustarPieza(id, {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: "HeyGen no pudo terminar el video",
  })
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "guion-error")
})

/**
 * The server reads the real clock, which a test cannot stop: the reels go out on the 7th, 14th and 21st of last month
 * (Santiago noon), so on any run date they are more than a week old, inside the 12 weeks shown and in three weeks that
 * never cross a month (their titles keep one line). A fourth went out an hour ago, without numbers yet: this month is
 * never an empty «0 reels» over a list of measured ones (every day but the first hour of a month). The page then draws
 * the same screen whatever day it runs; only masked labels (month, weeks) move.
 */
test("metricas", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.consultas")
  await pool.query("delete from public.clics_enlace_dia")
  const reels = [
    [PIEZAS.video, 7, 2000, 10],
    [PIEZAS.programado, 14, 2400, 121],
    [PIEZAS.guion, 21, 1000, 12],
  ] as const
  for (const [pieza, diaDelMesPasado, alcance, guardados] of reels) {
    const id = await sembrarPiezaDeEscena("publicado", pieza, { media_id: `media_${pieza.titulo}` })
    const cliente = await pool.connect()
    try {
      await cliente.query("begin")
      await cliente.query("set local session_replication_role = replica")
      await cliente.query(
        `update public.piezas set puerta2_publicar_en = (
           date_trunc('month', now() at time zone 'America/Santiago') - interval '1 month'
           + make_interval(days => $2 - 1, hours => 12)
         ) at time zone 'America/Santiago' where id = $1`,
        [id, diaDelMesPasado],
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
  const deEsteMes = await sembrarPiezaDeEscena("publicado", PIEZAS.enRender, { media_id: "media_de_este_mes" })
  await moverHoraAprobada(deEsteMes, new Date(Date.now() - 3_600_000).toISOString())
  await page.goto("/metricas")
  await expect(page.getByText(/^Este mes: 1 reel en Instagram/)).toBeVisible()
  await capturaDe(page, "metricas")
})

test("metricas con linkedin", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.consultas")
  await pool.query("delete from public.clics_enlace_dia")
  await pool.query("delete from public.metricas_linkedin_cuenta")
  const ambas = await sembrarPiezaDeEscena("publicado", PIEZAS.video, { media_id: "media_v1" })
  await marcarPublicacion(ambas, "linkedin")
  const soloLinkedin = await sembrarPiezaDeEscena("publicado", PIEZAS.programado)
  await quitarPublicacion(soloLinkedin, "instagram")
  await marcarPublicacion(soloLinkedin, "linkedin")
  const aMano = await sembrarPiezaDeEscena("publicado_a_mano", PIEZAS.enRender)
  // The flow approves for tomorrow: an hour ago keeps them in this month and in the window every day but the first hour
  // of a month.
  const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString()
  for (const id of [ambas, soloLinkedin, aMano]) await moverHoraAprobada(id, haceUnaHora)
  await pool.query(
    "insert into public.metricas_reel (pieza_id, dia, alcance, guardados, compartidos, comentarios, tiempo_promedio) values ($1, (now() at time zone 'America/Santiago')::date, 2400, 121, 30, 7, 24400)",
    [ambas],
  )
  await pool.query(
    "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen) values ($1, (now() at time zone 'America/Santiago')::date, 1200, 14, 3, 1, 'manual')",
    [ambas],
  )
  await page.goto("/metricas")
  // Its reel has numbers, still under a week old: the comparison does not say it waits for them.
  await expect(page.getByText(/^Tus reels ya tienen números/)).toBeVisible()
  await capturaDe(page, "metricas-con-linkedin")
})

test("calendario ritmo vacio", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await page.goto("/calendario?vista=ritmo")
  await capturaDe(page, "calendario-ritmo-vacio")
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

test("carrusel por aprobar", async ({ page }) => {
  await sembrarEscena()
  const id = await sembrarCarruselDeEscena("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "carrusel-por-aprobar")
})

test("carrusel firmado", async ({ page }) => {
  await sembrarEscena()
  const id = await sembrarCarruselDeEscena("armando_carrusel")
  await page.goto(`/guion/${id}`)
  await capturaDe(page, "carrusel-firmado")
})
