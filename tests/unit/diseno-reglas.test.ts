// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = join(__dirname, "..", "..")

function archivos(carpeta: string, extensiones: readonly string[]): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(join(RAIZ, carpeta))) {
    const ruta = join(carpeta, nombre)
    if (statSync(join(RAIZ, ruta)).isDirectory()) salida.push(...archivos(ruta, extensiones))
    else if (extensiones.some((ext) => nombre.endsWith(ext))) salida.push(ruta)
  }
  return salida
}

const CODIGO = [...archivos("app", [".tsx", ".ts"]), ...archivos("components", [".tsx", ".ts"])]
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf-8")
const CSS = leer("app/globals.css")

// Files that must carry literal colours because the OS reads them before any CSS (marca.ts feeds them).
const CON_COLOR_LITERAL = new Set(["app/icon.tsx", "app/apple-icon.tsx"])

function luminancia(hex: string): number {
  const canal = (inicio: number) => {
    const c = Number.parseInt(hex.slice(inicio, inicio + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

function contraste(a: string, b: string): number {
  const [mas, menos] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return ((mas ?? 0) + 0.05) / ((menos ?? 0) + 0.05)
}

/** Hue in degrees, 0 to 360. */
function tono(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  if (delta === 0) return 0
  const base = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return (base * 60 + 360) % 360
}

/** The value a token is declared with (the first declaration, :root), following one `var(--x)` alias. */
function valor(nombre: string): string {
  const declarado = new RegExp(`--${nombre}: ([^;]+);`).exec(CSS)?.[1]?.trim() ?? ""
  const alias = /^var\(--([a-z-]+)\)$/.exec(declarado)?.[1]
  return alias ? valor(alias) : declarado
}

describe("design rules", () => {
  it("has no hex colour literal in app/ or components/", () => {
    const culpables = CODIGO.filter((ruta) => !CON_COLOR_LITERAL.has(ruta)).filter((ruta) =>
      /["'`\s(]#[0-9a-fA-F]{3,8}\b/.test(leer(ruta)),
    )
    expect(culpables).toEqual([])
  })

  it("has no em dash in app/ or components/", () => {
    expect(CODIGO.filter((ruta) => leer(ruta).includes("\u2014"))).toEqual([])
  })

  it("keeps 'use client' as the very first line of every client module", () => {
    const culpables = CODIGO.filter((ruta) => leer(ruta).includes('"use client"')).filter(
      (ruta) => !leer(ruta).startsWith('"use client"'),
    )
    expect(culpables).toEqual([])
  })

  it("defines the gris neutro palette of Soft UI v6", () => {
    const paleta = [
      ["piedra", "#ebebea"],
      ["piedra-alta", "#f4f4f3"],
      ["piedra-honda", "#dcdcdb"],
      ["luz", "#fbfbfa"],
      ["tinta", "#262626"],
      ["apagado", "#5a5a59"],
      ["campo", "#727271"],
      ["hilo", "#dcdcdb"],
      ["error", "#b5137a"],
      ["firma", "#a8285a"],
      ["sobre-firma", "#fbfbfa"],
    ] as const
    for (const [token, hex] of paleta) expect(valor(token), token).toBe(hex)
  })

  it("is light only: no dark block and no system colour-scheme switch", () => {
    expect(CSS).toContain("color-scheme: light")
    expect(CSS).not.toContain('data-theme="dark"')
    expect(CSS).not.toContain("prefers-color-scheme")
  })

  it("keeps error apart from the signature, and every text pair at AA on the three stones", () => {
    expect(valor("error")).not.toBe(valor("firma"))
    for (const superficie of ["piedra", "piedra-alta", "piedra-honda"]) {
      for (const tinta of ["tinta", "apagado", "error"]) {
        expect(contraste(valor(tinta), valor(superficie)), `${tinta} on ${superficie}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(contraste(valor("campo"), valor(superficie)), `campo on ${superficie}`).toBeGreaterThanOrEqual(3)
    }
    expect(contraste(valor("luz"), valor("tinta"))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(valor("luz"), valor("firma"))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(valor("firma"), valor("piedra-honda"))).toBeGreaterThanOrEqual(3)
    expect(tono(valor("firma"))).toBeGreaterThanOrEqual(320)
    expect(tono(valor("firma"))).toBeLessThanOrEqual(350)
  })

  it("draws the focus ring in ink, never in the signature", () => {
    expect(CSS).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--tinta\);\s*outline-offset: 2px;/)
    expect(CSS).not.toMatch(/--anillo-foco: [^;]*firma/)
  })

  it("outlines fields and the seek rail with more contrast, and borders them in forced colours (decision 7)", () => {
    const bloque = (consulta: string) => {
      const inicio = CSS.indexOf(`@media (${consulta}) {`)
      return inicio < 0 ? "" : CSS.slice(inicio, CSS.indexOf("\n}\n", inicio))
    }
    for (const consulta of ["prefers-contrast: more", "forced-colors: active"]) {
      const reglas = bloque(consulta)
      expect(reglas, consulta).toMatch(/\.campo\b/)
      expect(reglas, consulta).toContain(".avance::-webkit-slider-runnable-track")
      expect(reglas, consulta).toContain(".avance::-moz-range-track")
    }
  })

  it("sets the type on the iOS body size, only on touch screens, with px spacing", () => {
    expect(CSS).toMatch(/html \{\s*font-size: 106\.25%;/)
    expect(CSS).toMatch(
      /@media \(hover: none\) and \(pointer: coarse\) \{\s*@supports \(font: -apple-system-body\) \{\s*html \{\s*font: -apple-system-body;/,
    )
    expect(CSS).toContain("--spacing: 4px;")
  })

  it("draws icons with Phosphor only, through the SSR entry in server modules", () => {
    expect(CODIGO.filter((ruta) => leer(ruta).includes("lucide-react"))).toEqual([])
    const servidorConIconoCliente = CODIGO.filter(
      (ruta) => !leer(ruta).startsWith('"use client"') && /from "@phosphor-icons\/react"/.test(leer(ruta)),
    )
    expect(servidorConIconoCliente).toEqual([])
  })

  it("uses no token name retired before Calma suiza", () => {
    const viejos =
      /\b(acento|ok-tinta|ok-fondo|aviso-fondo|error-fondo|aviso-tinta|error-tinta|pilar-tinte|pilar-tinta|pilar-punto|font-serif|text-display|text-title|text-script|text-body|text-label|rounded-(sm|md|lg|xl)|ease-fuerte)\b/
    expect(CODIGO.filter((ruta) => viejos.test(leer(ruta)))).toEqual([])
  })

  it("keeps the signature colour to the slider, the wordmark dot and the public page", () => {
    const permitidos = new Set(["components/deslizar-para-aprobar.tsx", "components/ui/wordmark.tsx", "app/l/page.tsx"])
    const culpables = CODIGO.filter(
      (ruta) => /\b(text|bg|fill|border|ring|outline)-firma\b/.test(leer(ruta)) && !permitidos.has(ruta),
    )
    expect(culpables).toEqual([])
  })

  it("sizes every Phosphor icon in em through ICONO, never in px", () => {
    expect(CODIGO.filter((ruta) => /\bsize=\{\d+\}/.test(leer(ruta)))).toEqual([])
  })

  it("lists the files it scans (sanity: the walk found code)", () => {
    expect(CODIGO.map((ruta) => relative(".", ruta)).length).toBeGreaterThan(50)
  })
})
