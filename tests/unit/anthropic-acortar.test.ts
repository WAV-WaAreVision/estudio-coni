// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { acortarLaminas, MODELO_POR_TAREA, RechazoDeClaude } from "@/lib/proveedores/anthropic"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"
import { servidor } from "../msw"

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"
const GUIA = "# Línea editorial de Coni\n\nTrata de tú. Español de Chile."
const USO = { input_tokens: 1200, output_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000 }

interface Cuerpo {
  model: string
  system: unknown
  messages: { content: string }[]
  output_config: { effort: string; format: { schema: { properties: Record<string, unknown> } } }
}

function respondiendo(respuesta: () => Response): Cuerpo[] {
  const cuerpos: Cuerpo[] = []
  servidor.use(
    http.post<never, Cuerpo>(URL_MENSAJES, async ({ request }) => {
      cuerpos.push(await request.json())
      return respuesta()
    }),
  )
  return cuerpos
}

const mensaje = (salida: unknown, extra: Record<string, unknown> = {}) =>
  HttpResponse.json({
    id: "msg_prueba",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(salida) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: USO,
    ...extra,
  })

const cliente = () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })

describe("acortarLaminas", () => {
  it("asks only for the overflowing slides, with the cached guide, and returns their new text by index", async () => {
    const cuerpos = respondiendo(() =>
      mensaje({ laminas: [{ numero: 3, texto: "No nota el silencio antes de responder." }] }),
    )

    const { textos, uso } = await acortarLaminas({
      cliente: cliente(),
      guia: GUIA,
      laminas: LAMINAS_DE_PRUEBA,
      largas: [2],
    })

    expect(textos).toEqual(new Map([[2, "No nota el silencio antes de responder."]]))
    expect(uso.input_tokens).toBe(1200)
    const cuerpo = cuerpos[0]
    expect(cuerpo?.model).toBe(MODELO_POR_TAREA.acortarLaminas.modelo)
    expect(cuerpo?.output_config.effort).toBe("low")
    expect(JSON.stringify(cuerpo?.system)).toContain('"cache_control"')
    const pedido = cuerpo?.messages[0]?.content ?? ""
    expect(pedido).toContain("Acorta solo estas láminas: 3")
    expect(pedido).toContain("3. No nota el silencio largo antes de una respuesta difícil.")
  })

  it("refuses an answer that does not return exactly the slides asked for", async () => {
    respondiendo(() => mensaje({ laminas: [{ numero: 4, texto: "Otra." }] }))
    await expect(
      acortarLaminas({ cliente: cliente(), guia: GUIA, laminas: LAMINAS_DE_PRUEBA, largas: [2] }),
    ).rejects.toThrow("Claude no devolvió las láminas que pedí acortar.")
  })

  it("passes a refusal through as RechazoDeClaude", async () => {
    respondiendo(() => mensaje({}, { stop_reason: "refusal", content: [] }))
    await expect(
      acortarLaminas({ cliente: cliente(), guia: GUIA, laminas: LAMINAS_DE_PRUEBA, largas: [2] }),
    ).rejects.toThrow(RechazoDeClaude)
  })
})
