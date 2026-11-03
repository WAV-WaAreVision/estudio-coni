import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { alerta, bloquearRedExterna, disparosDeMateriales, limpiarDisparos, tocarHastaLlegar } from "./ayudas"
import { AUTORA, CREDENCIAL, objetosDelAlmacen, sembrarBiblioteca } from "./biblioteca-escena"
import { BALDE_DE_PRUEBA } from "./entorno"

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
const PNG = readFileSync(join(__dirname, "fixtures", "avatar-a.png"))
/** Three PNGs of three sizes, so the store tells which one landed at each position. */
const png = (nombre: string, extra: number) => ({
  name: nombre,
  mimeType: "image/png",
  buffer: Buffer.concat([PNG, Buffer.alloc(extra)]),
})

interface Material {
  id: string
  tipo: string
  estado: string
  rol: string
  archivo_clave: string | null
  origen_url: string | null
  texto_pegado: string | null
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarBiblioteca()
  limpiarDisparos()
})

/** Through the real "Elegir archivo" button: the native input is hidden (4d). */
async function elegirArchivos(
  page: Page,
  boton: string,
  archivos: { name: string; mimeType: string; buffer: Buffer }[],
) {
  const selector = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: boton }).click()
  await (await selector).setFiles(archivos)
}

async function completar(page: Page, titulo: string, rol: string) {
  await page.getByLabel(/^Título/).fill(titulo)
  await page.getByLabel("Autor", { exact: true }).fill("Daniela")
  await page.getByRole("button", { name: `${AUTORA}, ${CREDENCIAL}` }).click()
  await page.getByRole("radio", { name: rol }).check()
  await page.getByRole("checkbox", { name: "Este material no contiene datos de pacientes" }).check()
}

const subir = (page: Page) => page.getByRole("button", { name: "Subir", exact: true }).click()

async function materialesCon(titulo: string): Promise<Material[]> {
  const { rows } = await pool.query<Material>(
    "select id, tipo, estado, rol, archivo_clave, origen_url, texto_pegado from public.materiales where titulo = $1",
    [titulo],
  )
  return rows
}

async function unicoCon(titulo: string): Promise<Material> {
  const [material, ...otros] = await materialesCon(titulo)
  if (!material || otros.length > 0) throw new Error(`Se esperaba un material «${titulo}»`)
  return material
}

test("Coni uploads a PDF from the Biblioteca: it goes straight to the store and the list says it is being processed", async ({
  page,
}) => {
  const titulo = "Apego adulto en la consulta"
  await page.goto("/biblioteca")
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Subir", exact: true }), /\/biblioteca\/subir$/)
  await expect(page.getByRole("heading", { name: "Subir material", level: 1 })).toBeVisible()

  await elegirArchivos(page, "Elegir archivo", [{ name: "apego.pdf", mimeType: "application/pdf", buffer: PDF }])
  await expect(page.getByRole("list", { name: "Archivos elegidos" })).toContainText("apego.pdf")
  await expect(page.getByText("Tipo: Documento")).toBeVisible()
  await completar(page, titulo, "Estudio o libro")
  await subir(page)

  await expect(page).toHaveURL(/\/biblioteca\?subido=1$/)
  await expect(page.getByText("Lo estoy procesando.")).toBeVisible()
  const tarjeta = page.getByRole("list", { name: "Materiales" }).getByRole("listitem").filter({ hasText: titulo })
  await expect(tarjeta).toContainText("Procesando")

  const material = await unicoCon(titulo)
  expect(material).toMatchObject({ tipo: "documento", estado: "procesando", rol: "evidencia" })
  expect(material.archivo_clave).toBe(`materiales/${material.id}/original.pdf`)
  expect((await objetosDelAlmacen())[`/${BALDE_DE_PRUEBA}/${material.archivo_clave}`]).toEqual({
    bytes: PDF.byteLength,
    tipo: "application/pdf",
    firmada: true,
  })
  expect(disparosDeMateriales()).toEqual([
    { tarea: "procesar-material", materialId: material.id, clave: `procesar-material:${material.id}` },
  ])
})

test("a YouTube link asks for its transcript, keeps it with the address and starts the run", async ({ page }) => {
  const titulo = "Carga mental en video"
  const url = "https://www.youtube.com/watch?v=abc123"
  await page.goto("/biblioteca/subir")
  await page.getByLabel("Pega un enlace o elige un archivo").fill(url)
  await expect(page.getByText("Tipo: Video de YouTube")).toBeVisible()
  await expect(page.getByText(/Mostrar transcripción/)).toBeVisible()
  await completar(page, titulo, "Referente")

  await subir(page)
  await expect(alerta(page, "Pega la transcripción del video.")).toBeVisible()
  expect(await materialesCon(titulo)).toEqual([])

  await page.getByLabel("Transcripción del video").fill("Hoy hablamos de la carga mental.")
  await subir(page)

  await expect(page).toHaveURL(/\/biblioteca\?subido=1$/)
  const material = await unicoCon(titulo)
  expect(material).toMatchObject({
    tipo: "link",
    origen_url: url,
    texto_pegado: "Hoy hablamos de la carga mental.",
    archivo_clave: null,
  })
  expect(disparosDeMateriales()).toEqual([
    { tarea: "procesar-material", materialId: material.id, clave: `procesar-material:${material.id}` },
  ])
})

test("three images keep the order she gives them, in the database and in the store", async ({ page }) => {
  const titulo = "Carrusel de pausas activas"
  await page.goto("/biblioteca/subir")
  await elegirArchivos(page, "Elegir archivo", [png("uno.png", 1), png("dos.png", 2), png("tres.png", 3)])
  await expect(page.getByText("Tipo: 3 imágenes")).toBeVisible()
  const lista = page.getByRole("list", { name: "Imágenes en orden" })
  await expect(lista.getByRole("listitem")).toHaveCount(3)

  await page.getByRole("button", { name: "Mover la imagen 3 antes" }).click()
  await expect(lista.getByRole("listitem").nth(1)).toHaveAttribute("data-nombre", "tres.png")
  await page.getByLabel("Link de referencia (no se abre)").fill("https://instagram.com/p/abc")
  await completar(page, titulo, "Referente")
  await subir(page)

  await expect(page).toHaveURL(/\/biblioteca\?subido=1$/)
  const material = await unicoCon(titulo)
  expect(material).toMatchObject({ tipo: "imagen", origen_url: "https://instagram.com/p/abc" })
  const { rows } = await pool.query<{ orden: number; archivo_clave: string }>(
    "select orden, archivo_clave from public.materiales_archivos where material_id = $1 order by orden",
    [material.id],
  )
  expect(rows.map((fila) => fila.orden)).toEqual([1, 2, 3])
  expect(material.archivo_clave).toBe(rows[0]?.archivo_clave)
  const objetos = await objetosDelAlmacen()
  expect(rows.map((fila) => objetos[`/${BALDE_DE_PRUEBA}/${fila.archivo_clave}`])).toEqual([
    { bytes: PNG.byteLength + 1, tipo: "image/png", firmada: true },
    { bytes: PNG.byteLength + 3, tipo: "image/png", firmada: true },
    { bytes: PNG.byteLength + 2, tipo: "image/png", firmada: true },
  ])
  expect(disparosDeMateriales()).toHaveLength(1)
})
