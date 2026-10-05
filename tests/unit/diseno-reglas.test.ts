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

  it("lists the files it scans (sanity: the walk found code)", () => {
    expect(CODIGO.map((ruta) => relative(".", ruta)).length).toBeGreaterThan(50)
  })
})
