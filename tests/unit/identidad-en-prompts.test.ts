// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import type { DatosDePilar } from "@/lib/dominio/pilares"
import {
  clasificarEnPilares,
  confirmarFusiones,
  escribirFicha,
  escribirTeorias,
  extraerAfirmaciones,
  guiaDeReclasificacion,
  nombrarTemas,
  proponerPilaresPorRed,
  RechazoDeClaude,
} from "@/lib/proveedores/anthropic"
import { servidor } from "../msw"

// Decision A8: Coni's identity is «Constanza del Rosario, Psicóloga-Coach PUC». No prompt calls her «sexóloga».

// The topic rule «La sexología no tiene pilar propio» is about content, not her identity: only the title is banned.
const SEXOLOGA = /sex[oó]loga/i
const IDENTIDAD = "Psicóloga-Coach PUC"

const cliente = () => new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 })

interface CuerpoMensaje {
  system: { text: string }[]
  messages: unknown
}

/** Runs one call against a refusing API and returns everything the model would have read. */
async function textoEnviado(llamada: (c: Anthropic) => Promise<unknown>): Promise<string> {
  const cuerpos: CuerpoMensaje[] = []
  servidor.use(
    http.post<never, CuerpoMensaje>("https://api.anthropic.com/v1/messages", async ({ request }) => {
      cuerpos.push(await request.json())
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: "refusal",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    }),
  )
  await expect(llamada(cliente())).rejects.toBeInstanceOf(RechazoDeClaude)
  return cuerpos.map((c) => `${c.system.map((b) => b.text).join("\n")}\n${JSON.stringify(c.messages)}`).join("\n")
}

const PILARES: DatosDePilar[] = [
  {
    id: "p-1",
    angulos: [],
    red: null,
    esCapa: false,
    slug: "vinculos",
    nombre: "Vínculos",
    nombreCorto: "Vínculos",
    descripcion: null,
    activa: true,
    orden: 1,
  },
]
const TEMA = { id: "a", nombre: "Tema a", descripcion: null, textos: ["Un texto."] }

describe("identidad de Coni en los prompts de Claude", () => {
  it("never calls her sexóloga in the re-classification guide", () => {
    expect(guiaDeReclasificacion(PILARES)).not.toMatch(SEXOLOGA)
    expect(guiaDeReclasificacion(PILARES)).toContain(IDENTIDAD)
  })

  it.each([
    [
      "pillar classification",
      (c: Anthropic) =>
        clasificarEnPilares({
          cliente: c,
          pilares: PILARES,
          elementos: [{ id: "t1", tipo: "tema", texto: "Un tema." }],
        }),
    ],
    [
      "claim extraction",
      (c: Anthropic) =>
        extraerAfirmaciones({
          cliente: c,
          tramo: {
            numero: 1,
            texto: "Un fragmento.",
            ubicacion: { pagina: 1 },
            piezas: [{ desde: 0, hasta: 13, ubicacion: { pagina: 1 } }],
          },
          autor: { nombre: "Alguien", credencial: null },
        }),
    ],
    [
      "topic naming",
      (c: Anthropic) =>
        nombrarTemas({
          cliente: c,
          grupos: [{ id: "g1", textos: ["Uno.", "Dos."] }],
          pilares: ["vinculos"],
          redes: [],
        }),
    ],
    [
      "topic merging",
      (c: Anthropic) => confirmarFusiones({ cliente: c, pares: [{ a: TEMA, b: { ...TEMA, id: "b" } }] }),
    ],
    [
      "card",
      (c: Anthropic) =>
        escribirFicha({
          cliente: c,
          titulo: "Un libro",
          autor: null,
          partes: [{ texto: "Un párrafo.", ubicacion: { pagina: 1 } }],
        }),
    ],
    [
      "theories",
      (c: Anthropic) =>
        escribirTeorias({
          cliente: c,
          cruces: [],
          contexto: { guia: "Una guía.", estrategia: [], vozPropia: [], pilares: PILARES },
        }),
    ],
    [
      "pillars per network",
      (c: Anthropic) =>
        proponerPilaresPorRed({
          cliente: c,
          pilares: PILARES,
          temas: [{ id: "t1", nombre: "Tema", descripcion: null, ideas: ["Una idea."] }],
          ideas: [{ id: "i1", gancho: "Un gancho.", tema: "" }],
        }),
    ],
  ])("states her as Psicóloga-Coach PUC and never as sexóloga in the %s prompt", async (_nombre, llamada) => {
    const texto = await textoEnviado(llamada)
    expect(texto).not.toMatch(SEXOLOGA)
    expect(texto).toContain(IDENTIDAD)
  })
})
