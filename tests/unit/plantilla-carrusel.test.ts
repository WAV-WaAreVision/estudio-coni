import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fuenteDelCarrusel } from "@/lib/carrusel/fuente"
import { escapar, htmlDelCarrusel, marcaDelCarrusel, textoConDestacado } from "@/lib/carrusel/plantilla/plantilla"
import { tamanoDeLetra } from "@/lib/carrusel/plantilla/tipografia"
import { COLORES } from "@/lib/carrusel/plantilla/variantes"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"

const ENTRADA = {
  laminas: LAMINAS_DE_PRUEBA,
  variante: "crema",
  marca: "Constanza del Rosario · IA",
  fuente: "data:font/ttf;base64,AAAA",
} as const

describe("the carousel template", () => {
  it("draws one 1080 x 1350 section per slide, with the brand line and the counter", () => {
    const html = htmlDelCarrusel(ENTRADA)
    expect(html.match(/data-lamina=/g)).toHaveLength(6)
    expect(html).toContain("Constanza del Rosario · IA")
    expect(html).toContain("1 / 6")
    expect(html).toContain("6 / 6")
    expect(html).toContain("width: 1080px")
    expect(html).toContain("height: 1350px")
    expect(html).toContain("Desliza para leer")
    expect(html).toContain("Fuente: Stanford Medicine")
  })

  it("embeds the font and fetches nothing", () => {
    const html = htmlDelCarrusel(ENTRADA)
    expect(html).toContain('src: url("data:font/ttf;base64,AAAA")')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it("sets the variant's own colours", () => {
    const oscura = htmlDelCarrusel({ ...ENTRADA, variante: "oscura" })
    expect(oscura).toContain(`--papel: ${COLORES.oscura.papel}`)
    expect(oscura).toContain(`--acento: ${COLORES.oscura.acento}`)
  })

  it("escapes the text and highlights the first whole-word match only", () => {
    expect(escapar(`<b>"a" & 'b'</b>`)).toBe("&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;")
    expect(textoConDestacado("Tu voz, tu voz.", "voz")).toBe('Tu <span class="destacado">voz</span>, tu voz.')
    expect(textoConDestacado("Vozarrón y voz", "voz")).toBe('Vozarrón y <span class="destacado">voz</span>')
    expect(textoConDestacado("Sin <b>", undefined)).toBe("Sin &lt;b&gt;")
  })

  it("names the pillar only when there is one", () => {
    expect(marcaDelCarrusel("Pareja")).toBe("Constanza del Rosario · Pareja")
    expect(marcaDelCarrusel(null)).toBe("Constanza del Rosario")
  })

  it("sizes the letter by type and length, never by measuring", () => {
    expect(tamanoDeLetra({ tipo: "portada", texto: "x".repeat(40) })).toBe(104)
    expect(tamanoDeLetra({ tipo: "portada", texto: "x".repeat(90) })).toBe(76)
    expect(tamanoDeLetra({ tipo: "idea", texto: "x".repeat(90) })).toBe(72)
    expect(tamanoDeLetra({ tipo: "idea", texto: "x".repeat(220) })).toBe(52)
    expect(tamanoDeLetra({ tipo: "cierre", texto: "x".repeat(140) })).toBe(54)
  })
})

describe("fuenteDelCarrusel", () => {
  it("reads the committed serif as a data URL", async () => {
    const fuente = await fuenteDelCarrusel(join(process.cwd(), "assets/fuentes"))
    expect(fuente.startsWith("data:font/ttf;base64,")).toBe(true)
    expect(fuente.length).toBeGreaterThan(100_000)
  })

  it("says which file is missing as a configuration error", async () => {
    await expect(fuenteDelCarrusel("/no/existe")).rejects.toThrow(FallaDeConfiguracion)
  })
})
