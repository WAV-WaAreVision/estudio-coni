// @vitest-environment node
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { TokenVencido } from "@/lib/proveedores/instagram"
import { leerMetricasDeReel, leerToquesDePerfil } from "@/lib/proveedores/instagram-metricas"
import { servidor } from "../msw"

const TOKEN = "IGAA_token_de_prueba_de_coni"
const CUENTA = "17841400000000001"

function capturando(cuerpo: unknown, estado = 200) {
  const urls: URL[] = []
  servidor.use(
    http.get("https://graph.instagram.com/*", ({ request }) => {
      urls.push(new URL(request.url))
      return HttpResponse.json(cuerpo as Record<string, unknown>, { status: estado })
    }),
  )
  return urls
}

const dato = (name: string, value: number) => ({ name, period: "lifetime", values: [{ value }], title: name, id: name })

describe("leerMetricasDeReel", () => {
  it("asks for the five Reels metrics of the media and reads each figure by name", async () => {
    const urls = capturando({
      data: [
        dato("reach", 2400),
        dato("saved", 121),
        dato("shares", 30),
        dato("comments", 7),
        dato("ig_reels_avg_watch_time", 24_400),
      ],
    })

    const metricas = await leerMetricasDeReel({ token: TOKEN, mediaId: "1789" })

    expect(metricas).toEqual({
      alcance: 2400,
      guardados: 121,
      compartidos: 30,
      comentarios: 7,
      tiempoPromedio: 24_400,
    })
    expect(urls).toHaveLength(1)
    expect(urls[0]?.pathname).toBe("/v25.0/1789/insights")
    expect(urls[0]?.searchParams.get("metric")).toBe("reach,saved,shares,comments,ig_reels_avg_watch_time")
    expect(urls[0]?.searchParams.get("access_token")).toBe(TOKEN)
  })

  it("leaves a figure Instagram did not return as unknown, never as zero", async () => {
    capturando({ data: [dato("reach", 800), dato("saved", 0)] })

    const metricas = await leerMetricasDeReel({ token: TOKEN, mediaId: "1789" })

    expect(metricas).toEqual({
      alcance: 800,
      guardados: 0,
      compartidos: null,
      comentarios: null,
      tiempoPromedio: null,
    })
  })

  it("fails loudly when the answer is not the documented shape", async () => {
    capturando({ data: [{ name: "reach", values: [{ value: "muchos" }] }] })

    await expect(leerMetricasDeReel({ token: TOKEN, mediaId: "1789" })).rejects.toThrow(/respuesta inesperada/)
  })

  it("separates an expired token from other refusals, without the token in the message", async () => {
    capturando({ error: { message: `Invalid OAuth access token ${TOKEN}`, code: 190 } }, 400)

    const error = await leerMetricasDeReel({ token: TOKEN, mediaId: "1789" }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TokenVencido)
    expect(String((error as Error).message)).not.toContain(TOKEN)
  })

  it("treats a media that has no insights as a refusal that retrying will not change", async () => {
    capturando({ error: { message: "Media insights are not available for this media", code: 100 } }, 400)

    await expect(leerMetricasDeReel({ token: TOKEN, mediaId: "1789" })).rejects.toBeInstanceOf(FallaDeConfiguracion)
  })
})

describe("leerToquesDePerfil", () => {
  const DESDE = Date.parse("2026-10-09T03:00:00.000Z")

  it("asks for the day's total of profile_links_taps between two instants", async () => {
    const urls = capturando({
      data: [{ name: "profile_links_taps", period: "day", total_value: { value: 4 }, title: "t", id: "i" }],
    })

    const toques = await leerToquesDePerfil({
      token: TOKEN,
      cuentaId: CUENTA,
      desde: DESDE,
      hasta: DESDE + 86_400_000,
    })

    expect(toques).toBe(4)
    const url = urls[0]
    expect(url?.pathname).toBe(`/v25.0/${CUENTA}/insights`)
    expect(url?.searchParams.get("metric")).toBe("profile_links_taps")
    expect(url?.searchParams.get("metric_type")).toBe("total_value")
    expect(url?.searchParams.get("period")).toBe("day")
    expect(url?.searchParams.get("since")).toBe(String(DESDE / 1000))
    expect(url?.searchParams.get("until")).toBe(String((DESDE + 86_400_000) / 1000))
  })

  it("is unknown, not zero, when Instagram answers with no data (an account under 100 followers)", async () => {
    capturando({ data: [] })

    expect(await leerToquesDePerfil({ token: TOKEN, cuentaId: CUENTA, desde: DESDE, hasta: DESDE + 1000 })).toBeNull()
  })
})
