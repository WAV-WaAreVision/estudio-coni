// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DemasiadoLargo,
  extraerArticulo,
  extraerDocx,
  extraerPdf,
  extraerTexto,
  MAXIMO_PAGINAS_PDF,
  SinTexto,
} from "@/lib/ingesta/extraer"

const leer = (nombre: string) => new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/ingesta", nombre)))
const leerTexto = (nombre: string) => readFileSync(join(process.cwd(), "tests/fixtures/ingesta", nombre), "utf8")

describe("extraerPdf", () => {
  it("returns one entry per page with its number", async () => {
    const paginas = await extraerPdf(leer("dos-paginas.pdf"))
    expect(paginas).toHaveLength(2)
    expect(paginas[0]).toMatchObject({ pagina: 1 })
    expect(paginas[0]?.texto).toContain("Primera pagina")
    expect(paginas[1]).toMatchObject({ pagina: 2 })
    expect(paginas[1]?.texto).toContain("Segunda pagina")
  })

  it("raises DemasiadoLargo when the PDF has more pages than the cap", async () => {
    await expect(extraerPdf(leer("dos-paginas.pdf"), 1)).rejects.toBeInstanceOf(DemasiadoLargo)
  })

  it("caps PDFs at 300 pages with a reason Coni can read", () => {
    expect(MAXIMO_PAGINAS_PDF).toBe(300)
    expect(new DemasiadoLargo(MAXIMO_PAGINAS_PDF).message).toBe("El PDF tiene más de 300 páginas. Súbelo en partes.")
  })

  it("raises SinTexto when the PDF has no text", async () => {
    await expect(extraerPdf(leer("en-blanco.pdf"))).rejects.toThrow(new SinTexto())
  })
})

describe("extraerDocx", () => {
  it("returns the text without markup and without page", async () => {
    const [unica, ...resto] = await extraerDocx(leer("ejemplo.docx"))
    expect(resto).toHaveLength(0)
    expect(unica?.pagina).toBeNull()
    expect(unica?.texto).toContain("Hola desde Word")
    expect(unica?.texto).toContain("Segundo parrafo")
    expect(unica?.texto).not.toMatch(/[<>]/)
  })

  it("raises SinTexto when the document is empty", async () => {
    await expect(extraerDocx(leer("vacio.docx"))).rejects.toBeInstanceOf(SinTexto)
  })
})

describe("extraerArticulo", () => {
  it("returns title and body without menus, ads or footer", async () => {
    const { titulo, paginas } = await extraerArticulo(leerTexto("articulo.html"), "https://ejemplo.cl/deseo")
    expect(titulo).toBe("El deseo y la rutina")
    expect(paginas).toHaveLength(1)
    expect(paginas[0]?.pagina).toBeNull()
    const texto = paginas[0]?.texto ?? ""
    expect(texto).toContain("fluctúa a lo largo de la vida")
    expect(texto).not.toContain("MENUPRINCIPAL")
    expect(texto).not.toContain("PUBLICIDAD")
    expect(texto).not.toContain("FOOTERLEGAL")
  })

  it("ignores inline scripts in untrusted HTML", async () => {
    const hostil = leerTexto("articulo.html").replace(
      "</body>",
      "<script>document.title='HACKEADO';document.querySelector('article').remove()</script></body>",
    )
    const { titulo, paginas } = await extraerArticulo(hostil, "https://ejemplo.cl/deseo")
    expect(titulo).toBe("El deseo y la rutina")
    expect(paginas[0]?.texto).toContain("fluctúa a lo largo de la vida")
  })

  it("raises SinTexto when the page has no article", async () => {
    await expect(extraerArticulo(leerTexto("sin-articulo.html"), "https://ejemplo.cl/x")).rejects.toBeInstanceOf(
      SinTexto,
    )
  })
})

describe("extraerTexto", () => {
  it("decodes UTF-8 into a single page-less entry", () => {
    const paginas = extraerTexto(leer("nota.txt"))
    expect(paginas).toHaveLength(1)
    expect(paginas[0]?.pagina).toBeNull()
    expect(paginas[0]?.texto).toContain("Ñandú, canción y acción")
  })

  it("raises SinTexto with the es-CL reason when the file is only whitespace", () => {
    expect(() => extraerTexto(new TextEncoder().encode("  \n\t "))).toThrow("No encontré texto en el archivo.")
  })
})
