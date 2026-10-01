// @vitest-environment node
import { describe, expect, it } from "vitest"
import { urlParaDescargar } from "@/lib/acciones/medios"

describe("urlParaDescargar", () => {
  it("in the local test run gives a link that names the file and says how long it lasts", async () => {
    const url = await urlParaDescargar("videos/p/v.mp4", "reel-ab12cd34.mp4", { DISPARO_DE_PRUEBA: "1" })

    expect(url).toBe("https://almacen.test/videos/p/v.mp4?expira=600&descarga=reel-ab12cd34.mp4")
  })

  it("lasts ten minutes, not an hour: it is for one download", async () => {
    const url = await urlParaDescargar("videos/p/v.mp4", "reel.mp4", { DISPARO_DE_PRUEBA: "1" })

    expect(url).toContain("expira=600")
  })

  it("refuses the test switch on Vercel and answers null instead of a link", async () => {
    const url = await urlParaDescargar("videos/p/v.mp4", "reel.mp4", { DISPARO_DE_PRUEBA: "1", VERCEL: "1" })

    expect(url).toBeNull()
  })
})
