import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import nextConfig from "@/next.config"

const grep = (patron: string, rutas: string) =>
  execSync(`grep -rlE "${patron}" ${rutas} || true`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((linea) => linea !== "")

describe("the app never bundles Chromium", () => {
  it("no file under app/ or components/ imports playwright or the launcher", () => {
    expect(
      grep("from ['\\\"](playwright|@/lib/carrusel/navegador|@/lib/produccion/deps-reales)['\\\"]", "app components"),
    ).toEqual([])
  })

  it("only deps-reales reaches the launcher, and only when a render asks for it", () => {
    expect(grep("@/lib/carrusel/navegador|\\./navegador['\\\"]", "lib app components")).toEqual([
      "lib/produccion/deps-reales.ts",
    ])
    const depsReales = readFileSync("lib/produccion/deps-reales.ts", "utf8")
    expect(depsReales).not.toMatch(/from ["']@\/lib\/carrusel\/navegador["']/)
    expect(depsReales).toMatch(/await import\(["']@\/lib\/carrusel\/navegador["']\)/)
  })

  it("only the launcher loads playwright: anywhere else under lib/, app/ or components/ it is a type at most", () => {
    const candidatos = grep("['\\\"]playwright(-core)?['\\\"]", "lib app components")
    const cargan = candidatos.filter((ruta) =>
      readFileSync(ruta, "utf8")
        .split("\n")
        .some(
          (linea) =>
            /(from|import\(|require\()\s*["']playwright(-core)?["']/.test(linea) &&
            !/^\s*(import|export)\s+type\b/.test(linea),
        ),
    )
    expect(cargan).toEqual(["lib/carrusel/navegador.ts"])
  })

  it("keeps playwright out of the server bundle even if something reached it", () => {
    expect(nextConfig.serverExternalPackages).toContain("playwright")
  })
})
