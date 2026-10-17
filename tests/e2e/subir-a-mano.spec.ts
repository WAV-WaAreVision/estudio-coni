import { expect, test } from "@playwright/test"
import coniConfig from "../fixtures/coni.config.json"
import { CONI, pool } from "../integration/db"
import { leerFila, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, capturar, configurarServicios, entrarComo, GUION_VALIDO, TEXTO_VALIDO } from "./ayudas"
import { CORREO_DEL_MANTENEDOR } from "./entorno"

const ENLACE = "https://www.instagram.com/reel/DAbc123xyz/"

async function sinInstagram() {
  await pool.query("delete from vault.secrets where name in ('meta','heygen','elevenlabs','anthropic')")
  await pool.query("update public.ajustes set produccion = '{}'::jsonb")
  await pool.query("update public.ajustes set meta_cuenta_id = null, meta_token_expira_en = null")
}

/** A piece whose approved time passed 20 minutes ago: the database only lets Coni write an approval, so the time is moved as the owner. */
async function paraSubir(
  estado: "para_subir_a_mano" | "publicado_a_mano" = "para_subir_a_mano",
  titulo = "Ser tu propia diosa",
) {
  const idea = await sembrarIdea({ pilar: "etica-regulacion", gancho: titulo })
  const id = await sembrarPieza(estado, { titulo, idea_id: idea, guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    await cliente.query("set local session_replication_role = replica")
    await cliente.query("update public.piezas set puerta2_publicar_en = now() - interval '20 minutes' where id = $1", [
      id,
    ])
    await cliente.query("commit")
  } finally {
    cliente.release()
  }
  return id
}

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await sinInstagram()
  await configurarServicios()
})
test.afterAll(async () => {
  await vaciarPiezasEIdeas()
  await sinInstagram()
})

test("she downloads the video, copies the text, confirms the AI label and marks the reel as uploaded", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const id = await paraSubir()
  const pedidos: string[] = []
  await page.route("https://almacen.test/**", async (ruta) => {
    pedidos.push(ruta.request().url())
    await ruta.fulfill({
      status: 200,
      contentType: "video/mp4",
      headers: { "content-disposition": 'attachment; filename="reel.mp4"' },
      body: "video",
    })
  })

  await page.goto(`/video/${id}`)

  await expect(page.getByText("Listo para que lo subas a Instagram")).toBeVisible()
  await expect(page.getByText(/El deseo no se apaga/).first()).toBeVisible()
  await capturar(page, "video-para-subir", { completa: true })

  const descarga = page.waitForEvent("download")
  await page.getByRole("button", { name: "Descargar video" }).click()
  expect((await descarga).suggestedFilename()).toBe("reel.mp4")
  expect(pedidos).toHaveLength(1)
  expect(pedidos[0]).toContain("expira=600")
  expect(pedidos[0]).toContain(`descarga=reel-${id.slice(0, 8)}.mp4`)

  await page.getByRole("button", { name: "Copiar texto" }).click()
  await expect(page.getByText("Texto copiado")).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(TEXTO_VALIDO)

  const listo = page.getByRole("button", { name: "Ya lo subí a Instagram" })
  await expect(listo).toHaveAttribute("aria-disabled", "true")
  await page.getByRole("checkbox", { name: /Activé la etiqueta/ }).check()
  await page.getByLabel(/Enlace del reel/).fill(`${ENLACE}?igsh=MTIzNDU2`)
  await listo.click()

  await expect(page.getByText("Subido a mano")).toBeVisible()
  await expect(page.getByRole("link", { name: "Ver en Instagram" })).toHaveAttribute("href", ENLACE)
  await capturar(page, "video-subido-a-mano")
  const fila = await leerFila(id)
  expect(fila).toMatchObject({ estado: "publicado_a_mano", permalink: ENLACE })
  const { rows } = await pool.query(
    "select actor_usuario, actor_rol from public.eventos where pieza_id = $1 and tabla = 'piezas' order by id desc limit 1",
    [id],
  )
  expect(rows[0]).toEqual({ actor_usuario: CONI, actor_rol: "authenticated" })
})

test("a link that is not Instagram's is refused and the reel stays waiting", async ({ page }) => {
  const id = await paraSubir()
  await page.goto(`/video/${id}`)

  await page.getByRole("checkbox", { name: /Activé la etiqueta/ }).check()
  await page.getByLabel(/Enlace del reel/).fill("https://malo.example/reel/abc")
  await page.getByRole("button", { name: "Ya lo subí a Instagram" }).click()

  await expect(page.getByRole("alert").filter({ hasText: "Ese enlace no parece de Instagram" })).toBeVisible()
  expect((await leerFila(id)).estado).toBe("para_subir_a_mano")
})

test("while Instagram is not connected a scheduled reel already offers the tools", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "etica-regulacion", gancho: "Programada" })
  const id = await sembrarPieza("programado", { titulo: "Programada", idea_id: idea, texto: TEXTO_VALIDO })

  await page.goto(`/video/${id}`)

  await expect(page.getByText(/Instagram todavía no está conectado, así que este reel no sale solo/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Descargar video" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Cambiar la fecha" })).toBeVisible()
})

test("with Instagram connected a scheduled reel shows no manual tools", async ({ page }) => {
  await pool.query("update public.ajustes set meta_cuenta_id = '17841400000000000'")
  const idea = await sembrarIdea({ pilar: "etica-regulacion", gancho: "Programada" })
  const id = await sembrarPieza("programado", { titulo: "Programada", idea_id: idea, texto: TEXTO_VALIDO })

  await page.goto(`/video/${id}`)

  await expect(page.getByText(/Sale con la etiqueta de IA/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Descargar video" })).toHaveCount(0)
})

test("Inicio and the calendar say clearly what waits to be uploaded and what she already uploaded", async ({
  page,
}) => {
  const espera = await paraSubir("para_subir_a_mano", "Para subir hoy")
  await paraSubir("publicado_a_mano", "Ya la subí")

  await page.goto("/")
  const seccion = page.getByRole("region", { name: "Para subir a Instagram" })
  await expect(seccion.getByRole("link", { name: /Para subir hoy/ })).toHaveAttribute("href", `/video/${espera}`)
  await expect(page.getByText(/Ya la subí: subido a mano/)).toBeVisible()
  await expect(page.getByText("Nada espera tu firma esta semana.")).toBeVisible()

  await page.goto("/calendario")
  await expect(page.getByRole("region", { name: "Para subir" }).getByText(/Para subir hoy/)).toBeVisible()
  await expect(page.getByText("Nada programado este mes.")).toHaveCount(0)
  await capturar(page, "calendario-para-subir", { completa: true })

  await page.goto("/calendario?vista=agenda")
  await expect(page.getByText("Para subir a Instagram", { exact: true })).toBeVisible()
  await expect(page.getByText("Subido a mano", { exact: true })).toBeVisible()
  await capturar(page, "calendario-agenda-a-mano", { completa: true })
})

test("Ajustes says Instagram is not connected, offers to connect it and tells what happens meanwhile", async ({
  page,
}) => {
  for (const nombre of ["heygen", "elevenlabs", "anthropic"]) {
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(coniConfig)])

  await page.goto("/ajustes")

  await expect(page.getByRole("heading", { name: "Configuración: 3 de 5 listos" })).toBeVisible()
  await expect(
    page.getByText("Instagram no está conectado. Mientras tanto, cada reel espera a que lo subas tú a mano."),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Conectar Instagram" }).first()).toHaveAttribute(
    "href",
    "/api/meta/conectar",
  )
  await capturar(page, "ajustes-sin-instagram")
})

test("the maintainer cannot open a reel waiting to be uploaded", async ({ browser }) => {
  const id = await paraSubir()
  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const page = await contexto.newPage()

  await page.goto(`/video/${id}`)

  await expect(page.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
  await expect(page.getByRole("button", { name: "Ya lo subí a Instagram" })).toHaveCount(0)
  await contexto.close()
})
