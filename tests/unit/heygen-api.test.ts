// @vitest-environment node
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { PedidoHeygen } from "@/lib/proveedores/heygen"
import {
  bajar,
  CODIGO_POLITICA,
  crearVideo,
  LIMITE_ASSET_BYTES,
  leerVideo,
  PoliticaDeContenido,
  subirAsset,
} from "@/lib/proveedores/heygen-api"
import { servidor } from "../msw"

const CLAVE = "hg_secreta_de_prueba"
const BASE = "https://api.heygen.com"
const IDEMPOTENCIA = "11111111-2222-4333-8444-555555555555:grabar:0123456789abcdef:0"
const AUDIO = new Uint8Array([73, 68, 51, 4, 0, 255, 251, 144])
const MENSAJE_POLITICA = "HeyGen no aceptó una frase del guion. Revísalo y vuelve a aprobarlo."

const PEDIDO: PedidoHeygen = {
  type: "avatar",
  avatar_id: "13affb25ba2d4273b0a63d82c8b9fd5a",
  title: "Prueba",
  aspect_ratio: "9:16",
  caption: { file_format: "srt" },
  resolution: "1080p",
  engine: { type: "avatar_v", reference_look_id: "f6d7ea2438514719b6b76e0b743fa7d3" },
  audio_asset_id: "asset_1",
}

interface Capturada {
  metodo: string
  url: URL
  cabeceras: Headers
  texto: string
}

function capturando(respuesta: () => Response): { capturas: Capturada[] } {
  const capturas: Capturada[] = []
  servidor.use(
    http.all(`${BASE}/*`, async ({ request }) => {
      capturas.push({
        metodo: request.method,
        url: new URL(request.url),
        cabeceras: request.headers,
        texto: await request.clone().text(),
      })
      return respuesta()
    }),
  )
  return { capturas }
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

// What Trigger.dev retries: anything that is neither for Coni (Falla) nor for WAV (FallaDeConfiguracion).
function esReintentable(error: Error): boolean {
  return !(error instanceof FallaDeConfiguracion) && !(error instanceof Falla)
}

function errorDeHeygen(codigo: string, mensaje: string, estado: number): () => Response {
  return () => HttpResponse.json({ error: { code: codigo, message: mensaje } }, { status: estado })
}

describe("subirAsset", () => {
  // https://developers.heygen.com/reference/upload-asset.md : POST /v3/assets, multipart field `file`, 32 MB.
  it("uploads the audio as multipart to POST /v3/assets and returns the asset id", async () => {
    const { capturas } = capturando(() =>
      HttpResponse.json({ data: { asset_id: "asset_9", url: "https://x", mime_type: "audio/mpeg", size_bytes: 8 } }),
    )

    const assetId = await subirAsset({ clave: CLAVE, datos: AUDIO, tipo: "audio/mpeg", idempotencia: IDEMPOTENCIA })

    expect(assetId).toBe("asset_9")
    expect(capturas).toHaveLength(1)
    const [pedido] = capturas
    expect(pedido?.metodo).toBe("POST")
    expect(pedido?.url.origin + pedido?.url.pathname).toBe(`${BASE}/v3/assets`)
    expect(pedido?.cabeceras.get("x-api-key")).toBe(CLAVE)
    expect(pedido?.cabeceras.get("idempotency-key")).toBe(IDEMPOTENCIA)
    expect(pedido?.cabeceras.get("content-type")).toMatch(/^multipart\/form-data; boundary=/)
  })

  it("sends the bytes under the `file` field with their media type", async () => {
    const visto: { archivo: FormDataEntryValue | null } = { archivo: null }
    servidor.use(
      http.post(`${BASE}/v3/assets`, async ({ request }) => {
        visto.archivo = (await request.formData()).get("file")
        return HttpResponse.json({ data: { asset_id: "asset_9" } })
      }),
    )

    await subirAsset({ clave: CLAVE, datos: AUDIO, tipo: "audio/mpeg" })

    const { archivo } = visto
    expect(archivo).toBeInstanceOf(File)
    if (!(archivo instanceof File)) throw new Error("se esperaba un archivo")
    expect(archivo.type).toBe("audio/mpeg")
    expect(archivo.name).toBe("audio.mp3")
    expect([...new Uint8Array(await archivo.arrayBuffer())]).toEqual([...AUDIO])
  })

  it("omits the idempotency header when the caller gives no key", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ data: { asset_id: "asset_9" } }))
    await subirAsset({ clave: CLAVE, datos: AUDIO, tipo: "audio/mpeg" })
    expect(capturas[0]?.cabeceras.has("idempotency-key")).toBe(false)
  })

  it("accepts a file of exactly 32 MB", async () => {
    capturando(() => HttpResponse.json({ data: { asset_id: "asset_9" } }))
    const justo = new Uint8Array(LIMITE_ASSET_BYTES)
    expect(await subirAsset({ clave: CLAVE, datos: justo, tipo: "audio/mpeg" })).toBe("asset_9")
  })

  it("refuses a file over 32 MB before calling HeyGen, with a plain error that names the size", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ data: { asset_id: "asset_9" } }))
    const error = await rechazo(
      subirAsset({ clave: CLAVE, datos: new Uint8Array(LIMITE_ASSET_BYTES + 1), tipo: "audio/mpeg" }),
    )
    expect(error).not.toBeInstanceOf(FallaDeConfiguracion)
    expect(error).not.toBeInstanceOf(Falla)
    expect(error.message).toContain("32 MB")
    expect(error.message).toContain("33554433")
    expect(capturas).toHaveLength(0)
  })

  it("fails with a plain error when the answer has no asset id", async () => {
    capturando(() => HttpResponse.json({ data: {} }))
    const error = await rechazo(subirAsset({ clave: CLAVE, datos: AUDIO, tipo: "audio/mpeg" }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("respuesta")
  })

  it("fails as a configuration error, without the key, on an invalid API key", async () => {
    capturando(errorDeHeygen("unauthorized", "Invalid API key", 401))
    const error = await rechazo(subirAsset({ clave: CLAVE, datos: AUDIO, tipo: "audio/mpeg" }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toBe("HeyGen respondió HTTP 401: Invalid API key")
    expect(error.message).not.toContain(CLAVE)
  })

  it("fails with a plain retryable error when the network drops", async () => {
    capturando(() => HttpResponse.error())
    const error = await rechazo(subirAsset({ clave: CLAVE, datos: AUDIO, tipo: "audio/mpeg" }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("HeyGen")
    expect(error.message).not.toContain(CLAVE)
  })
})

describe("crearVideo", () => {
  // https://developers.heygen.com/reference/create-video.md : POST /v3/videos -> { data: { video_id, status } }.
  it("posts the request to POST /v3/videos and returns the video id", async () => {
    const { capturas } = capturando(() =>
      HttpResponse.json({ data: { video_id: "v_abc123", status: "waiting", output_format: "mp4" } }),
    )

    const videoId = await crearVideo({ clave: CLAVE, pedido: PEDIDO, idempotencia: IDEMPOTENCIA })

    expect(videoId).toBe("v_abc123")
    expect(capturas).toHaveLength(1)
    const [pedido] = capturas
    expect(pedido?.metodo).toBe("POST")
    expect(pedido?.url.origin + pedido?.url.pathname).toBe(`${BASE}/v3/videos`)
    expect(pedido?.cabeceras.get("x-api-key")).toBe(CLAVE)
    expect(pedido?.cabeceras.get("content-type")).toBe("application/json")
    expect(pedido?.cabeceras.get("idempotency-key")).toBe(IDEMPOTENCIA)
    expect(JSON.parse(pedido?.texto ?? "")).toEqual(PEDIDO)
  })

  it("adds callback_url to the body only when the caller gives one", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ data: { video_id: "v_abc123", status: "waiting" } }))

    await crearVideo({ clave: CLAVE, pedido: PEDIDO })
    await crearVideo({ clave: CLAVE, pedido: PEDIDO, callbackUrl: "https://api.trigger.dev/token/abc" })

    expect(JSON.parse(capturas[0]?.texto ?? "")).not.toHaveProperty("callback_url")
    expect(capturas[0]?.cabeceras.has("idempotency-key")).toBe(false)
    expect(JSON.parse(capturas[1]?.texto ?? "")).toEqual({
      ...PEDIDO,
      callback_url: "https://api.trigger.dev/token/abc",
    })
  })

  it("does not change the request object it was given", async () => {
    capturando(() => HttpResponse.json({ data: { video_id: "v_abc123", status: "waiting" } }))
    const copia = structuredClone(PEDIDO)
    await crearVideo({ clave: CLAVE, pedido: copia, callbackUrl: "https://api.trigger.dev/token/abc" })
    expect(copia).toEqual(PEDIDO)
  })

  it("fails with a plain error when the answer has no video id", async () => {
    capturando(() => HttpResponse.json({ data: { status: "waiting" } }))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("respuesta")
  })

  it("answers a content policy rejection (HTTP 400) with a message written for Coni", async () => {
    capturando(errorDeHeygen(CODIGO_POLITICA, "The script violates our policy", 400))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(error).toBeInstanceOf(PoliticaDeContenido)
    expect(error).toBeInstanceOf(Falla)
    expect(error).not.toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toBe(MENSAJE_POLITICA)
  })

  it.each([401, 403])("fails as a configuration error on HTTP %i", async (estado) => {
    capturando(errorDeHeygen(estado === 401 ? "unauthorized" : "forbidden", "No autorizado", estado))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toBe(`HeyGen respondió HTTP ${estado}: No autorizado`)
  })

  it("tells Coni her HeyGen account has no credits on HTTP 402", async () => {
    capturando(errorDeHeygen("insufficient_credit", "Your account has 5 credits but this video requires 10", 402))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(error).toBeInstanceOf(Falla)
    expect(error).not.toBeInstanceOf(FallaDeConfiguracion)
    expect(error).not.toBeInstanceOf(PoliticaDeContenido)
    expect(error.message).toBe(
      "Tu cuenta de HeyGen no tiene créditos para este video. Revisa tu plan y vuelve a intentarlo.",
    )
  })

  it.each([400, 404, 422])("fails as a configuration error on any other HTTP %i", async (estado) => {
    capturando(errorDeHeygen("invalid_parameter", "Parámetro inválido", estado))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toBe(`HeyGen respondió HTTP ${estado}: Parámetro inválido`)
  })

  it.each([408, 409, 429, 500, 502, 503, 504])("fails with a plain retryable error on HTTP %i", async (estado) => {
    capturando(() => new HttpResponse("upstream error", { status: estado }))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain(`HTTP ${estado}`)
  })

  it("never prints the key, even when HeyGen echoes it in the error body", async () => {
    capturando(() => new HttpResponse(`bad key ${CLAVE}`, { status: 401 }))
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).not.toContain(CLAVE)
  })

  it("fails with a plain retryable error when the network drops", async () => {
    capturando(() => HttpResponse.error())
    const error = await rechazo(crearVideo({ clave: CLAVE, pedido: PEDIDO }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("HeyGen")
    expect(error.message).not.toContain(CLAVE)
  })
})

describe("leerVideo", () => {
  // https://developers.heygen.com/reference/get-video.md : GET /v3/videos/{video_id} -> { data: VideoDetail }.
  function responde(data: Record<string, unknown>): { capturas: Capturada[] } {
    return capturando(() => HttpResponse.json({ data }))
  }

  it("reads GET /v3/videos/{id} with the API key", async () => {
    const { capturas } = responde({ id: "v_abc123", status: "pending" })

    await leerVideo({ clave: CLAVE, videoId: "v_abc123" })

    expect(capturas).toHaveLength(1)
    expect(capturas[0]?.metodo).toBe("GET")
    expect(capturas[0]?.url.origin + capturas[0]?.url.pathname).toBe(`${BASE}/v3/videos/v_abc123`)
    expect(capturas[0]?.cabeceras.get("x-api-key")).toBe(CLAVE)
  })

  it("escapes the video id in the path", async () => {
    const { capturas } = responde({ id: "x", status: "pending" })
    await leerVideo({ clave: CLAVE, videoId: "a/b c" })
    expect(capturas[0]?.url.pathname).toBe("/v3/videos/a%2Fb%20c")
  })

  it.each(["pending", "waiting"])("maps %s to pendiente", async (status) => {
    responde({ id: "v", status })
    expect(await leerVideo({ clave: CLAVE, videoId: "v" })).toEqual({ estado: "pendiente" })
  })

  it.each(["processing", "generating"])("maps %s to procesando", async (status) => {
    responde({ id: "v", status })
    expect(await leerVideo({ clave: CLAVE, videoId: "v" })).toEqual({ estado: "procesando" })
  })

  it("maps completed to listo with the video, the subtitle file and the duration", async () => {
    responde({
      id: "v",
      status: "completed",
      video_url: "https://files.heygen.test/v.mp4?sig=1",
      subtitle_url: "https://files.heygen.test/v.srt?sig=2",
      duration: 41.5,
    })
    expect(await leerVideo({ clave: CLAVE, videoId: "v" })).toEqual({
      estado: "listo",
      videoUrl: "https://files.heygen.test/v.mp4?sig=1",
      subtitleUrl: "https://files.heygen.test/v.srt?sig=2",
      duracion: 41.5,
    })
  })

  it("leaves out the subtitle file and the duration when HeyGen sends them as null", async () => {
    responde({
      id: "v",
      status: "completed",
      video_url: "https://files.heygen.test/v.mp4",
      subtitle_url: null,
      duration: null,
    })
    expect(await leerVideo({ clave: CLAVE, videoId: "v" })).toEqual({
      estado: "listo",
      videoUrl: "https://files.heygen.test/v.mp4",
    })
  })

  it("fails with a plain error when a completed video has no download URL", async () => {
    responde({ id: "v", status: "completed", video_url: null })
    const error = await rechazo(leerVideo({ clave: CLAVE, videoId: "v" }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("video_url")
  })

  it("maps failed to fallido with the failure code and message", async () => {
    responde({
      id: "v",
      status: "failed",
      failure_code: "content_policy_violation",
      failure_message: "Frase no permitida",
    })
    expect(await leerVideo({ clave: CLAVE, videoId: "v" })).toEqual({
      estado: "fallido",
      fallo: { codigo: CODIGO_POLITICA, mensaje: "Frase no permitida" },
    })
  })

  it("fills in a code and a message when HeyGen fails a video without them", async () => {
    responde({ id: "v", status: "failed", failure_code: null, failure_message: null })
    expect(await leerVideo({ clave: CLAVE, videoId: "v" })).toEqual({
      estado: "fallido",
      fallo: { codigo: "desconocido", mensaje: "sin detalle" },
    })
  })

  it("fails with a plain error on a status it does not know, so a retry reads it again", async () => {
    responde({ id: "v", status: "teleporting" })
    const error = await rechazo(leerVideo({ clave: CLAVE, videoId: "v" }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("teleporting")
  })

  it("fails with a plain error when the answer is not the documented shape", async () => {
    capturando(() => HttpResponse.json({ video: {} }))
    const error = await rechazo(leerVideo({ clave: CLAVE, videoId: "v" }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("respuesta")
  })

  it("fails with a plain error when the body is not JSON", async () => {
    capturando(() => new HttpResponse("<html>proxy</html>", { status: 200 }))
    const error = await rechazo(leerVideo({ clave: CLAVE, videoId: "v" }))
    expect(esReintentable(error)).toBe(true)
  })

  it("fails as a configuration error on an invalid API key", async () => {
    capturando(errorDeHeygen("unauthorized", "Invalid API key", 401))
    const error = await rechazo(leerVideo({ clave: CLAVE, videoId: "v" }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).not.toContain(CLAVE)
  })

  it("fails with a plain retryable error on HTTP 500 and on a dropped network", async () => {
    capturando(() => new HttpResponse("boom", { status: 500 }))
    expect(esReintentable(await rechazo(leerVideo({ clave: CLAVE, videoId: "v" })))).toBe(true)
    servidor.resetHandlers()
    capturando(() => HttpResponse.error())
    expect(esReintentable(await rechazo(leerVideo({ clave: CLAVE, videoId: "v" })))).toBe(true)
  })
})

describe("bajar", () => {
  it("downloads the bytes without sending the API key", async () => {
    let cabeceras: Headers | undefined
    servidor.use(
      http.get("https://files.heygen.test/v.mp4", ({ request }) => {
        cabeceras = request.headers
        return new HttpResponse(AUDIO)
      }),
    )

    const bytes = await bajar("https://files.heygen.test/v.mp4?sig=abc")

    expect([...bytes]).toEqual([...AUDIO])
    expect(cabeceras?.has("x-api-key")).toBe(false)
    expect(cabeceras?.has("authorization")).toBe(false)
  })

  it("fails with a plain error that names the host and status but not the signed query", async () => {
    servidor.use(http.get("https://files.heygen.test/v.mp4", () => new HttpResponse("expired", { status: 403 })))
    const error = await rechazo(bajar("https://files.heygen.test/v.mp4?X-Amz-Signature=secreto"))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("403")
    expect(error.message).toContain("files.heygen.test")
    expect(error.message).not.toContain("secreto")
  })

  it("fails with a plain error that does not leak the signed query when the network drops", async () => {
    servidor.use(http.get("https://files.heygen.test/v.mp4", () => HttpResponse.error()))
    const error = await rechazo(bajar("https://files.heygen.test/v.mp4?X-Amz-Signature=secreto"))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).not.toContain("secreto")
  })

  it("fails with a plain error when the file comes back empty", async () => {
    servidor.use(http.get("https://files.heygen.test/v.mp4", () => new HttpResponse(new Uint8Array())))
    const error = await rechazo(bajar("https://files.heygen.test/v.mp4"))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("vacío")
  })
})
