import { HttpResponse, http } from "msw"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { MOTIVO_TOPE } from "@/lib/ingesta/procesar"
import { alFallarTeoria, armarTeoria } from "@/lib/ingesta/teoria"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"
import { pool } from "./db"
import {
  almacenEnMemoria,
  COSTO_CLAUDE,
  crearMaterial,
  deps,
  limpiar,
  TEXTO_CHILENO,
  URL_CLAUDE,
  USO,
} from "./procesar-comun"
import { clienteDeServicio } from "./servicio"

const teorias: string[] = []

afterEach(async () => {
  for (const id of teorias.splice(0)) {
    await pool.query("delete from public.gastos where clave like $1", [`teoria:${id}:%`])
    await pool.query("delete from public.teorias where id = $1", [id])
  }
  await limpiar()
})
afterAll(() => pool.end())

async function conFicha(titulo: string, ideas: string[], citas: string[]): Promise<string> {
  const id = await crearMaterial(almacenEnMemoria(), { tipo: "documento", titulo, texto_pegado: TEXTO_CHILENO })
  await pool.query("update public.materiales set estado = 'listo' where id = $1", [id])
  await pool.query(
    "insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente) values ($1, $2, $3, $4, '{}')",
    [
      id,
      `Resumen de ${titulo}.`,
      JSON.stringify(ideas),
      JSON.stringify(citas.map((texto) => ({ texto, ubicacion: { pagina: 1 } }))),
    ],
  )
  return id
}

async function teoriaDe(materiales: string[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("insert into public.teorias default values returning id")
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la teoría")
  teorias.push(id)
  for (const m of materiales) {
    await pool.query("insert into public.teoria_fuentes (teoria_id, material_id) values ($1, $2)", [id, m])
  }
  return id
}

interface FilaTeoria {
  estado: string
  motivo_fallo: string | null
  motivo_codigo: string | null
  titulo: string | null
  tesis: string | null
  argumentos: { materialId: string; cita: string; ubicacion: string }[] | null
  contradicciones: { materialIds: string[]; descripcion: string }[] | null
}

async function teoria(id: string): Promise<FilaTeoria> {
  const { rows } = await pool.query<FilaTeoria>(
    "select estado, motivo_fallo, motivo_codigo, titulo, tesis, argumentos, contradicciones from public.teorias where id = $1",
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error("No existe la teoría")
  return fila
}

async function gastosDe(id: string) {
  const { rows } = await pool.query<{ proveedor: string; paso: string; estado: string; real: number | null }>(
    "select proveedor, paso, estado, real_usd::float8 as real from public.gastos where clave like $1 order by id",
    [`teoria:${id}:%`],
  )
  return rows
}

function simularTeoria(opciones: { fallar?: boolean; argumentos?: unknown[] }, ids: [string, string]) {
  const llamadas = { n: 0, pedidos: [] as string[] }
  servidor.use(
    http.post<never, { messages: { content: string }[] }>(URL_CLAUDE, async ({ request }) => {
      llamadas.n += 1
      llamadas.pedidos.push((await request.json()).messages[0]?.content ?? "")
      if (opciones.fallar) return HttpResponse.json({ error: { type: "api_error", message: "boom" } }, { status: 500 })
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              titulo: "El deseo se conversa",
              tesis: "El deseo cambia y hablarlo cuida a la pareja.",
              argumentos: opciones.argumentos ?? [
                { material_id: ids[0], aporte: "Dice que el deseo no es lineal.", cita: "El deseo no es lineal." },
                { material_id: ids[1], aporte: "Dice que conversar cuida.", cita: "Conversar es cuidar." },
              ],
              contradicciones: [{ material_ids: ids, descripcion: "Chocan en el ritmo." }],
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

async function conDosFuentes() {
  const a = await conFicha("Libro del deseo", ["El deseo no es lineal."], [])
  const b = await conFicha("Charla de pareja", ["Conversar con calma baja la tensión."], ["Conversar es cuidar."])
  const id = await teoriaDe([a, b])
  return { a, b, id, ids: [a, b] as [string, string] }
}

describe("armarTeoria", () => {
  it("writes the synthesis as a borrador, stores it and pays Claude once under the paso teoria", async () => {
    const { id, ids } = await conDosFuentes()
    const claude = simularTeoria({}, ids)
    const almacen = almacenEnMemoria()

    const resultado = await armarTeoria(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "borrador" })
    const fila = await teoria(id)
    expect(fila).toMatchObject({ estado: "borrador", motivo_fallo: null, titulo: "El deseo se conversa" })
    expect(fila.argumentos?.map((a) => [a.materialId, a.cita, a.ubicacion])).toEqual([
      [ids[0], "El deseo no es lineal.", "idea 1"],
      [ids[1], "Conversar es cuidar.", "cita 1"],
    ])
    expect(fila.contradicciones).toEqual([{ materialIds: ids, descripcion: "Chocan en el ritmo." }])
    expect(claude.n).toBe(1)
    expect(almacen.obtener(`teorias/${id}/sintesis.json`)).toBeDefined()
    expect(await gastosDe(id)).toEqual([
      { proveedor: "anthropic", paso: "teoria", estado: "confirmado", real: COSTO_CLAUDE },
    ])
  })

  it("does not pay again when a retry finds the stored synthesis", async () => {
    const { id, ids } = await conDosFuentes()
    const claude = simularTeoria({}, ids)
    const almacen = almacenEnMemoria()
    await armarTeoria(await deps(almacen), id)
    await pool.query("update public.teorias set estado = 'sintetizando', titulo = null where id = $1", [id])

    await armarTeoria(await deps(almacen), id)

    expect(claude.n).toBe(1)
    expect((await teoria(id)).estado).toBe("borrador")
    expect(await gastosDe(id)).toHaveLength(1)
  })

  it("leaves a theory that is no longer sintetizando as it is, without calling Claude", async () => {
    const { id, ids } = await conDosFuentes()
    const claude = simularTeoria({}, ids)
    await pool.query(
      "update public.teorias set estado = 'guardada', titulo = 'Mía', tesis = 'Mi tesis' where id = $1",
      [id],
    )

    const resultado = await armarTeoria(await deps(almacenEnMemoria()), id)

    expect(resultado).toEqual({ resultado: "ya_resuelta" })
    expect(claude.n).toBe(0)
    expect((await teoria(id)).titulo).toBe("Mía")
  })

  it("does nothing, and spends nothing, when the theory was deleted", async () => {
    const { id, ids } = await conDosFuentes()
    const claude = simularTeoria({}, ids)
    await pool.query("delete from public.teorias where id = $1", [id])

    expect(await armarTeoria(await deps(almacenEnMemoria()), id)).toEqual({ resultado: "borrada" })
    expect(claude.n).toBe(0)
  })

  it("sends the cards of the sources, as data, and nothing else", async () => {
    const { id, ids } = await conDosFuentes()
    const claude = simularTeoria({}, ids)

    await armarTeoria(await deps(almacenEnMemoria()), id)

    const pedido = claude.pedidos[0] ?? ""
    expect(pedido).toContain("Resumen de Libro del deseo.")
    expect(pedido).toContain("Conversar es cuidar.")
    for (const m of ids) expect(pedido).toContain(m)
  })

  it("marks the theory fallida with the reason when the cards cannot back it, and does not throw", async () => {
    const { id, ids } = await conDosFuentes()
    simularTeoria({ argumentos: [{ material_id: ids[0], aporte: "x", cita: "Inventada." }] }, ids)

    const resultado = await armarTeoria(await deps(almacenEnMemoria()), id)

    expect(resultado.resultado).toBe("fallida")
    const fila = await teoria(id)
    expect(fila.estado).toBe("fallida")
    expect(fila.motivo_fallo).toContain("No encontré suficiente apoyo")
    expect(fila.motivo_codigo).toBe("sin_sustento")
    expect((await gastosDe(id))[0]).toMatchObject({ estado: "confirmado" })
  })

  it("marks the theory fallida when a source was deleted and fewer than two remain", async () => {
    const { id, a, ids } = await conDosFuentes()
    const claude = simularTeoria({}, ids)
    await pool.query("delete from public.materiales where id = $1", [a])

    const resultado = await armarTeoria(await deps(almacenEnMemoria()), id)

    expect(resultado.resultado).toBe("fallida")
    expect(await teoria(id)).toMatchObject({ motivo_codigo: "error" })
    expect((await teoria(id)).motivo_fallo).toContain("menos de dos fuentes")
    expect(claude.n).toBe(0)
  })

  it("releases the reservation and throws when Claude fails, so Trigger.dev retries", async () => {
    const { id, ids } = await conDosFuentes()
    simularTeoria({ fallar: true }, ids)

    await expect(armarTeoria(await deps(almacenEnMemoria()), id)).rejects.toThrow()

    expect((await teoria(id)).estado).toBe("sintetizando")
    expect(await gastosDe(id)).toEqual([{ proveedor: "anthropic", paso: "teoria", estado: "liberado", real: null }])
  })

  it("marks the theory fallida with the cap message when the month's cap is reached", async () => {
    const { id, ids } = await conDosFuentes()
    const claude = simularTeoria({}, ids)
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.0001")
    try {
      expect(await armarTeoria(await deps(almacenEnMemoria()), id)).toEqual({ resultado: "tope" })
      expect(await teoria(id)).toMatchObject({ estado: "fallida", motivo_fallo: MOTIVO_TOPE, motivo_codigo: "tope" })
      expect(claude.n).toBe(0)
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
  })
})

describe("reintentar tras fallar", () => {
  it("synthesizes on the retry after the cap stopped it: the cap failure is not kept in the store", async () => {
    const { id, ids } = await conDosFuentes()
    const claude = simularTeoria({}, ids)
    const almacen = almacenEnMemoria()
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.0001")
    try {
      expect(await armarTeoria(await deps(almacen), id)).toEqual({ resultado: "tope" })
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
    await pool.query(
      "update public.teorias set estado = 'sintetizando', motivo_fallo = null, motivo_codigo = null where id = $1",
      [id],
    )

    expect(await armarTeoria(await deps(almacen), id)).toEqual({ resultado: "borrador" })
    expect(claude.n).toBe(1)
  })
})

describe("alFallarTeoria", () => {
  it("marks a waiting theory fallida with a generic reason and tells WAV", async () => {
    const { id } = await conDosFuentes()
    const avisos = notificadorEnMemoria()

    await alFallarTeoria(
      { db: clienteDeServicio(), avisos },
      { teoriaId: id, corrida: "run_1", error: new Error("boom") },
    )

    expect(await teoria(id)).toMatchObject({
      estado: "fallida",
      motivo_fallo: "No pude armar la teoría. WAV ya está revisando.",
      motivo_codigo: "error",
    })
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("never undoes a theory that already has its result", async () => {
    const { id } = await conDosFuentes()
    await pool.query("update public.teorias set estado = 'borrador', titulo = 'T', tesis = 'x' where id = $1", [id])

    await alFallarTeoria(
      { db: clienteDeServicio(), avisos: notificadorEnMemoria() },
      { teoriaId: id, corrida: "run_1", error: new Error("boom") },
    )

    expect((await teoria(id)).estado).toBe("borrador")
  })
})
