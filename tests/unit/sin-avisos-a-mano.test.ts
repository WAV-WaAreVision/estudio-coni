// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { TEXTO_SIN_SALDO_VIDEO, TEXTO_SIN_SALDO_VOZ } from "@/app/(app)/guion/[id]/textos"
import { TEXTO_SIN_AVATARES } from "@/components/elegir-avatar"

const RAIZ = join(__dirname, "..", "..")

function archivos(carpeta: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(join(RAIZ, carpeta))) {
    const ruta = join(carpeta, nombre)
    if (statSync(join(RAIZ, ruta)).isDirectory()) salida.push(...archivos(ruta))
    else if (/\.tsx?$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

// Out of issue 101's scope (its spec names four texts): the error screen and the Instagram, LinkedIn and metrics
// notices still ask her to tell Federico by hand. A new one anywhere else fails here.
const FUERA_DEL_ALCANCE = new Set([
  "components/error-de-pantalla.tsx",
  "lib/ajustes/instagram-aviso.ts",
  "lib/ajustes/linkedin-aviso.ts",
  "lib/metricas/modelo.ts",
])

describe("no screen asks Coni to tell Federico by hand (issue 101)", () => {
  it("has no «avísale a Federico» in app/, components/ or lib/ beyond the files left for later", () => {
    const culpables = ["app", "components", "lib"]
      .flatMap(archivos)
      .filter((ruta) => !FUERA_DEL_ALCANCE.has(ruta))
      .filter((ruta) => /av[ií]sale a federico/i.test(readFileSync(join(RAIZ, ruta), "utf-8")))
    expect(culpables).toEqual([])
  })

  it("says the balance blocks and the missing looks without a hand-off", () => {
    expect(TEXTO_SIN_SALDO_VOZ).toBe("No alcanza el saldo para preparar tu voz.")
    expect(TEXTO_SIN_SALDO_VIDEO).toBe("No alcanza el saldo para grabar el video.")
    expect(TEXTO_SIN_AVATARES).toBe("Aún no hay avatares. Cuando WAV los agregue, los eliges aquí.")
  })
})
