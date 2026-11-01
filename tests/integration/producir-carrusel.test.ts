import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { leerRevision } from "@/lib/datos/revision"
import { FIRMA_DEL_CARRUSEL } from "@/lib/dominio/carrusel"
import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { type DepsProduccion, producirPieza } from "@/lib/produccion/producir"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { ESCRITO_DE_PRUEBA } from "../fixtures/carrusel"
import { servidor } from "../msw"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi } from "./sesion-coni"
import { borrarSembrado, leerFila, sembrarCarrusel, sembrarIdea } from "./siembra"

const URL_CLAUDE = "https://api.anthropic.com/v1/messages"
// 0.042 to write, 0.008 to review, as in producir.test.ts.
const USO_ESCRITURA = {
  input_tokens: 3000,
  output_tokens: 1500,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}
const USO_REVISION = {
  input_tokens: 1000,
  output_tokens: 200,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

interface Cuerpo {
  output_config: { effort: string }
  messages: { content: string }[]
}

function simular(opciones: { escrito?: (n: number) => unknown; rechaza?: boolean } = {}) {
  const escrituras: Cuerpo[] = []
  const revisiones: Cuerpo[] = []
  const responder = (salida: unknown, uso: typeof USO_ESCRITURA, extra: Record<string, unknown> = {}) =>
    HttpResponse.json({
      id: "msg",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: JSON.stringify(salida) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: uso,
      ...extra,
    })
  servidor.use(
    http.post<never, Cuerpo>(URL_CLAUDE, async ({ request }) => {
      const cuerpo = await request.json()
      if (cuerpo.output_config.effort === "low") {
        revisiones.push(cuerpo)
        return responder({ hallazgos: [] }, USO_REVISION)
      }
      escrituras.push(cuerpo)
      if (opciones.rechaza) return responder({}, USO_ESCRITURA, { content: [], stop_reason: "refusal" })
      return responder(opciones.escrito?.(escrituras.length - 1) ?? ESCRITO_DE_PRUEBA, USO_ESCRITURA)
    }),
    // No ElevenLabs or HeyGen handler: a carousel calling either would fail on an unhandled request.
  )
  return { escrituras, revisiones }
}

function deps(): DepsProduccion {
  return {
    db: clienteDeServicio(),
    avisos: notificadorEnMemoria(),
    almacen: almacenEnMemoria(),
    claude: new Anthropic({ apiKey: "sk-ant-de-prueba", maxRetries: 0 }),
    ahora: () => new Date().toISOString(),
  }
}

const piezas: string[] = []
const ideas: string[] = []

async function carruselEnEscritura(): Promise<string> {
  const idea = await sembrarIdea({ pilar: "ia-salud-mental", gancho: "Lo que un chatbot no ve de ti", estado: "usada" })
  ideas.push(idea)
  const id = await sembrarCarrusel("guion_en_proceso", { ideaId: idea })
  piezas.push(id)
  return id
}

const versiones = async (id: string) =>
  (
    await pool.query(
      "select version, origen, pedido, texto_post, laminas from public.carruseles where pieza_id = $1 order by version",
      [id],
    )
  ).rows
const gastos = async (id: string) =>
  (
    await pool.query(
      "select paso, estado, real_usd::float8 as real from public.gastos where pieza_id = $1 order by id",
      [id],
    )
  ).rows

beforeEach(() => pool.query("update public.ajustes set tope_mensual_usd = 40"))
afterAll(async () => {
  await pool.query("update public.ajustes set tope_mensual_usd = 40")
  await borrarSembrado(piezas, ideas)
  await pool.end()
})

describe("producirPieza with a carousel", () => {
  it("writes the first version, reviews it, confirms one spend and hands it to gate 1 without a voice", async () => {
    const id = await carruselEnEscritura()
    const sim = simular()

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(sim.escrituras).toHaveLength(1)
    expect(sim.revisiones).toHaveLength(1)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", audio_id: null, guion: null, texto: null })
    const [version] = await versiones(id)
    expect(version).toMatchObject({ version: 1, origen: "inicial", pedido: null })
    expect(String(version?.texto_post).endsWith(FIRMA_DEL_CARRUSEL)).toBe(true)
    expect(leerRevision((await leerFila(id)).revision)).toEqual([])
    expect(await gastos(id)).toEqual([{ paso: "carrusel", estado: "confirmado", real: 0.05 }])
  })

  it("rewrites from her pending request, with her sentence and the version she read, as cambio_texto", async () => {
    const id = await carruselEnEscritura()
    simular()
    await producirPieza(deps(), id)
    const { version } = await leerFila(id)
    const coni = await clienteDeConi()
    const pedido = await coni.rpc("pedir_cambio_de_carrusel", {
      p_pieza: id,
      p_version: version,
      p_pedido: "Más corto",
    })
    expect(pedido.error).toBeNull()
    const sim = simular()

    await producirPieza(deps(), id)

    expect(sim.escrituras[0]?.messages[0]?.content).toContain("<pedido>\nMás corto\n</pedido>")
    expect(sim.escrituras[0]?.messages[0]?.content).toContain(ESCRITO_DE_PRUEBA.ideas[0]?.texto ?? "")
    expect((await versiones(id)).map((v) => [v.version, v.origen, v.pedido])).toEqual([
      [1, "inicial", null],
      [2, "cambio_texto", "Más corto"],
    ])
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", pedido_de_cambio: null, intento: 1 })
  })

  it("asks once more when the review blocks, and keeps what still blocks for Coni to see", async () => {
    const id = await carruselEnEscritura()
    const conAvatar = { ...ESCRITO_DE_PRUEBA, portada: { texto: "Lo que mi avatar no ve" } }
    const sim = simular({ escrito: () => conAvatar })

    await producirPieza(deps(), id)

    expect(sim.escrituras).toHaveLength(2)
    expect(sim.escrituras[1]?.messages[0]?.content).toContain("CORRECCIONES")
    expect(leerRevision((await leerFila(id)).revision)).toContainEqual(
      expect.objectContaining({ regla: "mencion_avatar", tipo: "bloquea" }),
    )
  })

  it("leaves the reason and releases the spend when Claude declines", async () => {
    const id = await carruselEnEscritura()
    simular({ rechaza: true })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "rechazado" })

    expect(await leerFila(id)).toMatchObject({
      estado: "guion_en_proceso",
      explicacion: "Claude no quiso escribir este carrusel. Prueba con otra idea.",
    })
    expect(await gastos(id)).toEqual([{ paso: "carrusel", estado: "liberado", real: null }])
  })

  it("returns the version she read to gate 1 when Claude declines her change, and the attempt still counts", async () => {
    const id = await carruselEnEscritura()
    simular()
    await producirPieza(deps(), id)
    const { version } = await leerFila(id)
    const coni = await clienteDeConi()
    const pedido = await coni.rpc("pedir_cambio_de_carrusel", {
      p_pieza: id,
      p_version: version,
      p_pedido: "Más corto",
    })
    expect(pedido.error).toBeNull()
    simular({ rechaza: true })

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "rechazado" })

    expect(await leerFila(id)).toMatchObject({
      estado: "guion_por_aprobar",
      pedido_de_cambio: null,
      cambios_de_texto: 1,
      explicacion: "No pude hacer ese cambio. Puedes pedir otro o firmarlo como está.",
    })
    expect((await versiones(id)).map((v) => [v.version, v.origen])).toEqual([[1, "inicial"]])
    expect((await gastos(id)).map((g) => g.estado)).toEqual(["confirmado", "liberado"])
  })

  it("spends nothing at the month's limit and says why", async () => {
    const id = await carruselEnEscritura()
    const sim = simular()
    await pool.query("update public.ajustes set tope_mensual_usd = 0")

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "limite" })

    expect(sim.escrituras).toHaveLength(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_en_proceso", explicacion: TEXTO_LIMITE })
  })

  it("hands over a version a dead run already saved without paying again", async () => {
    const id = await carruselEnEscritura()
    simular()
    await producirPieza(deps(), id)
    // A run that died after guardar_carrusel: back to guion_en_proceso by the owner, with the same attempt and spend.
    await pool.query("update public.piezas set estado = 'guion_en_proceso', version = version + 1 where id = $1", [id])
    const sim = simular()

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "producida" })

    expect(sim.escrituras).toHaveLength(0)
    expect((await versiones(id)).map((v) => v.version)).toEqual([1])
    expect((await leerFila(id)).estado).toBe("guion_por_aprobar")
  })
})
