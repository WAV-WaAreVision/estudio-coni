import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mantenimientoFrecuente, mantenimientoNocturno } from "@/lib/mantenimiento/ejecutar"
import { AFIRMACIONES_POR_CORRIDA, type DepsMantenimientoTemas, mantenerTemas } from "@/lib/mantenimiento/temas"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"
import { CONI, pool } from "./db"
import { simularVoyage, URL_CLAUDE, USO } from "./procesar-comun"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const db = clienteDeServicio()

function deps(llave: string | null = "pa-de-prueba"): DepsMantenimientoTemas {
  return {
    db,
    almacen: almacenEnMemoria(),
    ahora: () => new Date().toISOString(),
    claude: new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
    llaveVoyage: () => llave ?? undefined,
  }
}

let autorId = ""
let materialId = ""

async function limpiarTodo() {
  autorId = ""
  materialId = ""
  await pool.query("delete from public.afirmaciones")
  await pool.query("delete from public.temas")
  await pool.query("delete from public.materiales where texto_pegado = 'mant-temas'")
  await pool.query("delete from public.autores where nombre like 'Autor mant temas%'")
  await pool.query("delete from public.gastos where clave like 'temas:%' or paso = 'embedding'")
}
beforeEach(limpiarTodo)
afterEach(limpiarTodo)

async function sinVector(cuantas: number): Promise<string[]> {
  const a = await pool.query<{ id: string }>(
    "insert into public.autores (nombre, tipo) values ('Autor mant temas', 'persona') returning id",
  )
  autorId = a.rows[0]?.id ?? ""
  const m = await pool.query<{ id: string }>(
    `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('documento', $1, 'referente', 'mant-temas', now(), $2) returning id`,
    [autorId, CONI],
  )
  materialId = m.rows[0]?.id ?? ""
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
     select $1, $2, 0, '{"pagina": 1}', 'Idea ' || n, 'cita', 'consejo', 'opinion' from generate_series(1, $3) n
     returning id`,
    [materialId, autorId, cuantas],
  )
  return rows.map((r) => r.id)
}

async function conVector(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "select count(*) as n from public.afirmaciones where vector is not null",
  )
  return Number(rows[0]?.n)
}

interface Pedido {
  messages: { content: string }[]
}

function simularClaude() {
  const llamadas = { nombres: 0, fusiones: 0 }
  servidor.use(
    http.post<never, Pedido>(URL_CLAUDE, async ({ request }) => {
      const cuerpo = await request.json()
      const usuario = cuerpo.messages[0]?.content ?? ""
      const datos = JSON.parse(usuario.split("<fuente>\n")[1]?.split("\n</fuente>")[0] ?? "{}")
      let salida: unknown
      if (Array.isArray(datos.grupos)) {
        llamadas.nombres += 1
        salida = {
          temas: (datos.grupos as { id: string }[]).map((g, i) => ({
            id: g.id,
            nombre: `Tema de mantenimiento ${i}`,
            descripcion: "Descripción.",
            pilar: "deseo",
          })),
        }
      } else {
        llamadas.fusiones += 1
        salida = { pares: [] }
      }
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: JSON.stringify(salida) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return llamadas
}

async function conTopeChico<T>(fn: () => Promise<T>): Promise<T> {
  const { rows } = await pool.query<{ t: string }>("select tope_mensual_usd::text as t from public.ajustes")
  const original = rows[0]?.t ?? "100"
  await pool.query("update public.ajustes set tope_mensual_usd = 0.00001")
  try {
    return await fn()
  } finally {
    await pool.query("update public.ajustes set tope_mensual_usd = $1", [original])
  }
}

describe("mantenerTemas", () => {
  it("embeds the claims without a vector, assigns them and forms topics from the pending ones", async () => {
    await sinVector(3)
    const voyage = simularVoyage()
    const claude = simularClaude()

    const resultado = await mantenerTemas(deps())

    expect(voyage.n).toBe(1)
    expect(claude.nombres).toBe(1)
    expect(resultado).toMatchObject({ tope: false, embebidas: 3 })
    expect(await conVector()).toBe(3)
    const { rows } = await pool.query<{ n: string }>(
      "select count(*) as n from public.afirmaciones where tema_id is not null",
    )
    expect(Number(rows[0]?.n)).toBe(3)
  })

  it("embeds at most 200 claims per run, in requests of at most 128", async () => {
    await sinVector(AFIRMACIONES_POR_CORRIDA + 1)
    const voyage = simularVoyage()
    simularClaude()

    const resultado = await mantenerTemas(deps())

    expect(resultado.embebidas).toBe(AFIRMACIONES_POR_CORRIDA)
    expect(voyage.entradas.map((e) => e.length)).toEqual([128, 72])
    expect(await conVector()).toBe(AFIRMACIONES_POR_CORRIDA)
  })

  it("skips the embeddings without a Voyage key, with no failure, and still forms topics from claims that have a vector", async () => {
    await sinVector(3)
    const voyage = simularVoyage()
    simularClaude()

    const resultado = await mantenerTemas(deps(null))

    expect(voyage.n).toBe(0)
    expect(resultado).toMatchObject({ tope: false, embebidas: 0 })
    expect(await conVector()).toBe(0)
  })

  it("survives a Voyage outage: the claims stay without a vector and topics still form from those that have one", async () => {
    const ids = await sinVector(5)
    const vector = `[${Array.from({ length: 1024 }, () => 0.5).join(",")}]`
    await pool.query("update public.afirmaciones set vector = $1::extensions.vector where id = any($2::uuid[])", [
      vector,
      ids.slice(0, 3),
    ])
    simularVoyage(500)
    const claude = simularClaude()
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const resultado = await mantenerTemas(deps())

    expect(resultado).toMatchObject({ tope: false, embebidas: 0 })
    expect(claude.nombres).toBe(1)
    expect(await conVector()).toBe(3)
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("2"))
    aviso.mockRestore()
  })

  it("returns tope without failing when the monthly cap is reached", async () => {
    await sinVector(3)
    simularVoyage()
    simularClaude()

    const resultado = await conTopeChico(() => mantenerTemas(deps()))

    expect(resultado.tope).toBe(true)
    expect(await conVector()).toBe(0)
  })
})

describe("maintenance runs", () => {
  const base = () => ({
    db,
    avisos: notificadorEnMemoria(),
    ahora: () => new Date().toISOString(),
  })

  it("runs the topics job inside the ten-minute maintenance, without any links job", async () => {
    await sinVector(3)
    simularVoyage()
    simularClaude()

    const resultado = await mantenimientoFrecuente({
      ...base(),
      dispararGrabacion: async () => undefined,
      dispararProduccion: async () => undefined,
      temas: async () => deps(),
    })

    expect(resultado.temas).toMatchObject({ tope: false, embebidas: 3 })
    expect("vinculos" in resultado).toBe(false)
  })

  it("skips the topics job when its builder says there is nothing to work with", async () => {
    const resultado = await mantenimientoFrecuente({
      ...base(),
      dispararGrabacion: async () => undefined,
      dispararProduccion: async () => undefined,
      temas: async () => null,
    })

    expect(resultado.temas).toEqual({ omitido: true })
  })

  it("runs the merges inside the nightly maintenance", async () => {
    const claude = simularClaude()
    const resultado = await mantenimientoNocturno({
      ...base(),
      almacen: almacenEnMemoria(),
      volcarBase: async () => new Uint8Array([1, 2, 3]),
      temas: async () => deps(),
    })

    expect(resultado.fusiones).toMatchObject({ tope: false, fusionados: 0 })
    expect(claude.fusiones).toBe(0)
  })

  it("lets a failing topics job through enSerie without stopping the rest", async () => {
    const error = await mantenimientoFrecuente({
      ...base(),
      dispararGrabacion: async () => undefined,
      dispararProduccion: async () => undefined,
      temas: async () => {
        throw new Error("sin llaves")
      },
    }).then(
      () => new Error("se esperaba un rechazo"),
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    )

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toContain("temas: sin llaves")
  })
})
