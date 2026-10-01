// @vitest-environment node
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import {
  crearContenedorReel,
  estadoContenedor,
  leerPublicacion,
  publicarContenedor,
  renovarToken,
  TokenVencido,
} from "@/lib/proveedores/instagram"
import { servidor } from "../msw"

const TOKEN = "IGAA_token_de_prueba_de_coni"
const CUENTA = "17841400000000001"
const URL_VIDEO = "https://r2.test/videos/p/abc.mp4?X-Amz-Signature=firma"

interface Capturada {
  metodo: string
  url: URL
  cuerpo: unknown
}

function capturando(respuesta: () => Response): { capturas: Capturada[] } {
  const capturas: Capturada[] = []
  servidor.use(
    http.all("https://graph.instagram.com/*", async ({ request }) => {
      const texto = await request.clone().text()
      capturas.push({ metodo: request.method, url: new URL(request.url), cuerpo: texto ? JSON.parse(texto) : null })
      return respuesta()
    }),
  )
  return { capturas }
}

function errorDeMeta(estado: number, codigo: number, mensaje: string, subcodigo?: number) {
  return () =>
    HttpResponse.json(
      { error: { message: mensaje, type: "OAuthException", code: codigo, error_subcode: subcodigo, fbtrace_id: "x" } },
      { status: estado },
    )
}

async function rechazo(promesa: Promise<unknown>): Promise<Error> {
  try {
    await promesa
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error("Se esperaba un rechazo")
}

function esReintentable(error: Error): boolean {
  return !(error instanceof FallaDeConfiguracion) && !(error instanceof Falla)
}

describe("crearContenedorReel", () => {
  // https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
  it("creates a REELS container with the video, the caption and the AI label for an avatar", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "1789" }))
    const id = await crearContenedorReel({
      token: TOKEN,
      cuentaId: CUENTA,
      videoUrl: URL_VIDEO,
      texto: "Un texto",
      esAvatar: true,
    })
    expect(id).toBe("1789")
    expect(capturas).toHaveLength(1)
    expect(capturas[0]?.metodo).toBe("POST")
    expect(capturas[0]?.url.pathname).toBe(`/v25.0/${CUENTA}/media`)
    expect(capturas[0]?.url.search).toBe("")
    expect(capturas[0]?.cuerpo).toEqual({
      media_type: "REELS",
      video_url: URL_VIDEO,
      caption: "Un texto",
      is_ai_generated: true,
      access_token: TOKEN,
    })
  })

  it("leaves the AI label out for a clip that is not an avatar", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "1789" }))
    await crearContenedorReel({ token: TOKEN, cuentaId: CUENTA, videoUrl: URL_VIDEO, texto: "t", esAvatar: false })
    expect(capturas[0]?.cuerpo).not.toHaveProperty("is_ai_generated")
  })

  it("fails with a plain error on an answer without the container id", async () => {
    capturando(() => HttpResponse.json({}))
    const error = await rechazo(
      crearContenedorReel({ token: TOKEN, cuentaId: CUENTA, videoUrl: URL_VIDEO, texto: "t", esAvatar: true }),
    )
    expect(esReintentable(error)).toBe(true)
  })
})

describe("estadoContenedor", () => {
  // GET /<IG_CONTAINER_ID>?fields=status_code (and `status`, the error subcode when status_code is ERROR):
  // https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-container
  it.each([
    ["FINISHED", "listo"],
    ["IN_PROGRESS", "en_proceso"],
    ["PUBLISHED", "publicado"],
  ] as const)("reads %s as %s", async (codigo, esperado) => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "1789", status_code: codigo }))
    expect(await estadoContenedor({ token: TOKEN, contenedorId: "1789" })).toEqual({ estado: esperado })
    expect(capturas[0]?.metodo).toBe("GET")
    expect(capturas[0]?.url.pathname).toBe("/v25.0/1789")
    expect(capturas[0]?.url.searchParams.get("fields")).toBe("status_code,status")
    expect(capturas[0]?.url.searchParams.get("access_token")).toBe(TOKEN)
  })

  it.each([
    ["ERROR", "error"],
    ["EXPIRED", "expirado"],
  ] as const)("reads %s as %s with the detail Meta gives", async (codigo, esperado) => {
    capturando(() => HttpResponse.json({ id: "1789", status_code: codigo, status: "Error: 2207026" }))
    expect(await estadoContenedor({ token: TOKEN, contenedorId: "1789" })).toEqual({
      estado: esperado,
      detalle: "Error: 2207026",
    })
  })

  it("fails with a plain error on a status the docs do not list, so the retry reads it again", async () => {
    capturando(() => HttpResponse.json({ id: "1789", status_code: "NUEVO" }))
    const error = await rechazo(estadoContenedor({ token: TOKEN, contenedorId: "1789" }))
    expect(esReintentable(error)).toBe(true)
  })
})

describe("publicarContenedor", () => {
  it("publishes the container with POST /<IG_ID>/media_publish and returns the media id", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ id: "1795" }))
    const mediaId = await publicarContenedor({ token: TOKEN, cuentaId: CUENTA, contenedorId: "1789" })
    expect(mediaId).toBe("1795")
    expect(capturas[0]?.metodo).toBe("POST")
    expect(capturas[0]?.url.pathname).toBe(`/v25.0/${CUENTA}/media_publish`)
    expect(capturas[0]?.cuerpo).toEqual({ creation_id: "1789", access_token: TOKEN })
  })
})

describe("leerPublicacion", () => {
  // https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media
  it("reads the permalink, the caption, the product type and the AI label as Instagram returns them", async () => {
    const { capturas } = capturando(() =>
      HttpResponse.json({
        id: "1795",
        caption: "Un texto",
        permalink: "https://www.instagram.com/reel/abc/",
        media_product_type: "REELS",
        is_ai_generated: true,
      }),
    )
    expect(await leerPublicacion({ token: TOKEN, mediaId: "1795" })).toEqual({
      mediaId: "1795",
      texto: "Un texto",
      permalink: "https://www.instagram.com/reel/abc/",
      tipoDeProducto: "REELS",
      etiquetaIa: true,
    })
    expect(capturas[0]?.url.searchParams.get("fields")).toBe("id,caption,permalink,media_product_type,is_ai_generated")
  })

  it("reports a missing AI label as null, not as false", async () => {
    capturando(() => HttpResponse.json({ id: "1795", permalink: "https://www.instagram.com/reel/abc/" }))
    const lectura = await leerPublicacion({ token: TOKEN, mediaId: "1795" })
    expect(lectura.etiquetaIa).toBeNull()
    expect(lectura.texto).toBeNull()
    expect(lectura.tipoDeProducto).toBeNull()
  })
})

describe("renovarToken", () => {
  // https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
  it("refreshes the long-lived token with grant_type=ig_refresh_token", async () => {
    const { capturas } = capturando(() =>
      HttpResponse.json({ access_token: "IGAA_nuevo", token_type: "bearer", expires_in: 5183944 }),
    )
    expect(await renovarToken({ token: TOKEN })).toEqual({ token: "IGAA_nuevo", expiraEnSegundos: 5183944 })
    expect(capturas[0]?.metodo).toBe("GET")
    expect(capturas[0]?.url.origin + capturas[0]?.url.pathname).toBe("https://graph.instagram.com/refresh_access_token")
    expect(capturas[0]?.url.searchParams.get("grant_type")).toBe("ig_refresh_token")
    expect(capturas[0]?.url.searchParams.get("access_token")).toBe(TOKEN)
  })
})

describe("errors", () => {
  // https://developers.facebook.com/docs/graph-api/guides/error-handling : 190 and its subcodes need a new token.
  it.each([
    [400, 190, 463],
    [401, 190, 460],
    [400, 190, 467],
    [401, 190, undefined],
  ])("treats HTTP %i code %i subcode %s as an expired token for WAV and Coni", async (estado, codigo, sub) => {
    capturando(errorDeMeta(estado, codigo, "Error validating access token", sub))
    const error = await rechazo(publicarContenedor({ token: TOKEN, cuentaId: CUENTA, contenedorId: "1" }))
    expect(error).toBeInstanceOf(TokenVencido)
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
  })

  it.each([10, 200, 299])("treats permission code %i as a configuration error", async (codigo) => {
    capturando(errorDeMeta(403, codigo, "Permission denied"))
    const error = await rechazo(publicarContenedor({ token: TOKEN, cuentaId: CUENTA, contenedorId: "1" }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).not.toBeInstanceOf(TokenVencido)
  })

  it.each([1, 2, 4, 17, 341, 368])("treats the temporary code %i as a plain error that is retried", async (codigo) => {
    capturando(errorDeMeta(400, codigo, "Temporary"))
    const error = await rechazo(publicarContenedor({ token: TOKEN, cuentaId: CUENTA, contenedorId: "1" }))
    expect(esReintentable(error)).toBe(true)
  })

  it("treats any other 4xx as a definitive configuration error", async () => {
    capturando(errorDeMeta(400, 100, "Invalid parameter"))
    const error = await rechazo(
      crearContenedorReel({ token: TOKEN, cuentaId: CUENTA, videoUrl: URL_VIDEO, texto: "t", esAvatar: true }),
    )
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toContain("Invalid parameter")
  })

  it("treats 5xx and unreadable bodies as plain errors that are retried", async () => {
    capturando(() => new HttpResponse("<html>Bad gateway</html>", { status: 502 }))
    const error = await rechazo(leerPublicacion({ token: TOKEN, mediaId: "1" }))
    expect(esReintentable(error)).toBe(true)
  })

  it("treats a dropped connection as a plain error that is retried", async () => {
    capturando(() => HttpResponse.error())
    const error = await rechazo(publicarContenedor({ token: TOKEN, cuentaId: CUENTA, contenedorId: "1" }))
    expect(esReintentable(error)).toBe(true)
  })

  it("never puts the token or the signed video URL in a message", async () => {
    capturando(errorDeMeta(400, 100, `Bad token ${TOKEN} for ${URL_VIDEO}`))
    const error = await rechazo(estadoContenedor({ token: TOKEN, contenedorId: "1" }))
    expect(error.message).not.toContain(TOKEN)
    expect(error.message).not.toContain("X-Amz-Signature")
  })

  it("keeps the technical message out of the one written for Coni", async () => {
    capturando(errorDeMeta(401, 190, "secret details", 463))
    const error = await rechazo(publicarContenedor({ token: TOKEN, cuentaId: CUENTA, contenedorId: "1" }))
    expect(error).toBeInstanceOf(TokenVencido)
    expect((error as TokenVencido).paraConi).toContain("Instagram")
    expect((error as TokenVencido).paraConi).not.toContain("secret details")
    expect((error as TokenVencido).paraConi).not.toContain("—")
  })
})
