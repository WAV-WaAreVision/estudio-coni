import { execSync } from "node:child_process"
import { describe, expect, it } from "vitest"

describe("the app never bundles Chromium", () => {
  it("no file under app/ or components/ imports playwright or the launcher", () => {
    const encontrados = execSync(
      'grep -rlE "from [\'\\"](playwright|@/lib/carrusel/navegador|@/lib/produccion/deps-reales)[\'\\"]" app components || true',
      { encoding: "utf8" },
    ).trim()
    expect(encontrados).toBe("")
  })
})
