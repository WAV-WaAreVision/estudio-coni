// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { costoClaude, leerTextoEnImagenes } from "@/lib/proveedores/anthropic"
import { servidor } from "../msw"

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"
const USO = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])

interface Bloque {
  type: string
  text?: string
  source?: { type: string; media_type: string; data: string }
}
interface Cuerpo {
  system: { text: string }[]
  messages: { content: Bloque[] }[]
}

function cliente(): Anthropic {
  return new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })
}

function imagenes(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `f${i}`, jpeg: JPEG }))
}

/** Answers like the model would: one entry per image id found in the request. */
function respondiendo(modificar: (lecturas: Record<string, string>[]) => Record<string, string>[] = (l) => l) {
  const cuerpos: Cuerpo[] = []
  servidor.use(
    http.post<never, Cuerpo>(URL_MENSAJES, async ({ request }) => {
      const cuerpo = await request.json()
      cuerpos.push(cuerpo)
      const ids = cuerpo.messages[0]?.content.flatMap((b) => (b.text ? [...b.text.matchAll(/id "([^"]+)"/g)] : []))
      const lecturas = (ids ?? []).map((m) => ({ id: m[1] ?? "", texto: `texto ${m[1]}`, idioma: "es" }))
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify({ lecturas: modificar(lecturas) }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return cuerpos
}

describe("leerTextoEnImagenes", () => {
  it("sends each image as base64 image/jpeg and returns id, text and language", async () => {
    const cuerpos = respondiendo()

    const { lecturas } = await leerTextoEnImagenes({ cliente: cliente(), imagenes: imagenes(2) })

    expect(lecturas).toEqual([
      { id: "f0", texto: "texto f0", idioma: "es" },
      { id: "f1", texto: "texto f1", idioma: "es" },
    ])
    const fuentes = cuerpos[0]?.messages[0]?.content.flatMap((b) => (b.source ? [b.source] : []))
    expect(fuentes).toEqual([
      { type: "base64", media_type: "image/jpeg", data: Buffer.from(JPEG).toString("base64") },
      { type: "base64", media_type: "image/jpeg", data: Buffer.from(JPEG).toString("base64") },
    ])
  })

  it("tells Claude to transcribe only visible text, verbatim, untranslated, with an ISO 639-1 language", async () => {
    const cuerpos = respondiendo()

    await leerTextoEnImagenes({ cliente: cliente(), imagenes: imagenes(1) })

    const instrucciones = [
      cuerpos[0]?.system.map((s) => s.text).join(" "),
      ...(cuerpos[0]?.messages[0]?.content.map((b) => b.text) ?? []),
    ].join("\n")
    expect(instrucciones).toMatch(/solo el texto visible/i)
    expect(instrucciones).toMatch(/literal/i)
    expect(instrucciones).toMatch(/idioma original/i)
    expect(instrucciones).toMatch(/sin describir/i)
    expect(instrucciones).toMatch(/sin traducir/i)
    expect(instrucciones).toMatch(/639-1/)
    expect(instrucciones).toMatch(/cadena vacía/i)
  })

  it("splits 25 images into 2 requests of at most 20 and returns all 25 in order", async () => {
    const cuerpos = respondiendo()

    const { lecturas } = await leerTextoEnImagenes({ cliente: cliente(), imagenes: imagenes(25) })

    expect(cuerpos).toHaveLength(2)
    expect(cuerpos.map((c) => c.messages[0]?.content.filter((b) => b.source).length)).toEqual([20, 5])
    expect(lecturas.map((l) => l.id)).toEqual(imagenes(25).map((i) => i.id))
  })

  it("adds up the usage of every request and prices it with costoClaude", async () => {
    respondiendo()

    const { uso } = await leerTextoEnImagenes({ cliente: cliente(), imagenes: imagenes(25) })

    expect(uso.input_tokens).toBe(2000)
    expect(uso.output_tokens).toBe(200)
    expect(costoClaude(uso, "claude-sonnet-5-5")).toBeCloseTo((2000 * 2 + 200 * 10) / 1_000_000)
  })

  it("keeps an empty string when the image has no text", async () => {
    respondiendo((l) => l.map((x) => ({ ...x, texto: "", idioma: "" })))

    const { lecturas } = await leerTextoEnImagenes({ cliente: cliente(), imagenes: imagenes(1) })

    expect(lecturas).toEqual([{ id: "f0", texto: "", idioma: "" }])
  })

  it("fails when Claude returns an id that was not requested", async () => {
    respondiendo((l) => l.map((x) => ({ ...x, id: "otro" })))

    await expect(leerTextoEnImagenes({ cliente: cliente(), imagenes: imagenes(1) })).rejects.toThrow(/ids/)
  })

  it("fails when Claude skips or repeats an image", async () => {
    respondiendo((l) => [l[0] ?? { id: "f0", texto: "", idioma: "" }, l[0] ?? { id: "f0", texto: "", idioma: "" }])

    await expect(leerTextoEnImagenes({ cliente: cliente(), imagenes: imagenes(2) })).rejects.toThrow(/ids/)
  })

  it("makes no request for an empty list", async () => {
    const cuerpos = respondiendo()

    const { lecturas, uso } = await leerTextoEnImagenes({ cliente: cliente(), imagenes: [] })

    expect(lecturas).toEqual([])
    expect(uso.input_tokens).toBe(0)
    expect(cuerpos).toHaveLength(0)
  })
})
