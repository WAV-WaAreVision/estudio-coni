// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = join(__dirname, "..", "..")
const CARPETAS = ["lib", "app", "components", "trigger", "scripts"]
const IGNORADOS = new Set(["lib/supabase/database.types.ts"])
const SLUGS = [
  "pareja",
  "deseo",
  "autoestima",
  "limites",
  "bienestar",
  "ia-salud-mental",
  "practica-clinica",
  "etica-regulacion",
  "acceso-salud-publica",
  "caso-coni",
]
const ALTERNATIVAS = SLUGS.join("|")
const NUEVOS = SLUGS.filter((slug) => slug.includes("-")).join("|")
// A quoted slug ("pareja", 'caso-coni', `deseo`) or an object key (pareja: ..., "caso-coni": ...).
const LITERAL = new RegExp(`(["'\`])(?:${ALTERNATIVAS})\\1|(?:^|[\\s{,])(?:${ALTERNATIVAS})\\s*:`)
// Property access: NOMBRES.pareja, idea?.deseo.
const PROPIEDAD = new RegExp(`\\.(?:${ALTERNATIVAS})(?![\\w-])`)
const CADENA = /(["'`])((?:\\.|(?!\1).)*)\1/g
// Inside a longer literal: a hyphenated slug anywhere (it is never prose), and an old one only next to code
// punctuation ('deseo' in SQL, pilar=deseo, pilar.eq.deseo), so Spanish copy that says "deseo" is not flagged.
const DENTRO = new RegExp(
  `(?<![\\w-])(?:${NUEVOS})(?![\\w-])|(?<=['"=:.(\\[{/])(?:${ALTERNATIVAS})(?![\\w-])|(?<![\\w-])(?:${ALTERNATIVAS})(?=['"=:)\\]}/])`,
)

function nombraUnSlug(linea: string): boolean {
  if (LITERAL.test(linea) || PROPIEDAD.test(linea)) return true
  return [...linea.matchAll(CADENA)].some(([, , contenido = ""]) => DENTRO.test(contenido))
}

function archivos(carpeta: string): string[] {
  return readdirSync(join(RAIZ, carpeta), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => relative(RAIZ, join(e.parentPath, e.name)))
    .filter((ruta) => !IGNORADOS.has(ruta))
}

describe("el detector de slugs", () => {
  it.each([
    ['const nombre = "pareja"'],
    ["{ caso-coni: 1 }"],
    ["const n = NOMBRES.pareja"],
    ["idea?.deseo ?? null"],
    ['db.from("ideas").or("pilar.eq.limites")'],
    ["`select * from ideas where pilar = 'bienestar'`"],
    ['"/ideas?pilar=autoestima"'],
    ['"Pilar: caso-coni"'],
    ["texto(`caso-coni y más`)"],
  ])("catches %s", (linea) => {
    expect(nombraUnSlug(linea)).toBe(true)
  })

  it.each([
    ['placeholder="culpa, celos, deseo"'],
    ['// "ponerle una etiqueta a tu pareja" is about labels'],
    ["const deseoso = parejas.length"],
  ])("leaves prose and other words alone: %s", (linea) => {
    expect(nombraUnSlug(linea)).toBe(false)
  })
})

describe("pilares como datos", () => {
  it("no code names a pillar slug: pillars come from categorias", () => {
    const hallazgos = CARPETAS.flatMap(archivos).flatMap((ruta) =>
      readFileSync(join(RAIZ, ruta), "utf-8")
        .split("\n")
        .flatMap((linea, i) => (nombraUnSlug(linea) ? [`${ruta}:${i + 1}: ${linea.trim()}`] : [])),
    )
    expect(hallazgos).toEqual([])
  })
})
