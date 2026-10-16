import { expect, test } from "@playwright/test"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { publicarPendientes } from "@/lib/publicacion/publicar"
import { pool } from "../integration/db"
import { clienteDeServicio } from "../integration/servicio"
import { leerFila, publicacionesDe, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  bloquearRedExterna,
  capturar,
  configurarServicios,
  deslizarHastaElFinal,
  GUION_VALIDO,
  simularMedios,
  TEXTO_LINKEDIN_VALIDO,
  TEXTO_VALIDO,
} from "./ayudas"

const ETIQUETA = "Desliza para firmar"
const ENLACE_LINKEDIN = "https://www.linkedin.com/posts/coni_abc-123"

async function sinInstagram() {
  await pool.query("delete from vault.secrets where name in ('meta','heygen','elevenlabs','anthropic')")
  await pool.query(
    "update public.ajustes set produccion = '{}'::jsonb, meta_cuenta_id = null, meta_token_expira_en = null",
  )
}

async function videoPorAprobar(textoLinkedin: string | null) {
  const idea = await sembrarIdea({ pilar: "pareja", gancho: "Llevan diez años juntos" })
  return sembrarPieza(
    "video_por_aprobar",
    {
      titulo: "Llevan diez años juntos",
      idea_id: idea,
      guion: GUION_VALIDO,
      texto: TEXTO_VALIDO,
      video_id: "videos/e2e.webm",
    },
    textoLinkedin === null ? {} : { textoLinkedin },
  )
}

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await sinInstagram()
  await configurarServicios()
  await simularMedios(page)
  await pool.query("update public.ajustes set destinos_por_defecto = '{instagram,linkedin}'")
})
test.afterAll(async () => {
  await vaciarPiezasEIdeas()
  await pool.query("update public.ajustes set destinos_por_defecto = '{instagram}'")
})

async function verYAprobar(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Reproducir el video" }).click()
  await expect(page.getByText("Lo viste completo")).toBeVisible({ timeout: 15_000 })
  await page.getByRole("checkbox", { name: /Revisé labios/ }).check()
}

test("she approves for Instagram and LinkedIn, the time comes and she uploads each one on its own", async ({
  page,
}) => {
  const id = await videoPorAprobar(TEXTO_LINKEDIN_VALIDO)
  await page.goto(`/video/${id}`)
  await verYAprobar(page)

  await expect(page.getByRole("checkbox", { name: "Instagram" })).toBeChecked()
  await expect(page.getByRole("checkbox", { name: "LinkedIn" })).toBeChecked()
  await expect(page.getByRole("heading", { name: "Texto para LinkedIn" })).toBeVisible()
  await capturar(page, "video-puerta-2-destinos", { completa: true })
  await deslizarHastaElFinal(page)

  await expect(page.getByText(/^Programado para el /)).toBeVisible()
  expect(await leerFila(id)).toMatchObject({
    estado: "programado",
    puerta2_formula: 2,
    destinos: ["instagram", "linkedin"],
  })
  expect((await publicacionesDe(id)).map((p) => p.estado)).toEqual(["esperando", "esperando"])

  // The approved time passes: only the owner can move it, because the database keeps approvals as she gave them.
  // Whole milliseconds, as the task writes them back: finer would look like a new approval to the database.
  const c = await pool.connect()
  try {
    await c.query("begin")
    await c.query("set local session_replication_role = replica")
    await c.query(
      "update public.piezas set puerta2_publicar_en = date_trunc('milliseconds', now() - interval '20 minutes') where id = $1",
      [id],
    )
    await c.query("commit")
  } finally {
    c.release()
  }
  const avisos = notificadorEnMemoria()
  await publicarPendientes({
    db: clienteDeServicio(),
    almacen: almacenEnMemoria(),
    avisos,
    ahora: () => new Date().toISOString(),
    dormir: async () => undefined,
    sondeo: { cadaMs: 1, veces: 1 },
    sondeoLinkedin: { cadaMs: 1, veces: 1 },
  })
  expect(avisos.aConiEnviados[0]?.mensaje).toContain("lo subas a Instagram y LinkedIn")

  await page.reload()
  await expect(page.getByText("Listo para que lo subas a Instagram y LinkedIn")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Subir a Instagram" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Subir a LinkedIn" })).toBeVisible()
  await capturar(page, "video-para-subir-por-destino", { completa: true })

  const bloque = page.getByRole("heading", { name: "Subir a LinkedIn" }).locator("xpath=ancestor::section")
  await bloque.getByRole("checkbox", { name: "Dejé en el texto que es mi avatar digital" }).check()
  await bloque.getByLabel(/Enlace de la publicación en LinkedIn/).fill(`${ENLACE_LINKEDIN}?utm_source=share`)
  await bloque.getByRole("button", { name: "Ya lo subí a LinkedIn" }).click()

  await expect(page.getByText("Subido a LinkedIn")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Subir a Instagram" })).toBeVisible()
  expect((await leerFila(id)).estado).toBe("para_subir_a_mano")
  expect(await publicacionesDe(id)).toEqual([
    { destino: "instagram", estado: "para_subir", enlace: null },
    { destino: "linkedin", estado: "subido_a_mano", enlace: ENLACE_LINKEDIN },
  ])

  await page.getByRole("checkbox", { name: /Activé la etiqueta/ }).check()
  await page.getByRole("button", { name: "Ya lo subí a Instagram" }).click()
  await expect(page.getByText("Subido a mano")).toBeVisible()
  await expect(page.getByRole("link", { name: "Ver en LinkedIn" })).toHaveAttribute("href", ENLACE_LINKEDIN)
  expect((await leerFila(id)).estado).toBe("publicado_a_mano")
})

test("a piece from before LinkedIn starts its text from the caption and cannot be approved until she saves it", async ({
  page,
}) => {
  const id = await videoPorAprobar(null)
  await page.goto(`/video/${id}`)
  await verYAprobar(page)

  const campo = page.getByLabel("Texto de la publicación en LinkedIn")
  await expect(campo).toHaveValue(/Este video lo narra mi avatar digital/)
  await expect(page.getByText("Guarda el texto para LinkedIn.")).toBeVisible()
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "true")

  await page.getByRole("button", { name: "Guardar el texto para LinkedIn" }).click()
  await expect.poll(async () => (await leerFila(id)).texto_linkedin).not.toBeNull()
})

test("she can approve for Instagram alone even when the LinkedIn text has something to fix", async ({ page }) => {
  const id = await videoPorAprobar("Sin el aviso del avatar.")
  await pool.query("update public.piezas set revision = $2::jsonb, version = version + 1 where id = $1", [
    id,
    JSON.stringify([
      { regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso de LinkedIn.", campo: "linkedin" },
    ]),
  ])
  await page.goto(`/video/${id}`)
  await verYAprobar(page)

  await expect(page.getByText("Hay algo que corregir antes de aprobar.")).toBeVisible()
  await page.getByRole("checkbox", { name: "LinkedIn" }).uncheck()
  await expect(page.getByRole("slider", { name: ETIQUETA })).toHaveAttribute("aria-disabled", "false")
  await deslizarHastaElFinal(page)
  await expect(page.getByText(/^Programado para el /)).toBeVisible()
  expect((await publicacionesDe(id)).map((p) => p.destino)).toEqual(["instagram"])
})

test("Ajustes chooses where reels are published by default and keeps at least one", async ({ page }) => {
  await pool.query("update public.ajustes set destinos_por_defecto = '{instagram}'")
  await page.goto("/ajustes")

  await expect(page.getByRole("heading", { name: "Dónde se publica" })).toBeVisible()
  await expect(page.getByText("A mano", { exact: true })).toBeVisible()
  await page.getByRole("switch", { name: "LinkedIn" }).click()
  await expect
    .poll(
      async () => (await pool.query("select destinos_por_defecto from public.ajustes")).rows[0]?.destinos_por_defecto,
    )
    .toEqual(["instagram", "linkedin"])
  await capturar(page, "ajustes-donde-se-publica", { completa: true })

  await page.getByRole("switch", { name: "Instagram" }).click()
  await page.getByRole("switch", { name: "LinkedIn" }).click()
  await expect(page.getByText("Deja al menos un destino.")).toBeVisible()
  await expect
    .poll(
      async () => (await pool.query("select destinos_por_defecto from public.ajustes")).rows[0]?.destinos_por_defecto,
    )
    .toEqual(["linkedin"])
})

test("the Guion screen shows the LinkedIn text read only, and its findings do not stop gate 1", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "pareja", gancho: "Llevan diez años juntos" })
  const id = await sembrarPieza(
    "guion_por_aprobar",
    { titulo: "Llevan diez años juntos", idea_id: idea, guion: GUION_VALIDO, texto: TEXTO_VALIDO },
    { textoLinkedin: TEXTO_LINKEDIN_VALIDO },
  )
  await pool.query("update public.piezas set revision = $2::jsonb, version = version + 1 where id = $1", [
    id,
    JSON.stringify([
      { regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso de LinkedIn.", campo: "linkedin" },
    ]),
  ])

  await page.goto(`/guion/${id}`)

  const seccion = page.getByRole("region", { name: "Texto para LinkedIn" })
  await expect(seccion.getByText(/Llevan diez años juntos y ya casi no se tocan/)).toBeVisible()
  await expect(seccion.getByText("Lo revisas y editas al aprobar el video.")).toBeVisible()
  await expect(seccion.getByRole("button")).toHaveCount(0)
  await expect(page.getByText("Falta el aviso de LinkedIn.")).toHaveCount(0)
})

test("Inicio says which network a reel waits for, with a LinkedIn item pending", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "pareja", gancho: "Solo en LinkedIn" })
  await sembrarPieza(
    "para_subir_a_mano",
    { titulo: "Solo en LinkedIn", idea_id: idea, guion: GUION_VALIDO, texto: TEXTO_VALIDO },
    { destinos: ["linkedin"], textoLinkedin: TEXTO_LINKEDIN_VALIDO },
  )
  const otraIdea = await sembrarIdea({ pilar: "deseo", gancho: "En las dos redes" })
  await sembrarPieza(
    "para_subir_a_mano",
    { titulo: "En las dos redes", idea_id: otraIdea, guion: GUION_VALIDO, texto: TEXTO_VALIDO },
    { destinos: ["instagram", "linkedin"], textoLinkedin: TEXTO_LINKEDIN_VALIDO },
  )
  await pool.query("delete from public.avisos")

  await page.goto("/")

  const seccion = page.getByRole("region", { name: "Para subir a Instagram y LinkedIn" })
  await expect(seccion.getByRole("link", { name: /Solo en LinkedIn/ })).toContainText("Para subir a LinkedIn")
  await expect(seccion.getByRole("link", { name: /En las dos redes/ })).toContainText(
    "Para subir a Instagram y LinkedIn",
  )
  await capturar(page, "inicio-para-subir-linkedin")
})
