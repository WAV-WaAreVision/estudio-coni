// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const RAIZ = join(__dirname, "..", "..")
const CARPETAS = ["lib", "app", "components", "trigger"]
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
// A quoted slug ("pareja", 'caso-coni', `deseo`) or an object key (pareja: ..., "caso-coni": ...).
const LITERAL = new RegExp(`(["'\`])(?:${ALTERNATIVAS})\\1|(?:^|[\\s{,])(?:${ALTERNATIVAS})\\s*:`)

function archivos(carpeta: string): string[] {
  return readdirSync(join(RAIZ, carpeta), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => relative(RAIZ, join(e.parentPath, e.name)))
    .filter((ruta) => !IGNORADOS.has(ruta))
}

describe("pilares como datos", () => {
  it("no code names a pillar slug: pillars come from categorias", () => {
    const hallazgos = CARPETAS.flatMap(archivos).flatMap((ruta) =>
      readFileSync(join(RAIZ, ruta), "utf-8")
        .split("\n")
        .flatMap((linea, i) => (LITERAL.test(linea) ? [`${ruta}:${i + 1}: ${linea.trim()}`] : [])),
    )
    expect(hallazgos).toEqual([])
  })
})
