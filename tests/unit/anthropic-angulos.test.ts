// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { pilaresParaElegir, soloActivos } from "@/lib/dominio/pilares"
import { clasificarIdea, escribirTeorias, proponerPilaresPorRed } from "@/lib/proveedores/anthropic"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"
import { servidor } from "../msw"

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"
const USO = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const cliente = () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })

/** Answers every request with `salida` and keeps what was asked. */
function respondiendo(salida: unknown) {
  const usuarios: string[] = []
  servidor.use(
    http.post<never, { messages: { content: string }[] }>(URL_MENSAJES, async ({ request }) => {
      usuarios.push((await request.json()).messages[0]?.content ?? "")
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(salida) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return usuarios
}

const afirmacion = (id: string, autor: string) => ({
  id,
  autor,
  texto: "Un texto.",
  cita: "A quote.",
  tipo: "dato",
  evidencia: "estudio",
  publico: null,
  dolor: null,
  emocion: null,
})

const CRUCE = {
  id: "c1",
  temas: [{ id: "t1", nombre: "Tema", pilares: ["psicologia-en-la-mesa"] }],
  afirmaciones: [afirmacion("a1", "Ana"), afirmacion("a2", "Beto")],
}

const teoria = (ideas: object[]) => ({
  cruceId: "c1",
  nada: false,
  razon: null,
  titulo: "Título",
  tesis: "Tesis.",
  porQue: "Porque.",
  aportes: [
    { afirmacionId: "a1", aporte: "Uno" },
    { afirmacionId: "a2", aporte: "Dos" },
  ],
  tensiones: [],
  nivelEvidencia: "alto",
  advertencias: [],
  ideas,
})

const CONTEXTO = { guia: "Guía.", estrategia: [], vozPropia: [], pilares: soloActivos(PILARES_DE_PRUEBA) }

describe("escribirTeorias con ángulos", () => {
  it("lists each pillar's angles and asks for one when the pillar has them", async () => {
    const usuarios = respondiendo({ teorias: [] })
    await escribirTeorias({ cliente: cliente(), cruces: [CRUCE], contexto: CONTEXTO })
    expect(usuarios[0]).toContain("  - ángulo lo-que-construyo: Lo que construyo. Mi caso a la vista.")
    expect(usuarios[0]).toContain(
      "Si el pilar que eliges tiene ángulos, pon en angulo el slug del ángulo que mejor calce con la idea; si no tiene, angulo va en null.",
    )
  })

  it("keeps an angle of the idea's pillar and drops one of another pillar, an unknown one or a missing one", async () => {
    const idea = (pilar: string, angulo?: string | null) => ({
      gancho: "g",
      tema: "t",
      pilar,
      formato: "reel",
      ...(angulo === undefined ? {} : { angulo }),
    })
    respondiendo({
      teorias: [teoria([idea("psicologia-en-la-mesa", "lo-que-construyo"), idea("psicologia-en-la-mesa", "lo-vivo")])],
    })
    const primera = await escribirTeorias({ cliente: cliente(), cruces: [CRUCE], contexto: CONTEXTO })
    expect(primera.teorias[0]?.ideas.map((i) => i.angulo)).toEqual(["lo-que-construyo", null])

    respondiendo({ teorias: [teoria([idea("mujeres-lideres", "lo-que-construyo"), idea("psicologia-en-la-mesa")])] })
    const segunda = await escribirTeorias({ cliente: cliente(), cruces: [CRUCE], contexto: CONTEXTO })
    expect(segunda.teorias[0]?.ideas.map((i) => i.angulo)).toEqual([null, null])
  })
})

describe("clasificarIdea con ángulos", () => {
  const pilares = pilaresParaElegir(PILARES_DE_PRUEBA)
  const propuesta = (pilar: string, angulo?: string) => ({
    pilar,
    formato: "Mito o realidad",
    alertas: [],
    ...(angulo === undefined ? {} : { angulo }),
  })

  it("asks for the angle and keeps one of the chosen pillar", async () => {
    const usuarios = respondiendo(propuesta("mi-nueva-partida", "pruebalo-tu"))
    const { propuesta: salida } = await clasificarIdea({
      cliente: cliente(),
      guia: "Guía.",
      gancho: "G",
      tema: "",
      pilares,
    })
    expect(salida.angulo).toBe("pruebalo-tu")
    expect(usuarios[0]).toContain("  - ángulo pruebalo-tu: Pruébalo tú.")
  })

  it("drops an angle of another pillar and reads a missing one as none", async () => {
    respondiendo(propuesta("mujeres-lideres", "pruebalo-tu"))
    expect(
      (await clasificarIdea({ cliente: cliente(), guia: "G", gancho: "G", tema: "", pilares })).propuesta.angulo,
    ).toBeNull()
    respondiendo(propuesta("mi-nueva-partida"))
    expect(
      (await clasificarIdea({ cliente: cliente(), guia: "G", gancho: "G", tema: "", pilares })).propuesta.angulo,
    ).toBeNull()
  })
})

describe("proponerPilaresPorRed con ángulos", () => {
  it("keeps an idea's angle of its pillar and drops the rest", async () => {
    respondiendo({
      temas: [],
      ideas: [
        { id: "i1", pilar: "psicologia-en-la-mesa", angulo: "lo-que-construyo", razon: "Sí." },
        { id: "i2", pilar: "psicologia-en-la-mesa", angulo: "lo-vivo", razon: "No." },
        { id: "i3", pilar: "mujeres-lideres", razon: "Sin ángulo." },
      ],
    })
    const { ideas } = await proponerPilaresPorRed({
      cliente: cliente(),
      pilares: PILARES_DE_PRUEBA,
      temas: [],
      ideas: ["i1", "i2", "i3"].map((id) => ({ id, gancho: "G", tema: "" })),
    })
    expect(ideas.map((idea) => idea.angulo)).toEqual(["lo-que-construyo", null, null])
  })
})
