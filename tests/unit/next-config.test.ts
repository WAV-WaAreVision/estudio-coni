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
})
