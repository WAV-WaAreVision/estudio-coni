import Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  crearIdeaPropia,
  type DepsIdeas,
  descartarIdea,
  descartarIdeas,
  proponerIdea,
  quitarIdea,
  restaurarIdeas,
  usarIdea,
} from "@/lib/acciones/ideas"
import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { costoClaude, MODELO_POR_TAREA } from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"
import { servidor } from "../msw"
import { CONI, pool, sinLimiteFijado } from "./db"
import { clienteDeServicio } from "./servicio"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { sembrarIdea } from "./siembra"

type Db = SupabaseClient<Database>

const URL_CLAUDE = "https://api.anthropic.com/v1/messages"
const LLAVE = "sk-ant-llave-de-coni-de-prueba"
const USO = { input_tokens: 3000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const PROPUESTA = {
  pilar: "acceso-salud-publica",
  formato: "Mito o realidad",
  alertas: [{ tipo: "líneas de ayuda", texto: "El tema roza la violencia en la pareja." }],
}

interface CuerpoMensaje {
  messages: { content: unknown }[]
  system: unknown
}

let coni: Db
let mantenedor: Db
const ideasCreadas: string[] = []

function deps(db: Db = coni): DepsIdeas {
  return {
    db,
    servicio: clienteDeServicio,
    crearClaude: (llave) => new Anthropic({ apiKey: llave, maxRetries: 0 }),
    ahora: () => new Date().toISOString(),
  }
}

async function idea(extra: { gancho?: string } = {}): Promise<string> {
  const id = await sembrarIdea(extra)
  ideasCreadas.push(id)
  return id
}

async function fila(id: string) {
  const { rows } = await pool.query("select * from public.ideas where id = $1", [id])
  return rows[0]
}

function claudeResponde(salida: unknown, extra: Record<string, unknown> = {}) {
  const pedidos: { cabeceras: Headers; cuerpo: CuerpoMensaje }[] = []
  servidor.use(
    http.post<never, CuerpoMensaje>(URL_CLAUDE, async ({ request }) => {
      pedidos.push({ cabeceras: request.headers, cuerpo: await request.json() })
      return HttpResponse.json({
        id: "msg_idea",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(salida) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
        ...extra,
      })
    }),
  )
  return pedidos
}

async function gastosDeIdeas() {
  const { rows } = await pool.query(
    "select proveedor, paso, estado, estimado_usd::float as estimado, real_usd::float as real, pieza_id from public.gastos where paso = 'idea_propia' order by id",
  )
  return rows
}

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

beforeEach(async () => {
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await pool.query("select vault.create_secret($1, 'anthropic')", [LLAVE])
})

afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await pool.query("delete from public.gastos where paso = 'idea_propia'")
  await pool.query("update public.ajustes set tope_mensual_usd = 40")
  await pool.query("delete from public.ideas where id = any($1::uuid[]) or fuentes @> '[\"Idea de Coni\"]'::jsonb", [
    ideasCreadas,
  ])
  ideasCreadas.length = 0
})

afterAll(() => pool.end())

beforeEach(sinLimiteFijado)

describe("descartarIdea", () => {
  it("discards the idea with the reason she chose and unpins it", async () => {
    const id = await idea()
    await usarIdea(deps(), id)

    expect(await descartarIdea(deps(), { ideaId: id, motivo: "repetida" })).toEqual({ ok: true })

    const guardada = await fila(id)
    expect(guardada.estado).toBe("descartada")
    expect(guardada.motivo_descarte).toBe("repetida")
    expect(guardada.fijada_en).toBeNull()
  })

  it("also lets the maintainer discard", async () => {
    const id = await idea()

    expect(await descartarIdea(deps(mantenedor), { ideaId: id, motivo: "debil" })).toEqual({ ok: true })
    expect((await fila(id)).estado).toBe("descartada")
  })

  it("asks for a reason when it is missing or unknown", async () => {
    const id = await idea()

    expect(await descartarIdea(deps(), { ideaId: id, motivo: "porque sí" })).toEqual({
      ok: false,
      error: "Elige por qué la descartas.",
    })
    expect(await descartarIdea(deps(), { ideaId: id })).toEqual({ ok: false, error: "Elige por qué la descartas." })
    expect((await fila(id)).estado).toBe("idea")
  })

  it("says the idea is gone when it was already used or discarded", async () => {
    const id = await idea()
    await pool.query("update public.ideas set estado = 'usada' where id = $1", [id])

    expect(await descartarIdea(deps(), { ideaId: id, motivo: "otro" })).toEqual({
      ok: false,
      error: "Esa idea ya no está disponible.",
    })
    expect((await fila(id)).estado).toBe("usada")
  })
})

describe("usarIdea y quitarIdea", () => {
  it("adds an idea to the week's ideas and takes it out again", async () => {
    const id = await idea()

    expect(await usarIdea(deps(), id)).toEqual({ ok: true })
    expect((await fila(id)).fijada_en).not.toBeNull()
    expect((await fila(id)).estado).toBe("idea")

    expect(await quitarIdea(deps(), id)).toEqual({ ok: true })
    expect((await fila(id)).fijada_en).toBeNull()
  })

  it("does not add an idea that was already used or discarded", async () => {
    const id = await idea()
    await pool.query("update public.ideas set estado = 'usada' where id = $1", [id])

    expect(await usarIdea(deps(), id)).toEqual({ ok: false, error: "Esa idea ya no está disponible." })
    expect((await fila(id)).fijada_en).toBeNull()
  })

  it("does not let the maintainer change the bank", async () => {
    const id = await idea()
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    expect(await usarIdea(deps(mantenedor), id)).toMatchObject({ ok: false })
    expect((await fila(id)).fijada_en).toBeNull()
  })

  it("leaves Coni's id in the audit log", async () => {
    const id = await idea()
    await usarIdea(deps(), id)

    const { rows } = await pool.query(
      "select actor_usuario from public.eventos where tabla = 'ideas' and datos ->> 'id' = $1 and operacion = 'update'",
      [id],
    )
    expect(rows.map((r) => r.actor_usuario)).toEqual([CONI])
  })
})

describe("proponerIdea", () => {
  it("proposes the pillar, format and alerts, reading the guide and Coni's key, and confirms what it cost", async () => {
    const pedidos = claudeResponde(PROPUESTA)

    const resultado = await proponerIdea(deps(), {
      gancho: "Tu pareja te revisa el celular y lo llama amor.",
      tema: "",
    })

    expect(resultado).toEqual({ ok: true, propuesta: PROPUESTA })
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]?.cabeceras.get("x-api-key")).toBe(LLAVE)
    expect(JSON.stringify(pedidos[0]?.cuerpo.system)).toContain("Línea editorial de Coni")
    expect(JSON.stringify(pedidos[0]?.cuerpo.messages[0]?.content)).toContain("Tu pareja te revisa el celular")
    expect(await gastosDeIdeas()).toMatchObject([
      {
        proveedor: "anthropic",
        estado: "confirmado",
        pieza_id: null,
        real: Number(costoClaude(USO, MODELO_POR_TAREA.clasificarIdea.modelo).toFixed(4)),
      },
    ])
  })

  it("says what is missing when Coni has not entered her Anthropic key", async () => {
    await pool.query("delete from vault.secrets where name = 'anthropic'")

    const resultado = await proponerIdea(deps(), { gancho: "Una idea propia suficientemente larga.", tema: "" })

    expect(resultado).toEqual({
      ok: false,
      error: "Para proponerte el pilar necesito tu llave de Anthropic. Agrégala en Ajustes o elige el pilar tú.",
    })
    expect(await gastosDeIdeas()).toEqual([])
  })

  it("stops at the month's limit before calling Claude", async () => {
    await pool.query("update public.ajustes set tope_mensual_usd = 0.01")
    const pedidos = claudeResponde(PROPUESTA)

    const resultado = await proponerIdea(deps(), { gancho: "Una idea propia suficientemente larga.", tema: "" })

    expect(resultado).toEqual({ ok: false, error: TEXTO_LIMITE })
    expect(pedidos).toEqual([])
  })

  it("releases the reservation and lets her choose by hand when Claude fails", async () => {
    servidor.use(http.post(URL_CLAUDE, () => HttpResponse.json({ error: { type: "api_error" } }, { status: 500 })))
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await proponerIdea(deps(), { gancho: "Una idea propia suficientemente larga.", tema: "" })

    expect(resultado).toEqual({
      ok: false,
      error: "No pude proponerte el pilar ahora. Elígelo tú y confirma las alertas.",
    })
    expect(await gastosDeIdeas()).toMatchObject([{ estado: "liberado" }])
  })

  it("rejects an idea that is empty or absurdly long without calling anyone", async () => {
    const pedidos = claudeResponde(PROPUESTA)

    expect(await proponerIdea(deps(), { gancho: "   ", tema: "" })).toMatchObject({ ok: false })
    expect(await proponerIdea(deps(), { gancho: "a".repeat(300), tema: "" })).toMatchObject({ ok: false })
    expect(pedidos).toEqual([])
  })
})

describe("crearIdeaPropia", () => {
  const entrada = {
    gancho: "Tu pareja te revisa el celular y lo llama amor.",
    tema: "Control disfrazado de cuidado.",
    formato: "Mito o realidad",
    pilar: "caso-coni",
    alertas: PROPUESTA.alertas,
  }

  it("saves the idea with the pillar and alerts she confirmed, added to the week and without a number", async () => {
    const resultado = await crearIdeaPropia(deps(), entrada)

    expect(resultado.ok).toBe(true)
    const { rows } = await pool.query("select * from public.ideas where gancho = $1", [entrada.gancho])
    ideasCreadas.push(...rows.map((r) => r.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      numero: null,
      pilar: "caso-coni",
      tema: entrada.tema,
      formato: "Mito o realidad",
      fuerza: "alta",
      estado: "idea",
      origen: "propia",
      alertas: PROPUESTA.alertas,
      fuentes: ["Idea de Coni"],
    })
    expect(rows[0].fijada_en).not.toBeNull()
  })

  it("refuses a retired pillar with the input error and inserts nothing", async () => {
    expect(await crearIdeaPropia(deps(), { ...entrada, pilar: "pareja" })).toEqual({
      ok: false,
      error: "Escribe tu idea en una o dos frases (hasta 220 letras).",
    })
    const { rows } = await pool.query("select id from public.ideas where gancho = $1", [entrada.gancho])
    expect(rows).toEqual([])
  })

  it("refuses a pillar or an alert type the app does not know, and an empty idea", async () => {
    expect(await crearIdeaPropia(deps(), { ...entrada, pilar: "negocios" })).toMatchObject({ ok: false })
    expect(await crearIdeaPropia(deps(), { ...entrada, alertas: [{ tipo: "peligro", texto: "x" }] })).toMatchObject({
      ok: false,
    })
    expect(await crearIdeaPropia(deps(), { ...entrada, gancho: " " })).toMatchObject({ ok: false })
    const { rows } = await pool.query("select id from public.ideas where gancho = $1", [entrada.gancho])
    expect(rows).toEqual([])
  })
})

describe("descartarIdeas", () => {
  it("discards the batch with one motive", async () => {
    const [a, b] = [await idea(), await idea()]
    expect(await descartarIdeas(deps(), { ideaIds: [a, b], motivo: "repetida" })).toEqual({ ok: true })
    for (const id of [a, b]) expect(await fila(id)).toMatchObject({ estado: "descartada", motivo_descarte: "repetida" })
  })

  it("says one of them is gone and discards none", async () => {
    const [a, b] = [await idea(), await idea()]
    await pool.query("update public.ideas set estado = 'usada' where id = $1", [b])
    expect(await descartarIdeas(deps(), { ideaIds: [a, b], motivo: "debil" })).toEqual({
      ok: false,
      error: "Una de esas ideas ya no está disponible. Vuelve a elegir.",
    })
    expect((await fila(a)).estado).toBe("idea")
  })

  it("asks for a reason and for one to five distinct ideas", async () => {
    const id = await idea()
    expect(await descartarIdeas(deps(), { ideaIds: [id] })).toEqual({
      ok: false,
      error: "Elige por qué las descartas.",
    })
    expect(await descartarIdeas(deps(), { ideaIds: [], motivo: "otro" })).toEqual({
      ok: false,
      error: "Elige entre una y 5 ideas distintas.",
    })
  })
})

describe("restaurarIdeas", () => {
  it("brings the batch back inside the window and says which came back", async () => {
    const [a, b] = [await idea(), await idea()]
    await descartarIdeas(deps(), { ideaIds: [a, b], motivo: "debil" })

    const resultado = await restaurarIdeas(deps(), [a, b])

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect([...resultado.restauradas].sort()).toEqual([a, b].sort())
    expect((await fila(a)).estado).toBe("idea")
  })

  it("brings nothing back after the window", async () => {
    const id = await idea()
    await descartarIdeas(deps(), { ideaIds: [id], motivo: "debil" })
    await pool.query("update public.ideas set descartada_en = now() - interval '9 seconds' where id = $1", [id])

    expect(await restaurarIdeas(deps(), [id])).toEqual({ ok: true, restauradas: [] })
  })
})
