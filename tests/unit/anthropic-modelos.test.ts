// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { estimarFicha, estimarLectura } from "@/lib/ingesta/procesar"
import {
  clasificarIdea,
  costoClaude,
  escribirFicha,
  escribirGuion,
  leerTextoEnImagenes,
  MODELO_POR_TAREA,
  revisarConClaude,
} from "@/lib/proveedores/anthropic"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"
import { servidor } from "../msw"

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"
const USO = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const OPUS = "claude-opus-5-5"
const SONNET = "claude-sonnet-5-5"

interface Cuerpo {
  model: string
  thinking?: { type: string }
  output_config?: { effort?: string }
}

function cliente(): Anthropic {
  return new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })
}

/** Captures the body of the one request and answers with `salida`. */
function capturando(salida: unknown) {
  const cuerpos: Cuerpo[] = []
  servidor.use(
    http.post<never, Cuerpo>(URL_MENSAJES, async ({ request }) => {
      cuerpos.push(await request.json())
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "x",
        content: [{ type: "text", text: JSON.stringify(salida) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return cuerpos
}

const IDEA = { pilar: { nombre: "Pareja", descripcion: null }, gancho: "g", tema: "t", formato: "f", alertas: [] }
const FICHA = {
  resumen: "r",
  ideasClave: ["a", "b", "c", "d", "e"],
  citas: [],
  fuente: { autor: null, anio: null, enlace: null },
  autorSugerido: null,
}

describe("a model per task", () => {
  it("writes the script with Opus at medium effort", async () => {
    const cuerpos = capturando({ guion: "g", texto: "t", textoLinkedin: "l" })
    await escribirGuion({
      cliente: cliente(),
      guia: "guia",
      idea: IDEA,
      respaldo: null,
      fuentes: [],
      requiereLineasAyuda: false,
    })
    expect(cuerpos[0]?.model).toBe(OPUS)
    expect(cuerpos[0]?.output_config?.effort).toBe("medium")
    expect(cuerpos[0]?.thinking).toBeUndefined()
  })

  it("reviews with Opus at low effort", async () => {
    const cuerpos = capturando({ hallazgos: [] })
    await revisarConClaude({
      cliente: cliente(),
      guia: "guia",
      guion: "g",
      texto: "t",
      textoLinkedin: null,
      alertas: [],
    })
    expect(cuerpos[0]?.model).toBe(OPUS)
    expect(cuerpos[0]?.output_config?.effort).toBe("low")
    expect(cuerpos[0]?.thinking).toBeUndefined()
  })

  it("writes the card with Opus at low effort", async () => {
    const cuerpos = capturando(FICHA)
    await escribirFicha({ cliente: cliente(), titulo: "t", autor: null, partes: [] })
    expect(cuerpos[0]?.model).toBe(OPUS)
    expect(cuerpos[0]?.output_config?.effort).toBe("low")
    expect(cuerpos[0]?.thinking).toBeUndefined()
  })

  it("classifies an idea with Sonnet at low effort", async () => {
    const cuerpos = capturando({ pilar: "caso-coni", formato: "Mito o realidad", alertas: [] })
    await clasificarIdea({ cliente: cliente(), guia: "guia", gancho: "g", tema: "t", pilares: PILARES_DE_PRUEBA })
    expect(cuerpos[0]?.model).toBe(SONNET)
    expect(cuerpos[0]?.output_config?.effort).toBe("low")
  })

  it("reads text in images with Sonnet at low effort", async () => {
    const cuerpos = capturando({ lecturas: [{ id: "f0", texto: "", idioma: "" }] })
    await leerTextoEnImagenes({ cliente: cliente(), imagenes: [{ id: "f0", jpeg: Uint8Array.from([0xff, 0xd8]) }] })
    expect(cuerpos[0]?.model).toBe(SONNET)
    expect(cuerpos[0]?.output_config?.effort).toBe("low")
  })

  it("never sends thinking disabled to an Opus call", async () => {
    for (const tarea of ["escribirGuion", "revisarConClaude", "escribirFicha"] as const) {
      expect(MODELO_POR_TAREA[tarea].modelo).toBe(OPUS)
      expect("thinking" in MODELO_POR_TAREA[tarea]).toBe(false)
    }
  })

  it("names the model of the task when Anthropic does not find it", async () => {
    servidor.use(
      http.post(URL_MENSAJES, () =>
        HttpResponse.json({ type: "error", error: { type: "not_found_error", message: "x" } }, { status: 404 }),
      ),
    )
    await expect(
      revisarConClaude({ cliente: cliente(), guia: "g", guion: "g", texto: "t", textoLinkedin: null, alertas: [] }),
    ).rejects.toThrow(OPUS)
  })
})

describe("costoClaude por modelo", () => {
  const uso = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }

  it("prices Opus 5.5 at 4 in, 20 out and 0.20 cache read per million", () => {
    expect(costoClaude(uso, OPUS)).toBeCloseTo(24.2)
  })

  it("prices Sonnet 5.5 at 2 in, 10 out and 0.20 cache read per million", () => {
    expect(costoClaude(uso, SONNET)).toBeCloseTo(12.2)
  })

  it("charges a cache write at 1.25 times the input price of the model", () => {
    const escritura = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 }
    expect(costoClaude(escritura, OPUS)).toBeCloseTo(5)
    expect(costoClaude(escritura, SONNET)).toBeCloseTo(2.5)
  })

  it("makes a Sonnet response cost half of the same Opus response", () => {
    expect(costoClaude(USO, SONNET)).toBeCloseTo(costoClaude(USO, OPUS) / 2)
  })
})

describe("estimates use the price of the task", () => {
  it("reserves a vision batch at the Sonnet price", () => {
    const esperado = costoClaude(
      { input_tokens: 800 + 1_600 * 3, output_tokens: 150 + 300 * 3 },
      MODELO_POR_TAREA.leerTextoEnImagenes.modelo,
    )
    expect(estimarLectura(3)).toBeCloseTo(esperado, 4)
  })

  it("reserves a card at the Opus price", () => {
    const esperado = costoClaude(
      { input_tokens: Math.ceil(300 / 3) + 1_500, output_tokens: 2_500 },
      MODELO_POR_TAREA.escribirFicha.modelo,
    )
    expect(estimarFicha([{ texto: "a".repeat(300), ubicacion: { pagina: 1 } }])).toBeCloseTo(esperado, 4)
  })
})
