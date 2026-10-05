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

describe("design rules", () => {
  it("has no hex colour literal in app/ or components/", () => {
    const culpables = CODIGO.filter((ruta) => !CON_COLOR_LITERAL.has(ruta)).filter((ruta) =>
      /["'`\s(]#[0-9a-fA-F]{3,8}\b/.test(leer(ruta)),
    )
    expect(culpables).toEqual([])
  })

  it("has no em dash in app/ or components/", () => {
    const culpables = CODIGO.filter((ruta) => leer(ruta).includes("—"))
    expect(culpables).toEqual([])
  })

  it("keeps 'use client' as the very first line of every client module", () => {
    const culpables = CODIGO.filter((ruta) => leer(ruta).includes('"use client"')).filter(
      (ruta) => !leer(ruta).startsWith('"use client"'),
    )
    expect(culpables).toEqual([])
  })

  it("defines every Calma suiza token in globals.css", () => {
    const css = leer("app/globals.css")
    for (const token of [
      "--fondo: #f7f6f3",
      "--tinta: #1d1b18",
      "--firma: #a8285a",
      "--campo: #8a847b",
      "--pista: #ebe8e2",
    ]) {
      expect(css).toContain(token)
    }
  })

  it("keeps the dark tokens but never switches to them by itself (light only for now)", () => {
    const css = leer("app/globals.css")
    expect(css).toContain(':root[data-theme="dark"]')
    expect(css).not.toContain("prefers-color-scheme")
  })

  it("draws icons with Phosphor only, through the SSR entry in server modules", () => {
    expect(CODIGO.filter((ruta) => leer(ruta).includes("lucide-react"))).toEqual([])
    const servidorConIconoCliente = CODIGO.filter(
      (ruta) => !leer(ruta).startsWith('"use client"') && /from "@phosphor-icons\/react"/.test(leer(ruta)),
    )
    expect(servidorConIconoCliente).toEqual([])
  })

  it("uses only Calma suiza token names", () => {
    const viejos =
      /\b(acento|hundido|ok-tinta|ok-fondo|aviso-fondo|error-fondo|aviso-tinta|error-tinta|pilar-tinte|pilar-tinta|pilar-punto|font-serif|text-display|text-title|text-script|text-body|text-label|rounded-(sm|md|lg|xl)|ease-fuerte)\b/
    expect(CODIGO.filter((ruta) => viejos.test(leer(ruta)))).toEqual([])
  })

  it("draws errors in the brand magenta, as a token of their own that passes AA on every surface", () => {
    const css = leer("app/globals.css")
    const raiz = css.slice(0, css.indexOf('/* ---------- Dark'))
    const valor = (nombre: string) => new RegExp(`--${nombre}: (#[0-9a-f]{6})`).exec(raiz)?.[1] ?? ""
    const error = valor("error")
    expect(error).not.toBe("")
    // Its own value, not an alias of the signature: the slider and the error can drift apart.
    expect(raiz).not.toMatch(/--error: var\(--firma\)/)
    expect(tono(error)).toBeGreaterThanOrEqual(320)
    expect(tono(error)).toBeLessThanOrEqual(350)
    for (const superficie of ["fondo", "superficie", "pista"]) {
      expect(contraste(error, valor(superficie)), `error on ${superficie}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps the signature colour to the slider, the committed date, the wordmark dot and the public page", () => {
    const permitidos = new Set([
      "components/deslizar-para-aprobar.tsx",
      "app/(app)/guion/[id]/pantalla-guion.tsx",
      "components/ui/wordmark.tsx",
      "app/l/page.tsx",
    ])
    const culpables = CODIGO.filter(
      (ruta) => /\b(text|bg|fill|border|ring)-firma\b/.test(leer(ruta)) && !permitidos.has(ruta),
    )
    expect(culpables).toEqual([])
  })

  it("lists the files it scans (sanity: the walk found code)", () => {
    expect(CODIGO.map((ruta) => relative(".", ruta)).length).toBeGreaterThan(50)
  })
})
