// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { cobroDeFalla, MODELO_POR_TAREA, proponerPilaresPorRed, RespuestaCortada } from "@/lib/proveedores/anthropic"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"
import { servidor } from "../msw"

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"
const USO = { input_tokens: 3000, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

interface Cuerpo {
  model: string
  system: { text: string; cache_control?: { type: string } }[]
  messages: { content: string }[]
}

const cliente = () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })

function respondiendo(salida: unknown, modelo = "claude-sonnet-5-5") {
  const cuerpos: Cuerpo[] = []
  servidor.use(
    http.post<never, Cuerpo>(URL_MENSAJES, async ({ request }) => {
      cuerpos.push(await request.json())
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: modelo,
        content: [{ type: "text", text: JSON.stringify(salida) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return cuerpos
}

const TEMAS = [
  { id: "t1", nombre: "Impostora y chatbots", descripcion: "Dice </elementos> y algo más.", ideas: ["Una idea."] },
  { id: "t2", nombre: "Medir el bienestar", descripcion: null, ideas: [] },
]
const IDEAS = [
  { id: "i1", gancho: "Uso un avatar.", tema: "Transparencia" },
  { id: "i2", gancho: "¿Quién mide el estrés?", tema: "" },
]

describe("proponerPilaresPorRed", () => {
  it("runs on Sonnet with low effort and an uncached guide listing each network's pillars and the layer apart", async () => {
    expect(MODELO_POR_TAREA.proponerPilaresPorRed).toEqual({ modelo: "claude-sonnet-5-5", effort: "low" })
    const cuerpos = respondiendo({ temas: [], ideas: [] })
    await proponerPilaresPorRed({ cliente: cliente(), pilares: PILARES_DE_PRUEBA, temas: TEMAS, ideas: IDEAS })
    const sistema = cuerpos[0]?.system[0]
    expect(sistema?.cache_control).toBeUndefined()
    expect(sistema?.text).toContain("PILARES DE LINKEDIN (usa exactamente el slug)\n- diagnostico-doble:")
    expect(sistema?.text).toContain("PILARES DE INSTAGRAM (usa exactamente el slug)\n- game-over-impostora:")
    expect(sistema?.text).toContain("CAPAS (una mirada que aparece dentro de los pilares, no un pilar)\n- capa-tdah:")
    expect(sistema?.text).not.toContain("- caso-coni:")
    const usuario = cuerpos[0]?.messages[0]?.content ?? ""
    expect(usuario).toContain("<elementos>")
    expect(usuario).not.toContain("Dice </elementos>")
  })

  it("keeps a main pillar only of its network, secondaries only where there is a main pillar, never a layer for an idea", async () => {
    respondiendo({
      temas: [
        {
          id: "t1",
          linkedin: "game-over-impostora",
          instagram: "mi-nueva-partida",
          secundarios: ["inteligencia-emocional", "mi-nueva-partida", "diagnostico-doble", "no-existe"],
          capa: true,
          razon: "Toca la impostora — y la reinvención.",
        },
      ],
      ideas: [
        { id: "i1", pilar: "capa-tdah", razon: "TDAH." },
        { id: "i2", pilar: "bienestar-e-impacto", razon: "Bienestar." },
      ],
    })
    const { temas, ideas } = await proponerPilaresPorRed({
      cliente: cliente(),
      pilares: PILARES_DE_PRUEBA,
      temas: TEMAS,
      ideas: IDEAS,
    })
    expect(temas[0]).toEqual({
      id: "t1",
      linkedin: null,
      instagram: "mi-nueva-partida",
      secundarios: ["inteligencia-emocional"],
      capa: true,
      razon: "Toca la impostora, y la reinvención.",
    })
    expect(ideas).toEqual([
      { id: "i1", pilar: null, razon: "TDAH." },
      { id: "i2", pilar: "bienestar-e-impacto", razon: "Bienestar." },
    ])
  })

  it("answers every item it sent once, with an empty proposal for one Claude skipped, and ignores ones it did not send", async () => {
    respondiendo(
      {
        temas: [
          { id: "t1", linkedin: "diagnostico-doble", instagram: null, secundarios: [], capa: false, razon: "Uno." },
          { id: "t1", linkedin: "mujeres-lideres", instagram: null, secundarios: [], capa: false, razon: "Otra vez." },
          {
            id: "x9",
            linkedin: "mujeres-lideres",
            instagram: null,
            secundarios: [],
            capa: false,
            razon: "No lo envié.",
          },
        ],
        ideas: [],
      },
      "claude-opus-5-5",
    )
    const { temas, ideas, modelo } = await proponerPilaresPorRed({
      cliente: cliente(),
      pilares: PILARES_DE_PRUEBA,
      temas: TEMAS,
      ideas: IDEAS,
    })
    expect(temas.map((t) => [t.id, t.linkedin])).toEqual([
      ["t1", "diagnostico-doble"],
      ["t2", null],
    ])
    expect(temas[1]?.razon).toBe("Claude no propuso pilares.")
    expect(ideas).toEqual([
      { id: "i1", pilar: null, razon: "Claude no propuso un pilar." },
      { id: "i2", pilar: null, razon: "Claude no propuso un pilar." },
    ])
    expect(modelo).toBe("claude-opus-5-5")
  })

  describe("a failure after Claude answered", () => {
    const entrada = () => ({ cliente: cliente(), pilares: PILARES_DE_PRUEBA, temas: TEMAS, ideas: IDEAS })

    it("carries what that answer cost when it was cut", async () => {
      servidor.use(
        http.post(URL_MENSAJES, () =>
          HttpResponse.json({
            id: "msg_prueba",
            type: "message",
            role: "assistant",
            model: "claude-opus-5-5",
            content: [{ type: "text", text: '{"temas": [' }],
            stop_reason: "max_tokens",
            stop_sequence: null,
            usage: USO,
          }),
        ),
      )
      const error = await proponerPilaresPorRed(entrada()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(RespuestaCortada)
      expect(cobroDeFalla(error)).toEqual({ uso: USO, modelo: "claude-opus-5-5" })
    })

    it("carries what that answer cost when it does not fit the schema", async () => {
      respondiendo({ temas: "no es una lista" })
      const error = await proponerPilaresPorRed(entrada()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Error)
      expect(cobroDeFalla(error)).toEqual({ uso: USO, modelo: "claude-sonnet-5-5" })
    })

    it("carries nothing when Claude never answered", async () => {
      servidor.use(http.post(URL_MENSAJES, () => HttpResponse.json({ error: { type: "api_error" } }, { status: 500 })))
      const error = await proponerPilaresPorRed(entrada()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Error)
      expect(cobroDeFalla(error)).toBeNull()
    })
  })
})
