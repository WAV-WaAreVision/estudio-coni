// @vitest-environment node
import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

describe("next.config", () => {
  it("never lets the browser keep an old service worker, and fixes its type and scope", async () => {
    const reglas = (await nextConfig.headers?.()) ?? []
    const regla = reglas.find((r) => r.source === "/sw.js")
    const cabeceras = Object.fromEntries((regla?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]))
    expect(cabeceras["cache-control"]).toBe("no-cache, no-store, must-revalidate")
    expect(cabeceras["content-type"]).toBe("application/javascript; charset=utf-8")
    expect(cabeceras["service-worker-allowed"]).toBe("/")
  })

  it("takes LinkedIn's Excel through a Server Action (2 MB) and leaves its reader to Node", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("2mb")
    expect(nextConfig.serverExternalPackages).toContain("read-excel-file")
  })
})
