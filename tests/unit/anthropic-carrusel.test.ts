// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { AVISO_AVATAR, AVISO_AVATAR_LINKEDIN, LINEAS_AYUDA } from "@/lib/dominio/revision"
import {
  escribirCarrusel,
  MODELO_POR_TAREA,
  RechazoDeClaude,
  revisarCarruselConClaude,
  SalidaCarrusel,
} from "@/lib/proveedores/anthropic"
import { ESCRITO_DE_PRUEBA, LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { servidor } from "../msw"

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"
const GUIA = "# Línea editorial de Coni\n\nTrata de tú. Español de Chile."
const USO = { input_tokens: 1200, output_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000 }
const IDEA = {
  pilar: { nombre: "IA y salud mental", descripcion: "Qué dice la evidencia sobre chatbots y apps." },
  gancho: "Lo que un chatbot no ve de ti",
  tema: "Lo que una pantalla no registra en un proceso terapéutico.",
  formato: "Mito o realidad",
  alertas: [{ tipo: "nota", texto: "Sin casos particulares." }],
}

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

function escribir(extra: Partial<Parameters<typeof escribirCarrusel>[0]> = {}) {
  return escribirCarrusel({
    cliente: cliente(),
    guia: GUIA,
    idea: IDEA,
    respaldo: null,
    fuentes: [],
    requiereLineasAyuda: false,
    cambio: null,
    ...extra,
  })
}

const usuario = (cuerpos: Cuerpo[]) => String(cuerpos[0]?.messages[0]?.content)

describe("SalidaCarrusel", () => {
  it("accepts a portada, four to six ideas, a closing question and a post", () => {
    expect(SalidaCarrusel.safeParse(ESCRITO_DE_PRUEBA).success).toBe(true)
  })

  it("refuses fewer than four ideas, more than six, or an empty text", () => {
    const ideas = ESCRITO_DE_PRUEBA.ideas
    expect(SalidaCarrusel.safeParse({ ...ESCRITO_DE_PRUEBA, ideas: ideas.slice(0, 3) }).success).toBe(false)
    expect(SalidaCarrusel.safeParse({ ...ESCRITO_DE_PRUEBA, ideas: [...ideas, ...ideas] }).success).toBe(false)
    expect(SalidaCarrusel.safeParse({ ...ESCRITO_DE_PRUEBA, portada: { texto: "" } }).success).toBe(false)
  })
})

describe("escribirCarrusel", () => {
  it("writes with the script writer's model and effort and caches only the guide", async () => {
    const cuerpos = respondiendo(() => mensaje(ESCRITO_DE_PRUEBA))
    await escribir()
    expect(MODELO_POR_TAREA.escribirCarrusel).toEqual(MODELO_POR_TAREA.escribirGuion)
    expect(cuerpos[0]?.model).toBe("claude-opus-5-5")
    expect(cuerpos[0]?.output_config.effort).toBe("medium")
    expect(cuerpos[0]?.system).toEqual([{ type: "text", text: GUIA, cache_control: { type: "ephemeral" } }])
    expect(Object.keys(cuerpos[0]?.output_config.format.schema.properties ?? {}).sort()).toEqual([
      "cierre",
      "ideas",
      "portada",
      "textoPost",
    ])
  })

  it("asks for a signed LinkedIn carousel with no avatar, no source line and no signature of its own", async () => {
    const cuerpos = respondiendo(() => mensaje(ESCRITO_DE_PRUEBA))
    await escribir()
    const pedido = usuario(cuerpos)
    for (const frase of [
      "carrusel de LinkedIn",
      "Constanza del Rosario",
      "entre 4 y 6",
      "entre 600 y 1.300",
      "ningún avatar",
    ]) {
      expect(pedido, frase).toContain(frase)
    }
    expect(pedido).toContain(IDEA.gancho)
    expect(pedido).toContain("Sin casos particulares.")
    expect(pedido).not.toContain(AVISO_AVATAR)
    expect(pedido).not.toContain(AVISO_AVATAR_LINKEDIN)
  })

  it("asks for the help lines word for word when the topic needs them", async () => {
    const cuerpos = respondiendo(() => mensaje(ESCRITO_DE_PRUEBA))
    await escribir({ requiereLineasAyuda: true })
    expect(usuario(cuerpos)).toContain(LINEAS_AYUDA)
  })

  it("gives her sentence and the version she read only in a change round, as data", async () => {
    const cuerpos = respondiendo(() => mensaje(ESCRITO_DE_PRUEBA))
    await escribir({
      cambio: {
        pedido: "Más corto y con un ejemplo",
        anterior: { laminas: LAMINAS_DE_PRUEBA, textoPost: TEXTO_POST_DE_PRUEBA },
      },
    })
    const pedido = usuario(cuerpos)
    expect(pedido).toContain("<pedido>\nMás corto y con un ejemplo\n</pedido>")
    expect(pedido).toContain("<version_anterior>")
    expect(pedido).toContain(LAMINAS_DE_PRUEBA[1]?.texto ?? "")
    const primera = respondiendo(() => mensaje(ESCRITO_DE_PRUEBA))
    await escribir()
    expect(usuario(primera)).not.toContain("<pedido>")
  })

  it("lists the findings to fix in a correction round", async () => {
    const cuerpos = respondiendo(() => mensaje(ESCRITO_DE_PRUEBA))
    await escribir({
      correcciones: [{ regla: "mencion_avatar", tipo: "bloquea", mensaje: "Quita la mención.", frase: "avatar" }],
    })
    expect(usuario(cuerpos)).toContain("- Quita la mención. (frase: «avatar»)")
  })

  it("returns the carousel as written and the usage", async () => {
    respondiendo(() => mensaje(ESCRITO_DE_PRUEBA))
    expect(await escribir()).toEqual({ ...ESCRITO_DE_PRUEBA, uso: USO })
  })

  it("fails with a plain retryable error when the answer breaks the schema", async () => {
    respondiendo(() => mensaje({ ...ESCRITO_DE_PRUEBA, ideas: ESCRITO_DE_PRUEBA.ideas.slice(0, 2) }))
    const error = await escribir().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
  })

  it("says Claude declined when it refuses", async () => {
    respondiendo(() => mensaje({}, { content: [], stop_reason: "refusal" }))
    await expect(escribir()).rejects.toBeInstanceOf(RechazoDeClaude)
  })
})

describe("revisarCarruselConClaude", () => {
  it("judges the numbered slides and the post with low effort and the cached guide, and only warns", async () => {
    const cuerpos = respondiendo(() =>
      mensaje({ hallazgos: [{ regla: "cifra_sin_verificar", frase: "a cualquier hora", mensaje: "Revisa el dato." }] }),
    )
    const { hallazgos } = await revisarCarruselConClaude({
      cliente: cliente(),
      guia: GUIA,
      laminas: LAMINAS_DE_PRUEBA,
      textoPost: TEXTO_POST_DE_PRUEBA,
      alertas: IDEA.alertas,
    })
    expect(cuerpos[0]?.output_config.effort).toBe("low")
    expect(cuerpos[0]?.system).toEqual([{ type: "text", text: GUIA, cache_control: { type: "ephemeral" } }])
    const pedido = usuario(cuerpos)
    expect(pedido).toContain(`1. ${LAMINAS_DE_PRUEBA[0]?.texto}`)
    expect(pedido).toContain("<texto_de_publicacion>")
    expect(hallazgos).toEqual([
      { regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "Revisa el dato.", frase: "a cualquier hora" },
    ])
  })
})
