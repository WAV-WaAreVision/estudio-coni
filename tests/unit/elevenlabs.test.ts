// @vitest-environment node
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { ConfigElevenlabs } from "@/lib/proveedores/config"
import { generarVoz, verificarVoz } from "@/lib/proveedores/elevenlabs"
import { servidor } from "../msw"

const CLAVE = "sk_secreta_de_prueba"
const BASE = "https://api.elevenlabs.io"
const AUDIO = new Uint8Array([73, 68, 51, 4, 0, 255, 251])

const CONFIG: ConfigElevenlabs = {
  voice_id: "F2SkAeaaVSlAUrRS3rDg",
  model_id: "eleven_multilingual_v2",
  voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
  output_format: "mp3_44100_128",
}

interface Capturada {
  metodo: string
  url: URL
  cabeceras: Headers
  cuerpo: unknown
}

function capturando(respuesta: () => Response): { capturas: Capturada[] } {
  const capturas: Capturada[] = []
  servidor.use(
    http.all(`${BASE}/*`, async ({ request }) => {
      const texto = await request.clone().text()
      capturas.push({
        metodo: request.method,
        url: new URL(request.url),
        cabeceras: request.headers,
        cuerpo: texto ? JSON.parse(texto) : null,
      })
      return respuesta()
    }),
  )
  return { capturas }
}

function audioOk(): Response {
  return new HttpResponse(AUDIO, { headers: { "Content-Type": "audio/mpeg" } })
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

afterEach(() => {
  delete process.env.ELEVENLABS_BASE_URL
})

describe("generarVoz", () => {
  it("returns the audio bytes and sends the exact request coni.py sends", async () => {
    const { capturas } = capturando(audioOk)
    const audio = await generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola, soy Coni." })

    expect(audio).toBeInstanceOf(Uint8Array)
    expect([...audio]).toEqual([...AUDIO])
    expect(capturas).toHaveLength(1)
    const [pedido] = capturas
    expect(pedido?.metodo).toBe("POST")
    expect(pedido?.url.pathname).toBe("/v1/text-to-speech/F2SkAeaaVSlAUrRS3rDg")
    expect(pedido?.url.search).toBe("?output_format=mp3_44100_128")
    expect(pedido?.cabeceras.get("xi-api-key")).toBe(CLAVE)
    expect(pedido?.cabeceras.get("content-type")).toBe("application/json")
    expect(pedido?.cabeceras.get("accept")).toBe("audio/mpeg")
    expect(pedido?.cuerpo).toEqual({
      text: "Hola, soy Coni.",
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
    })
  })

  it("omits voice_settings when the config has none", async () => {
    const { capturas } = capturando(audioOk)
    const { voice_settings: _sin, ...sinAjustes } = CONFIG
    await generarVoz({ clave: CLAVE, config: sinAjustes, texto: "Hola." })
    expect(capturas[0]?.cuerpo).toEqual({ text: "Hola.", model_id: "eleven_multilingual_v2" })
  })

  it("omits voice_settings when the config has an empty object, like coni.py", async () => {
    const { capturas } = capturando(audioOk)
    await generarVoz({ clave: CLAVE, config: { ...CONFIG, voice_settings: {} }, texto: "Hola." })
    expect(capturas[0]?.cuerpo).toEqual({ text: "Hola.", model_id: "eleven_multilingual_v2" })
  })

  it("uses the base URL given by the caller", async () => {
    servidor.use(http.post("http://elevenlabs.test/v1/text-to-speech/:voz", audioOk))
    const audio = await generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola.", base: "http://elevenlabs.test" })
    expect(audio).toHaveLength(AUDIO.length)
  })

  it("uses ELEVENLABS_BASE_URL when the caller gives no base", async () => {
    process.env.ELEVENLABS_BASE_URL = "http://espejo.test"
    servidor.use(http.post("http://espejo.test/v1/text-to-speech/:voz", audioOk))
    const audio = await generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." })
    expect(audio).toHaveLength(AUDIO.length)
  })

  it("fails as a configuration error, without calling ElevenLabs, when the voice is not set", async () => {
    const { capturas } = capturando(audioOk)
    const error = await rechazo(generarVoz({ clave: CLAVE, config: { ...CONFIG, voice_id: null }, texto: "Hola." }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toContain("elevenlabs.voice_id")
    expect(capturas).toHaveLength(0)
  })

  it("fails as a configuration error, without the key, on an invalid API key", async () => {
    capturando(() =>
      HttpResponse.json({ detail: { status: "invalid_api_key", message: "Invalid API key" } }, { status: 401 }),
    )
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toBe("ElevenLabs respondió HTTP 401: invalid_api_key · Invalid API key")
    expect(error.message).not.toContain(CLAVE)
  })

  it.each([400, 402, 403, 404, 422])("fails as a configuration error on HTTP %i", async (estado) => {
    capturando(() => HttpResponse.json({ detail: "No se puede" }, { status: estado }))
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).toBe(`ElevenLabs respondió HTTP ${estado}: No se puede`)
  })

  it.each([429, 500, 502, 503, 529])("fails with a plain retryable error on HTTP %i", async (estado) => {
    capturando(() => new HttpResponse("upstream error", { status: estado }))
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain(`HTTP ${estado}`)
    expect(error.message).not.toContain(CLAVE)
  })

  it("never prints the key, even when ElevenLabs echoes it in the error body", async () => {
    capturando(() => new HttpResponse(`bad key ${CLAVE}`, { status: 401 }))
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error.message).not.toContain(CLAVE)
  })

  it("fails with a plain retryable error when the network drops", async () => {
    capturando(() => HttpResponse.error())
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("ElevenLabs")
    expect(error.message).not.toContain(CLAVE)
  })

  it("fails with a plain retryable error when ElevenLabs answers with an empty audio", async () => {
    capturando(() => new HttpResponse(new Uint8Array(), { headers: { "Content-Type": "audio/mpeg" } }))
    const error = await rechazo(generarVoz({ clave: CLAVE, config: CONFIG, texto: "Hola." }))
    expect(esReintentable(error)).toBe(true)
    expect(error.message).toContain("vacío")
  })
})

describe("verificarVoz", () => {
  // Ports TestVerificarElevenLabs of coni-heygen/tests/test_coni.py.
  it("explains why ElevenLabs rejects the voice, without the key", async () => {
    capturando(() =>
      HttpResponse.json(
        { detail: { status: "voice_not_found", message: "A voice with that id was not found." } },
        { status: 400 },
      ),
    )
    const resultado = await verificarVoz({ clave: CLAVE, voiceId: "el_789" })
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error("se esperaba un rechazo")
    expect(resultado.motivo).toContain("HTTP 400")
    expect(resultado.motivo).toContain("voice_not_found · A voice with that id was not found.")
    expect(resultado.motivo).not.toContain(CLAVE)
  })

  it("finds the voice when ElevenLabs returns it", async () => {
    const { capturas } = capturando(() => HttpResponse.json({ name: "Coni" }))
    const resultado = await verificarVoz({ clave: CLAVE, voiceId: "el_789" })
    expect(resultado).toEqual({ ok: true, nombre: "Coni" })
    expect(capturas[0]?.metodo).toBe("GET")
    expect(capturas[0]?.url.pathname).toBe("/v1/voices/el_789")
    expect(capturas[0]?.cabeceras.get("xi-api-key")).toBe(CLAVE)
  })

  it("says the voice has no name when ElevenLabs omits it", async () => {
    capturando(() => HttpResponse.json({}))
    expect(await verificarVoz({ clave: CLAVE, voiceId: "el_789" })).toEqual({ ok: true, nombre: "(sin nombre)" })
  })

  it("reports a network failure without throwing", async () => {
    capturando(() => HttpResponse.error())
    const resultado = await verificarVoz({ clave: CLAVE, voiceId: "el_789" })
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error("se esperaba un rechazo")
    expect(resultado.motivo).toContain("No pude conectar con ElevenLabs")
    expect(resultado.motivo).not.toContain(CLAVE)
  })

  it("reports an unreadable answer without throwing", async () => {
    capturando(() => new HttpResponse("<html>no es JSON</html>", { status: 200 }))
    const resultado = await verificarVoz({ clave: CLAVE, voiceId: "el_789" })
    expect(resultado).toEqual({ ok: false, motivo: "ElevenLabs devolvió una respuesta ilegible." })
  })

  it("never prints the key, even when ElevenLabs echoes it", async () => {
    capturando(() => new HttpResponse(`bad key ${CLAVE}`, { status: 401 }))
    const resultado = await verificarVoz({ clave: CLAVE, voiceId: "el_789" })
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error("se esperaba un rechazo")
    expect(resultado.motivo).toContain("HTTP 401")
    expect(resultado.motivo).not.toContain(CLAVE)
  })

  it("uses the base URL given by the caller", async () => {
    servidor.use(http.get("http://elevenlabs.test/v1/voices/:voz", () => HttpResponse.json({ name: "Coni" })))
    expect(await verificarVoz({ clave: CLAVE, voiceId: "el_789", base: "http://elevenlabs.test" })).toEqual({
      ok: true,
      nombre: "Coni",
    })
  })
})
