import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http, passthrough } from "msw"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { aplicarReclasificacion, leerElementosPorReclasificar } from "@/lib/datos/reclasificacion"
import { proponerReclasificacion } from "@/lib/pilares/proponer"
import { servidor } from "../msw"
import { CONI, pool, sinLimiteFijado } from "./db"
import { clienteDeServicio, credencialesDeServicio } from "./servicio"

afterAll(async () => {
  await pool.query("delete from public.materiales where texto_pegado = 'siembra-reclasificar'")
  await pool.query("delete from public.gastos where paso = 'reclasificar_pilares'")
  await pool.end()
})

async function materialEn(slug: string | null, titulo: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.materiales (autor_id, tipo, categoria_id, titulo, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ((select id from public.autores where tipo = 'coni'), 'documento',
             (select id from public.categorias where slug = $1), $2, 'siembra-reclasificar', now(), $3) returning id`,
    [slug, titulo, CONI],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el material")
  return id
}

const slugDe = async (id: string) =>
  (
    await pool.query<{ slug: string | null }>(
      "select c.slug from public.materiales m left join public.categorias c on c.id = m.categoria_id where m.id = $1",
      [id],
    )
  ).rows[0]?.slug ?? null

const URL_MENSAJES = "https://api.anthropic.com/v1/messages"

async function materialesEn(slug: string, cuantos: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < cuantos; i++) ids.push(await materialEn(slug, `Siembra lote ${i}`))
  return ids
}

/** A Messages API answer that assigns every item id in the request to one pillar. */
async function asignandoTodo(request: Request, modelo = "claude-sonnet-5-5"): Promise<Response> {
  const cuerpo = JSON.stringify(await request.json())
  const ids = [...cuerpo.matchAll(/\\"id\\":\\"([0-9a-f-]{36})\\"/g)].map((m) => m[1])
  return HttpResponse.json({
    id: "msg",
    type: "message",
    role: "assistant",
    model: modelo,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 500, output_tokens: 100 },
    content: [
      {
        type: "text",
        text: JSON.stringify({ asignaciones: ids.map((id) => ({ id, pilar: "ia-salud-mental", razon: "IA" })) }),
      },
    ],
  })
}

const proponer = () =>
  proponerReclasificacion({
    db: clienteDeServicio(),
    claude: new Anthropic({ apiKey: "sk-ant-prueba", maxRetries: 0 }),
    ahora: "2026-10-17T12:00:00.000Z",
    avisar: () => {},
  })

const ultimoGasto = async () =>
  (
    await pool.query<{ estado: string; real_usd: string | null }>(
      "select estado, real_usd from public.gastos where paso = 'reclasificar_pilares' order by creado_en desc limit 1",
    )
  ).rows[0]

beforeEach(sinLimiteFijado)

describe("reclasificación de pilares", () => {
  it("confirms what earlier batches cost when a later batch fails, and rethrows the failure", async () => {
    await materialesEn("pareja", 41)
    let llamadas = 0
    servidor.use(
      http.post(URL_MENSAJES, ({ request }) => {
        llamadas += 1
        if (llamadas === 1) return asignandoTodo(request)
        return HttpResponse.json({ type: "error", error: { type: "api_error", message: "caído" } }, { status: 500 })
      }),
    )
    await expect(proponer()).rejects.toThrow()
    expect(llamadas).toBe(2)
    expect(await ultimoGasto()).toEqual({ estado: "confirmado", real_usd: "0.0020" })
  })

  it("reads items of retired pillars, general and none, and leaves active pillars alone", async () => {
    const viejo = await materialEn("pareja", "Siembra viejo")
    const general = await materialEn("general", "Siembra general")
    const nuevo = await materialEn("caso-coni", "Siembra nuevo")
    const ids = (await leerElementosPorReclasificar(clienteDeServicio())).map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining([viejo, general]))
    expect(ids).not.toContain(nuevo)
  })

  it("reads every page, so nothing is cut at the API's row limit", async () => {
    const sembrados = await materialesEn("pareja", 3)
    let paginas = 0
    servidor.use(
      http.get(`${credencialesDeServicio().url}/rest/v1/materiales`, () => {
        paginas += 1
        return passthrough()
      }),
    )
    const ids = (await leerElementosPorReclasificar(clienteDeServicio(), { porPagina: 2 })).map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining(sembrados))
    expect(paginas).toBeGreaterThanOrEqual(2)
  })

  it("proposes through Claude under the monthly cap and writes nothing to the items", async () => {
    const viejo = await materialEn("deseo", "Siembra propuesta")
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        const cuerpo = JSON.stringify(await request.json())
        const ids = [...cuerpo.matchAll(/\\"id\\":\\"([0-9a-f-]{36})\\"/g)].map((m) => m[1])
        return HttpResponse.json({
          id: "msg",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 500, output_tokens: 100 },
          content: [
            {
              type: "text",
              text: JSON.stringify({ asignaciones: ids.map((id) => ({ id, pilar: "ia-salud-mental", razon: "IA" })) }),
            },
          ],
        })
      }),
    )
    const { filas, estimado, realUsd } = await proponerReclasificacion({
      db: clienteDeServicio(),
      claude: new Anthropic({ apiKey: "sk-ant-prueba", maxRetries: 0 }),
      ahora: "2026-10-17T12:00:00.000Z",
      avisar: () => {},
    })
    expect(filas.find((f) => f.id === viejo)).toMatchObject({
      tipo: "material",
      antes: "deseo",
      propuesta: "ia-salud-mental",
    })
    expect(estimado.usd).toBeGreaterThan(0)
    expect(realUsd).toBeGreaterThan(0)
    expect(await slugDe(viejo)).toBe("deseo")
    const { rows } = await pool.query(
      "select estado from public.gastos where paso = 'reclasificar_pilares' order by creado_en desc limit 1",
    )
    expect(rows[0]?.estado).toBe("confirmado")
  })

  it("prices each batch with the model that served it", async () => {
    await materialEn("deseo", "Siembra modelo")
    servidor.use(http.post(URL_MENSAJES, ({ request }) => asignandoTodo(request, "claude-opus-5-5")))
    const { estimado, realUsd } = await proponer()
    // 500 input and 100 output tokens per batch at Opus list prices (4 and 20 US$ per million).
    expect(realUsd).toBeCloseTo(0.004 * estimado.tandas, 6)
  })

  it("sends more than one batch and brings back a row for every item", async () => {
    const sembrados = await materialesEn("autoestima", 41)
    let llamadas = 0
    servidor.use(
      http.post(URL_MENSAJES, ({ request }) => {
        llamadas += 1
        return asignandoTodo(request)
      }),
    )
    const { filas, estimado } = await proponer()
    expect(estimado.tandas).toBeGreaterThanOrEqual(2)
    expect(llamadas).toBe(estimado.tandas)
    expect(new Set(filas.map((f) => f.id)).size).toBe(filas.length)
    for (const id of sembrados) expect(filas.find((f) => f.id === id)?.propuesta).toBe("ia-salud-mental")
  })

  it("stops before calling Claude when the month's limit cannot cover the estimate", async () => {
    await materialEn("bienestar", "Siembra tope")
    const { rows } = await pool.query<{ tope: string }>("select tope_mensual_usd as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    let llamadas = 0
    servidor.use(
      http.post(URL_MENSAJES, ({ request }) => {
        llamadas += 1
        return asignandoTodo(request)
      }),
    )
    try {
      await expect(proponer()).rejects.toThrow("El límite del mes no alcanza para la reclasificación.")
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [rows[0]?.tope])
    }
    expect(llamadas).toBe(0)
  })

  it("releases the reservation when Claude fails, so the cap does not count it", async () => {
    await materialEn("limites", "Siembra falla")
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({ type: "error", error: { type: "api_error", message: "caído" } }, { status: 500 }),
      ),
    )
    await expect(
      proponerReclasificacion({
        db: clienteDeServicio(),
        claude: new Anthropic({ apiKey: "sk-ant-prueba", maxRetries: 0 }),
        ahora: "2026-10-17T12:00:00.000Z",
        avisar: () => {},
      }),
    ).rejects.toThrow()
    const { rows } = await pool.query(
      "select estado from public.gastos where paso = 'reclasificar_pilares' order by creado_en desc limit 1",
    )
    expect(rows[0]?.estado).toBe("liberado")
  })

  it("skips a row whose category changes between its read and its update", async () => {
    const a = await materialEn("pareja", "Siembra carrera")
    servidor.use(
      http.patch(`${credencialesDeServicio().url}/rest/v1/materiales`, async () => {
        // Someone moves the item in Studio right after the script read it.
        await pool.query(
          "update public.materiales set categoria_id = (select id from public.categorias where slug = 'general') where id = $1",
          [a],
        )
        return passthrough()
      }),
    )
    const resultado = await aplicarReclasificacion(clienteDeServicio(), [
      { id: a, tipo: "material", antes: "pareja", propuesta: "etica-regulacion", razon: "x" },
    ])
    expect(await slugDe(a)).toBe("general")
    expect(resultado).toEqual({
      aplicadas: 0,
      saltadas: [{ id: a, motivo: "su categoría cambió: ahora es general, no pareja" }],
    })
  })

  it("applies the reviewed rows and skips a row whose category changed since", async () => {
    const a = await materialEn("pareja", "Siembra aplicar")
    const b = await materialEn("general", "Siembra cambiada")
    const resultado = await aplicarReclasificacion(clienteDeServicio(), [
      { id: a, tipo: "material", antes: "pareja", propuesta: "etica-regulacion", razon: "x" },
      { id: b, tipo: "material", antes: "pareja", propuesta: "caso-coni", razon: "y" },
    ])
    expect(await slugDe(a)).toBe("etica-regulacion")
    expect(await slugDe(b)).toBe("general")
    expect(resultado).toEqual({
      aplicadas: 1,
      saltadas: [{ id: b, motivo: "su categoría cambió: ahora es general, no pareja" }],
    })
  })
})
