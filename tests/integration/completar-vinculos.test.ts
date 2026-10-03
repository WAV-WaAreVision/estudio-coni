import { HttpResponse, http } from "msw"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { completarVinculos } from "@/lib/ingesta/completar-vinculos"
import { MAXIMO_INTENTOS_VINCULOS } from "@/lib/ingesta/vincular"
import { mantenimientoFrecuente } from "@/lib/mantenimiento/ejecutar"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"
import { pool } from "./db"
import { almacenEnMemoria, crearMaterial, deps, limpiar, TEXTO_CHILENO, URL_CLAUDE, USO } from "./procesar-comun"
import { clienteDeServicio } from "./servicio"

afterEach(limpiar)
afterAll(() => pool.end())

const URL_VOYAGE = "https://api.voyageai.com/v1/embeddings"
const vector = (valor: number) => Array.from({ length: 1024 }, () => valor)
const conLlave = { llaveVoyage: () => "pa-de-prueba" }

interface LlamadasVoyage {
  n: number
}

function simularVoyage(estado: (n: number) => number = () => 200): LlamadasVoyage {
  const llamadas: LlamadasVoyage = { n: 0 }
  servidor.use(
    http.post(URL_VOYAGE, async ({ request }) => {
      llamadas.n += 1
      const cuerpo = (await request.json()) as { input: string[] }
      const codigo = estado(llamadas.n)
      if (codigo !== 200) return HttpResponse.json({ detail: "no" }, { status: codigo })
      return HttpResponse.json({
        data: cuerpo.input.map((_, index) => ({ embedding: vector(0.5), index })),
        usage: { total_tokens: 1000 },
      })
    }),
  )
  return llamadas
}

function simularVinculos(): { n: number } {
  const llamadas = { n: 0 }
  servidor.use(
    http.post<never, { messages: { content: string }[] }>(URL_CLAUDE, async ({ request }) => {
      const cuerpo = await request.clone().json()
      const texto = cuerpo.messages[0]?.content ?? ""
      if (!texto.includes("<ficha_base>")) return undefined
      llamadas.n += 1
      const candidatas: { id: string }[] = JSON.parse(
        texto.split("<candidatas>\n")[1]?.split("\n</candidatas>")[0] ?? "[]",
      )
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              veredictos: candidatas.map((c) => ({
                id: c.id,
                tipo: "complementa",
                relevancia: 4,
                razon: "Se complementan.",
                cita_base: "Un resumen.",
                cita_candidata: "Un resumen.",
              })),
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return llamadas
}

/** A material that was already ready before the embeddings existed: a card, no vector. */
async function listoSinVector(almacen = almacenEnMemoria(), pendiente = false) {
  const id = await crearMaterial(almacen, { tipo: "documento", titulo: "Material", texto_pegado: TEXTO_CHILENO })
  await pool.query(
    "insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente) values ($1, 'Un resumen.', $2, '[]', '{}')",
    [id, JSON.stringify(["Idea uno.", "Idea dos."])],
  )
  await pool.query("update public.materiales set estado = 'listo', vinculos_pendientes = $2 where id = $1", [
    id,
    pendiente,
  ])
  return { almacen, id }
}

async function embedding(id: string) {
  const { rows } = await pool.query("select 1 from public.embeddings_ficha where material_id = $1", [id])
  return rows.length > 0
}

async function pendientes(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ v: boolean }>(
    "select vinculos_pendientes as v from public.materiales where id = $1",
    [id],
  )
  return rows[0]?.v ?? false
}

async function vinculosDe(ids: string[]): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from public.vinculos where material_a = any($1) and material_b = any($1)",
    [ids],
  )
  return rows[0]?.n ?? 0
}

async function reclamado(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ c: string | null }>(
    "select corrida_id as c from public.materiales where id = $1",
    [id],
  )
  return rows[0]?.c ?? null
}

describe("completarVinculos", () => {
  it("embeds three ready materials left behind and links them among themselves", async () => {
    const almacen = almacenEnMemoria()
    const ids = [
      (await listoSinVector(almacen)).id,
      (await listoSinVector(almacen)).id,
      (await listoSinVector(almacen)).id,
    ]
    const voyage = simularVoyage()
    simularVinculos()

    const r = await completarVinculos(await deps(almacen, conLlave), { limite: 20 })

    expect(r).toMatchObject({ procesados: 3, tope: false })
    expect(voyage.n).toBe(3)
    for (const id of ids) {
      expect(await embedding(id)).toBe(true)
      expect(await pendientes(id)).toBe(false)
      expect(await reclamado(id)).toBeNull()
    }
    expect(await vinculosDe(ids)).toBe(3)
  })

  it("retries a material flagged vinculos_pendientes that already has its vector and clears the flag", async () => {
    const { almacen, id } = await listoSinVector(undefined, true)
    const otro = await listoSinVector(almacen)
    simularVoyage()
    simularVinculos()
    await completarVinculos(await deps(almacen, conLlave), { limite: 20 })
    await pool.query("update public.materiales set vinculos_pendientes = true where id = $1", [id])
    const voyage = simularVoyage()

    const r = await completarVinculos(await deps(almacen, conLlave), { limite: 20 })

    expect(r.procesados).toBe(1)
    expect(voyage.n).toBe(0)
    expect(await pendientes(id)).toBe(false)
    expect(await pendientes(otro.id)).toBe(false)
  })

  it("keeps the flag when Voyage fails for one material and goes on with the others", async () => {
    const almacen = almacenEnMemoria()
    const ids = [
      (await listoSinVector(almacen)).id,
      (await listoSinVector(almacen)).id,
      (await listoSinVector(almacen)).id,
    ]
    simularVoyage((n) => (n === 2 ? 500 : 200))
    simularVinculos()

    const r = await completarVinculos(await deps(almacen, conLlave), { limite: 20 })

    expect(r.procesados).toBe(3)
    const con = await Promise.all(ids.map(embedding))
    expect(con.filter(Boolean)).toHaveLength(2)
    const falla = ids.filter((_, i) => !con[i])
    expect(falla).toHaveLength(1)
    expect(await pendientes(falla[0] ?? "")).toBe(true)
    for (const id of ids) expect(await reclamado(id)).toBeNull()
  })

  it("pays once when two sweeps run at the same time", async () => {
    const almacen = almacenEnMemoria()
    const ids = [(await listoSinVector(almacen)).id, (await listoSinVector(almacen)).id]
    const voyage = simularVoyage()
    simularVinculos()

    await Promise.all([
      completarVinculos(await deps(almacen, conLlave), { limite: 20 }),
      completarVinculos(await deps(almacen, conLlave), { limite: 20 }),
    ])

    expect(voyage.n).toBe(2)
    const { rows } = await pool.query<{ n: number }>(
      "select count(*)::int as n from public.gastos where proveedor = 'voyage' and clave like any($1)",
      [ids.map((id) => `material:${id}:%`)],
    )
    expect(rows[0]?.n).toBe(2)
  })

  it("stops the sweep when the monthly cap is reached", async () => {
    const almacen = almacenEnMemoria()
    const ids = [(await listoSinVector(almacen)).id, (await listoSinVector(almacen)).id]
    const voyage = simularVoyage()
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.01")
    await pool.query(
      `insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave)
       select 'anthropic', 'relleno', mes_actual, relleno, relleno, 'confirmado', $1
       from (
         select date_trunc('month', now() at time zone 'America/Santiago')::date as mes_actual,
           greatest(0.01 - (select coalesce(sum(coalesce(real_usd, estimado_usd)), 0) from public.gastos
             where mes = date_trunc('month', now() at time zone 'America/Santiago')::date
               and estado in ('reservado', 'confirmado')), 0) as relleno
       ) t`,
      [`material:${ids[0]}:relleno:${crypto.randomUUID()}`],
    )
    try {
      const r = await completarVinculos(await deps(almacen, conLlave), { limite: 20 })

      expect(r.tope).toBe(true)
      expect(voyage.n).toBe(0)
      for (const id of ids) expect(await reclamado(id)).toBeNull()
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
  })

  it("does nothing, calling no provider, when there is no Voyage key", async () => {
    const { almacen } = await listoSinVector()
    const voyage = simularVoyage()

    const r = await completarVinculos(await deps(almacen, { llaveVoyage: () => undefined }), { limite: 20 })

    expect(r.procesados).toBe(0)
    expect(voyage.n).toBe(0)
  })
})

describe("mantenimientoFrecuente y los vínculos", () => {
  const base = () => ({
    db: clienteDeServicio(),
    avisos: notificadorEnMemoria(),
    ahora: () => new Date().toISOString(),
    dispararGrabacion: async () => undefined,
    dispararProduccion: async () => undefined,
  })

  it("sweeps up to 20 materials on every run", async () => {
    const { almacen, id } = await listoSinVector()
    simularVoyage()
    simularVinculos()
    const propios = await deps(almacen, conLlave)

    const resultado = await mantenimientoFrecuente({ ...base(), vinculos: async () => propios })

    expect(resultado.vinculos.procesados).toBeGreaterThanOrEqual(1)
    expect(await embedding(id)).toBe(true)
  })

  it("skips the sweep when there are no dependencies for it (no keys)", async () => {
    const { id } = await listoSinVector()

    const resultado = await mantenimientoFrecuente({ ...base(), vinculos: async () => null })

    expect(resultado.vinculos).toEqual({ procesados: 0, tope: false })
    expect(await embedding(id)).toBe(false)
  })
})

async function intentos(id: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    "select vinculos_intentos as n from public.materiales where id = $1",
    [id],
  )
  return rows[0]?.n ?? -1
}

function simularClaude(cuerpo: () => Response): { n: number } {
  const llamadas = { n: 0 }
  servidor.use(
    http.post<never, { messages: { content: string }[] }>(URL_CLAUDE, async ({ request }) => {
      const cuerpoDelPedido = await request.clone().json()
      if (!(cuerpoDelPedido.messages[0]?.content ?? "").includes("<ficha_base>")) return undefined
      llamadas.n += 1
      return cuerpo()
    }),
  )
  return llamadas
}

const claudeCaido = () => HttpResponse.json({ error: { type: "api_error", message: "boom" } }, { status: 500 })
const claudeSeNiega = () =>
  HttpResponse.json({
    id: "msg_prueba",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [],
    stop_reason: "refusal",
    stop_sequence: null,
    usage: USO,
  })

describe("intentos de vínculos", () => {
  async function dosListos(almacen = almacenEnMemoria()) {
    const a = (await listoSinVector(almacen)).id
    const b = (await listoSinVector(almacen)).id
    return { almacen, ids: [a, b] }
  }

  it("counts each failed attempt, stops at the limit, and tells WAV once per material", async () => {
    const { almacen, ids } = await dosListos()
    simularVoyage()
    const claude = simularClaude(claudeCaido)
    const avisos = notificadorEnMemoria()
    const propios = await deps(almacen, { ...conLlave, avisos })

    for (let vuelta = 1; vuelta <= MAXIMO_INTENTOS_VINCULOS; vuelta++) {
      await completarVinculos(propios, { limite: 20 })
      for (const id of ids) expect(await intentos(id)).toBe(vuelta)
    }
    const llamadasAlLimite = claude.n
    const r = await completarVinculos(propios, { limite: 20 })

    expect(r.procesados).toBe(0)
    expect(claude.n).toBe(llamadasAlLimite)
    for (const id of ids) {
      expect(await pendientes(id)).toBe(true)
      expect(avisos.aWavEnviados.filter((a) => a.detalle.includes(id))).toHaveLength(1)
    }
  })

  it("does not alert before the limit", async () => {
    const { almacen } = await dosListos()
    simularVoyage()
    simularClaude(claudeCaido)
    const avisos = notificadorEnMemoria()

    await completarVinculos(await deps(almacen, { ...conLlave, avisos }), { limite: 20 })

    expect(avisos.aWavEnviados).toHaveLength(0)
  })

  it("treats a refusal from Claude as final: straight to the limit, with the alert", async () => {
    const { almacen, ids } = await dosListos()
    simularVoyage()
    simularClaude(claudeSeNiega)
    const avisos = notificadorEnMemoria()

    await completarVinculos(await deps(almacen, { ...conLlave, avisos }), { limite: 20 })

    for (const id of ids) {
      expect(await intentos(id)).toBe(MAXIMO_INTENTOS_VINCULOS)
      expect(avisos.aWavEnviados.filter((a) => a.detalle.includes(id))).toHaveLength(1)
    }
  })

  it("treats a Voyage configuration error (4xx) as final too", async () => {
    const { almacen, ids } = await dosListos()
    const voyage = simularVoyage(() => 401)
    const avisos = notificadorEnMemoria()
    const propios = await deps(almacen, { ...conLlave, avisos })

    await completarVinculos(propios, { limite: 20 })
    const llamadas = voyage.n
    await completarVinculos(propios, { limite: 20 })

    for (const id of ids) {
      expect(await intentos(id)).toBe(MAXIMO_INTENTOS_VINCULOS)
      expect(avisos.aWavEnviados.filter((a) => a.detalle.includes(id))).toHaveLength(1)
    }
    expect(voyage.n).toBe(llamadas)
  })

  it("resets the count when the links finally get done", async () => {
    const { almacen, ids } = await dosListos()
    simularVoyage()
    simularVinculos()
    await pool.query(
      "update public.materiales set vinculos_intentos = 2, vinculos_pendientes = true where id = any($1)",
      [ids],
    )

    await completarVinculos(await deps(almacen, conLlave), { limite: 20 })

    for (const id of ids) {
      expect(await intentos(id)).toBe(0)
      expect(await pendientes(id)).toBe(false)
    }
  })

  it("does not count the monthly cap as a failed attempt", async () => {
    const { almacen, ids } = await dosListos()
    simularVoyage()
    simularClaude(() => HttpResponse.json({}, { status: 200 }))
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.0001")
    try {
      await completarVinculos(await deps(almacen, conLlave), { limite: 20 })
      for (const id of ids) expect(await intentos(id)).toBe(0)
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
  })
})
