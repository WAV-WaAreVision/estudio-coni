import { readFileSync } from "node:fs"
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
 * 390 px captures of every screen, light only, for two jobs: the one-time review sheet against the mockups
 * (`pnpm comparar`) and, once Federico approves that sheet, the baselines every later run diffs against.
 * Pending that approval the spec is off unless VISUAL_BASELINES is set, so a plain `pnpm test:e2e` stays green.
 * When he approves: delete the skip below, run once with --update-snapshots, commit the snapshots.
 */
test.skip(!process.env.VISUAL_BASELINES, "Visual baselines wait for Federico to approve the comparison sheet.")

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

async function capturaDe(page: Page, nombre: string) {
  // Ajustes streams its status block and its accounts behind Suspense: wait until the skeletons are gone.
  await page.waitForLoadState("networkidle")
  await expect(page.locator("output[aria-label^='Revisando']")).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  // Device scale (1170 px wide, like the mockup boards) while the sheet is reviewed; css scale can replace it for the baselines.
  await expect(page).toHaveScreenshot(`${nombre}.png`, { fullPage: true, scale: "device" })
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
    const id = await sembrarPieza("publicado", { titulo, idea_id: idea })
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
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })
  const page = await contexto.newPage()
  await page.goto("/ingreso")
  await capturaDe(page, "ingreso")
  await contexto.close()
})
