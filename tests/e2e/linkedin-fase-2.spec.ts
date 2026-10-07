import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { ajustarPieza, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  bloquearRedExterna,
  configurarServicios,
  GUION_VALIDO,
  simularMedios,
  TEXTO_LINKEDIN_VALIDO,
  TEXTO_VALIDO,
} from "./ayudas"

const ENLACE = "https://www.linkedin.com/feed/update/urn:li:share:7123456789/"
const SOLO_LINKEDIN = { destinos: ["linkedin"] as const, textoLinkedin: TEXTO_LINKEDIN_VALIDO }

/** The Cuentas section on its own: the fixed tab bar would otherwise cover the middle of a full-page capture. */
async function capturarCuentas(page: import("@playwright/test").Page, nombre: string) {
  await page.addStyleTag({ content: "nav { display: none !important }" })
  const carpeta = process.env.CAPTURAS_E2E ?? "test-results/capturas"
  await mkdir(carpeta, { recursive: true })
  await page.locator("ul:has(#cuenta-linkedin)").screenshot({ path: join(carpeta, `${nombre}.png`) })
}

async function desconectarLinkedin() {
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
}

/** Connected with a token that lasts 9 days and a half, which Coni reads as "Vence en 10 días". */
async function conectarLinkedin() {
  await desconectarLinkedin()
  await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
  await pool.query(
    "update public.ajustes set linkedin_miembro = 'urn:li:person:abc123XYZ', linkedin_nombre = 'Coni del Rosario', linkedin_conectado_en = now(), linkedin_token_expira_en = now() + interval '9 days 12 hours'",
  )
}

async function piezaDeLinkedin(estado: "programado" | "para_subir_a_mano" | "publicado") {
  const idea = await sembrarIdea({ pilar: "pareja", gancho: "Llevan diez años juntos" })
  return sembrarPieza(
    estado,
    {
      titulo: "Llevan diez años juntos",
      idea_id: idea,
      guion: GUION_VALIDO,
      texto: TEXTO_VALIDO,
      video_id: "videos/e2e.webm",
    },
    SOLO_LINKEDIN,
  )
}

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await configurarServicios()
  await simularMedios(page)
  await desconectarLinkedin()
})
test.afterAll(async () => {
  await vaciarPiezasEIdeas()
  await desconectarLinkedin()
})

test("Cuentas conectadas offers to connect LinkedIn while it goes by hand, with a plain link to the connection route", async ({
  page,
}) => {
  await page.goto("/ajustes/cuentas")

  const fila = page.locator("#cuenta-linkedin")
  await expect(fila.getByText("A mano", { exact: true })).toBeVisible()
  await expect(fila.getByRole("link", { name: "Conectar LinkedIn" })).toHaveAttribute("href", "/api/linkedin/conectar")
  await expect(fila.getByRole("button", { name: "Desconectar" })).toHaveCount(0)
  await capturarCuentas(page, "cuentas-linkedin-desconectado")
})

test("a connected LinkedIn shows who it publishes as and when it expires, can be renewed, and disconnects after asking", async ({
  page,
}) => {
  await conectarLinkedin()
  await page.goto("/ajustes/cuentas")

  const fila = page.locator("#cuenta-linkedin")
  await expect(fila.getByText("Publica como Coni del Rosario")).toBeVisible()
  await expect(fila.getByText("Vence en 10 días")).toBeVisible()
  await expect(fila.getByRole("link", { name: "Renovar LinkedIn" })).toHaveAttribute("href", "/api/linkedin/conectar")
  await capturarCuentas(page, "cuentas-linkedin-conectado")

  await fila.getByRole("button", { name: "Desconectar" }).click()
  await expect(page.getByText(/¿Desconectar LinkedIn\? Tus videos dejarán de salir solos ahí/)).toBeVisible()
  await page.getByRole("button", { name: "Desconectar", exact: true }).click()

  await expect(page.getByText(/LinkedIn quedó desconectado\./)).toBeVisible()
  expect((await pool.query("select linkedin_miembro from public.ajustes")).rows[0]).toEqual({ linkedin_miembro: null })
  expect((await pool.query("select count(*)::int as n from vault.secrets where name = 'linkedin'")).rows[0].n).toBe(0)
})

test("the video screen says LinkedIn goes out by itself and offers no manual upload before the time", async ({
  page,
}) => {
  await conectarLinkedin()
  const id = await piezaDeLinkedin("programado")
  await page.goto(`/video/${id}`)

  await expect(page.getByText("LinkedIn sale solo a la hora aprobada.")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Subir a LinkedIn" })).toHaveCount(0)
})

test("the video screen gives the reason above the manual steps when LinkedIn fell back", async ({ page }) => {
  const id = await piezaDeLinkedin("para_subir_a_mano")
  await pool.query(
    "update public.publicaciones set explicacion = 'LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando.' where pieza_id = $1 and destino = 'linkedin'",
    [id],
  )
  await page.goto(`/video/${id}`)

  await expect(page.getByRole("heading", { name: "Subir a LinkedIn" })).toBeVisible()
  await expect(page.getByText(/LinkedIn no aceptó la publicación, así que te la dejé/)).toBeVisible()
})

test("the video screen closes a LinkedIn post that went out by itself with its link", async ({ page }) => {
  const id = await piezaDeLinkedin("publicado")
  await pool.query(
    "update public.publicaciones set estado = 'publicado', post_urn = 'urn:li:share:7123456789', enlace = $2, enviado_en = now(), video_urn = 'urn:li:video:C1' where pieza_id = $1 and destino = 'linkedin'",
    [id, ENLACE],
  )
  await ajustarPieza(id, {})
  await page.goto(`/video/${id}`)

  await expect(page.getByText("Ya se publicó")).toBeVisible()
  await expect(page.getByText("Salió en LinkedIn.")).toBeVisible()
  await expect(page.getByRole("link", { name: /Ver en LinkedIn/ })).toHaveAttribute("href", ENLACE)
})
