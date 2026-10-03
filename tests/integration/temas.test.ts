import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { mediaNormalizada, parsearVector } from "@/lib/ingesta/agrupar"
import {
  asignarATemas,
  formarTemas,
  fusionarTemas,
  MAXIMO_PENDIENTES_POR_CORRIDA,
  recalcularTema,
  UMBRAL_TEMA,
} from "@/lib/ingesta/temas"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { servidor } from "../msw"
import { asumir, CONI, como, comoConi, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { URL_CLAUDE, USO } from "./procesar-comun"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const db = clienteDeServicio()

function deps() {
  return {
    db,
    almacen: almacenEnMemoria(),
    ahora: () => new Date().toISOString(),
    claude: new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
  }
}

/** A unit vector with the given components (the rest zero). */
function vec(componentes: Record<number, number>): number[] {
  const v = Array.from({ length: 1024 }, () => 0)
  for (const [i, x] of Object.entries(componentes)) v[Number(i)] = x
  const norma = Math.hypot(...v)
  return v.map((x) => x / norma)
}
const texto = (v: number[]) => `[${v.join(",")}]`

let autorId = ""
let materialId = ""

async function limpiarTodo() {
  autorId = ""
  materialId = ""
  await pool.query("delete from public.afirmaciones")
  await pool.query("delete from public.temas")
  await pool.query("delete from public.materiales where texto_pegado = 'temas-vivos'")
  await pool.query("delete from public.autores where nombre like 'Autor temas%'")
  await pool.query("delete from public.gastos where clave like 'temas:%'")
}
beforeEach(limpiarTodo)
afterEach(limpiarTodo)

async function preparar() {
  const a = await pool.query<{ id: string }>(
    "insert into public.autores (nombre, tipo) values ('Autor temas', 'persona') returning id",
  )
  autorId = a.rows[0]?.id ?? ""
  const m = await pool.query<{ id: string }>(
    `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('documento', $1, 'referente', 'temas-vivos', now(), $2) returning id`,
    [autorId, CONI],
  )
  materialId = m.rows[0]?.id ?? ""
}

async function afirmacion(
  v: number[] | null,
  extra: { tema?: string | null; excluida?: boolean; texto?: string; creada?: string } = {},
): Promise<string> {
  if (!autorId) await preparar()
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, vector, excluida, creada_en)
     values ($1, $2, 0, '{"pagina": 1}', $3, 'cita', 'consejo', 'opinion', $4, $5::extensions.vector, $6, coalesce($7::timestamptz, now())) returning id`,
    [
      materialId,
      autorId,
      extra.texto ?? "Una idea.",
      extra.tema ?? null,
      v ? texto(v) : null,
      extra.excluida ?? false,
      extra.creada ?? null,
    ],
  )
  return rows[0]?.id ?? ""
}

async function tema(nombre: string, v: number[], extra: { alias?: string[]; fusionado?: string } = {}) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.temas (nombre, descripcion, centroide, alias, fusionado_en)
     values ($1, 'd', $2::extensions.vector, $3, $4) returning id`,
    [nombre, texto(v), extra.alias ?? [], extra.fusionado ?? null],
  )
  return rows[0]?.id ?? ""
}

async function centroideDe(id: string): Promise<number[]> {
  const { rows } = await pool.query<{ c: string }>("select centroide::text as c from public.temas where id = $1", [id])
  return parsearVector(rows[0]?.c ?? "")
}

async function temaDe(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ t: string | null }>(
    "select tema_id as t from public.afirmaciones where id = $1",
    [id],
  )
  return rows[0]?.t ?? null
}

interface Pedido {
  messages: { content: string }[]
}

/** Claude answers by the kind of prompt: names for `nombrarTemas`, verdicts for `confirmarFusiones`. */
function simularClaude(opciones: { nombre?: (i: number) => string; mismo?: boolean; pilar?: string } = {}) {
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
            nombre: opciones.nombre ? opciones.nombre(i) : `Tema ${i}`,
            descripcion: "Descripción.",
            pilar: opciones.pilar ?? "deseo",
          })),
        }
      } else {
        llamadas.fusiones += 1
        salida = {
          pares: (datos.pares as { a: { id: string }; b: { id: string } }[]).map((p) => ({
            a: p.a.id,
            b: p.b.id,
            mismo: opciones.mismo ?? true,
          })),
        }
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

describe("asignarATemas", () => {
  it("puts a claim in the nearest topic and moves the centroid by (c*n + v)/(n+1), normalized", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    await afirmacion(vec({ 0: 1 }), { tema: t })
    const nueva = vec({ 0: 0.8, 1: 0.6 })
    const id = await afirmacion(nueva)
    const resultado = await asignarATemas(deps(), [id])
    expect(await temaDe(id)).toBe(t)
    expect(resultado).toEqual({ asignadas: 1, pendientes: 0 })
    const esperado = vec({ 0: 1 + 0.8, 1: 0.6 })
    const c = await centroideDe(t)
    expect(c[0]).toBeCloseTo(esperado[0] ?? 0, 4)
    expect(c[1]).toBeCloseTo(esperado[1] ?? 0, 4)
  })

  it("leaves a claim below the threshold pending", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    const id = await afirmacion(vec({ 5: 1 }))
    const resultado = await asignarATemas(deps(), [id])
    expect(await temaDe(id)).toBeNull()
    expect(resultado).toEqual({ asignadas: 0, pendientes: 1 })
    expect((await centroideDe(t))[0]).toBeCloseTo(1)
    expect(UMBRAL_TEMA).toBe(0.78)
  })

  it("skips claims without a vector, already in a topic, or excluded", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    const otro = await tema("Otro", vec({ 7: 1 }))
    const sinVector = await afirmacion(null)
    const yaTiene = await afirmacion(vec({ 0: 1 }), { tema: otro })
    const excluida = await afirmacion(vec({ 0: 1 }), { excluida: true })
    await asignarATemas(deps(), [sinVector, yaTiene, excluida])
    expect(await temaDe(sinVector)).toBeNull()
    expect(await temaDe(yaTiene)).toBe(otro)
    expect(await temaDe(excluida)).toBeNull()
    expect((await centroideDe(t))[0]).toBeCloseTo(1)
  })

  it("never joins a topic that was merged into another", async () => {
    const vivo = await tema("Vivo", vec({ 3: 1 }))
    await tema("Absorbido", vec({ 0: 1 }), { fusionado: vivo })
    const id = await afirmacion(vec({ 0: 1 }))
    await asignarATemas(deps(), [id])
    expect(await temaDe(id)).toBeNull()
  })
})

describe("formarTemas", () => {
  async function dosGrupos() {
    const a = [
      await afirmacion(vec({ 0: 1 })),
      await afirmacion(vec({ 0: 1, 1: 0.1 })),
      await afirmacion(vec({ 0: 1, 2: 0.1 })),
      await afirmacion(vec({ 0: 1, 3: 0.1 })),
    ]
    const b = [
      await afirmacion(vec({ 10: 1 })),
      await afirmacion(vec({ 10: 1, 11: 0.1 })),
      await afirmacion(vec({ 10: 1, 12: 0.1 })),
    ]
    const chico = [await afirmacion(vec({ 20: 1 })), await afirmacion(vec({ 20: 1, 21: 0.1 }))]
    return { a, b, chico }
  }

  it("creates a named topic per group of 3 or more, assigns its claims and leaves smaller groups pending", async () => {
    const { a, b, chico } = await dosGrupos()
    const llamadas = simularClaude({ nombre: (i) => `Tema nuevo ${i}` })
    const resultado = await formarTemas(deps())
    expect(llamadas.nombres).toBe(1)
    expect(resultado).toMatchObject({ tope: false, creados: 2, pendientes: 2 })
    const { rows } = await pool.query<{ id: string; categoria: string | null }>(
      "select t.id, c.slug as categoria from public.temas t left join public.categorias c on c.id = t.categoria_id order by t.nombre",
    )
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.categoria === "deseo")).toBe(true)
    const temasA = new Set(await Promise.all(a.map(temaDe)))
    const temasB = new Set(await Promise.all(b.map(temaDe)))
    expect(temasA.size).toBe(1)
    expect(temasB.size).toBe(1)
    expect([...temasA][0]).not.toBe([...temasB][0])
    expect(await Promise.all(chico.map(temaDe))).toEqual([null, null])
  })

  it("gives the topic the centroid of its group", async () => {
    const { b } = await dosGrupos()
    simularClaude()
    await formarTemas(deps())
    const c = await centroideDe((await temaDe(b[0] ?? "")) ?? "")
    // The group around axis 10: the centroid points there, with length 1.
    expect(c[10]).toBeGreaterThan(0.99)
    expect(Math.hypot(...c)).toBeCloseTo(1, 4)
  })

  it("pays through the cap: provider anthropic, paso temas, key temas:formar:<uuid>, confirmed", async () => {
    await dosGrupos()
    simularClaude()
    await formarTemas(deps())
    const { rows } = await pool.query<{ proveedor: string; paso: string; clave: string; estado: string }>(
      "select proveedor, paso, clave, estado from public.gastos where clave like 'temas:%'",
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ proveedor: "anthropic", paso: "temas", estado: "confirmado" })
    expect(rows[0]?.clave).toMatch(/^temas:formar:[0-9a-f-]{36}$/)
  })

  it("makes no call and creates nothing when no group reaches the minimum", async () => {
    await afirmacion(vec({ 0: 1 }))
    await afirmacion(vec({ 0: 1, 1: 0.1 }))
    const llamadas = simularClaude()
    const resultado = await formarTemas(deps())
    expect(llamadas.nombres).toBe(0)
    expect(resultado).toMatchObject({ tope: false, creados: 0, pendientes: 2 })
  })

  it("never forms topics from excluded claims, claims without a vector or claims already in a topic", async () => {
    const t = await tema("Ya existe", vec({ 30: 1 }))
    await afirmacion(vec({ 0: 1 }), { excluida: true })
    await afirmacion(vec({ 0: 1, 1: 0.1 }), { excluida: true })
    await afirmacion(vec({ 0: 1, 2: 0.1 }), { excluida: true })
    await afirmacion(null)
    await afirmacion(vec({ 0: 1 }), { tema: t })
    const llamadas = simularClaude()
    const resultado = await formarTemas(deps())
    expect(llamadas.nombres).toBe(0)
    expect(resultado.creados).toBe(0)
  })

  it("joins the existing active topic when the name is the same, normalized, instead of duplicating it", async () => {
    const existente = await tema("Deseo Espontáneo", vec({ 40: 1 }))
    const { a } = await dosGrupos()
    simularClaude({ nombre: (i) => (i === 0 ? "  deseo espontaneo " : "Otro tema") })
    const resultado = await formarTemas(deps())
    const { rows } = await pool.query("select id from public.temas")
    expect(rows).toHaveLength(2)
    expect(resultado).toMatchObject({ creados: 1, unidos: 1 })
    const destinos = new Set(await Promise.all(a.map(temaDe)))
    const grupos = await Promise.all(a.map(temaDe))
    // Whichever group got the first name joined the existing topic; the centroid was recomputed from its claims.
    expect(destinos.size).toBeLessThanOrEqual(1)
    expect(grupos.every((g) => g !== null)).toBe(true)
    const c = await centroideDe(existente)
    expect(Math.hypot(...c)).toBeCloseTo(1, 4)
  })

  it("follows a merged-away name to the topic that absorbed it", async () => {
    const vivo = await tema("Vivo", vec({ 40: 1 }))
    await tema("Nombre viejo", vec({ 41: 1 }), { fusionado: vivo, alias: [] })
    await dosGrupos()
    simularClaude({ nombre: (i) => (i === 0 ? "Nombre viejo" : "Otro tema") })
    await formarTemas(deps())
    const { rows } = await pool.query<{ n: number }>(
      "select count(*)::int as n from public.afirmaciones where tema_id = $1",
      [vivo],
    )
    expect(rows[0]?.n).toBeGreaterThanOrEqual(3)
  })

  it("reads the newest pending claims first, so old singletons do not starve a new group", async () => {
    await afirmacion(vec({ 0: 1 }))
    await pool.query(
      `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, vector, creada_en)
       select $1, $2, 0, '{"pagina": 1}', 'Vieja ' || n, 'cita', 'consejo', 'opinion',
         (select ('[' || string_agg(case when g = n then '1' else '0' end, ',') || ']')::extensions.vector
            from generate_series(1, 1024) g),
         now() - interval '30 days' - n * interval '1 minute'
       from generate_series(100, $3::int + 99) n`,
      [materialId, autorId, MAXIMO_PENDIENTES_POR_CORRIDA],
    )
    await afirmacion(vec({ 0: 1, 1: 0.1 }))
    await afirmacion(vec({ 0: 1, 2: 0.1 }))
    simularClaude({ nombre: () => "Grupo nuevo" })
    const resultado = await formarTemas(deps())
    expect(resultado.creados).toBe(1)
  })

  it("takes at most the maximum of pending claims per run", async () => {
    expect(MAXIMO_PENDIENTES_POR_CORRIDA).toBe(500)
  })

  it("stops without throwing when the monthly cap is reached, and leaves the claims pending", async () => {
    await dosGrupos()
    simularClaude()
    const resultado = await conTopeChico(() => formarTemas(deps()))
    expect(resultado.tope).toBe(true)
    const { rows } = await pool.query("select id from public.temas")
    expect(rows).toHaveLength(0)
    const { rows: libres } = await pool.query("select id from public.afirmaciones where tema_id is null")
    expect(libres).toHaveLength(9)
  })
})

describe("fusionarTemas", () => {
  async function dosParecidos() {
    const grande = await tema("Deseo bajo", vec({ 0: 1 }))
    const chico = await tema("Poco deseo", vec({ 0: 1, 1: 0.2 }))
    const g = [await afirmacion(vec({ 0: 1 }), { tema: grande }), await afirmacion(vec({ 0: 1 }), { tema: grande })]
    const c = [await afirmacion(vec({ 0: 1, 1: 0.2 }), { tema: chico })]
    return { grande, chico, g, c }
  }

  it("merges a confirmed pair into the topic with more claims, as alias, with the centroid recomputed", async () => {
    const { grande, chico, g, c } = await dosParecidos()
    const llamadas = simularClaude({ mismo: true })
    const resultado = await fusionarTemas(deps())
    expect(llamadas.fusiones).toBe(1)
    expect(resultado).toMatchObject({ tope: false, fusionados: 1 })
    expect(await Promise.all([...g, ...c].map(temaDe))).toEqual([grande, grande, grande])
    const { rows } = await pool.query<{ id: string; alias: string[]; fusionado_en: string | null }>(
      "select id, alias, fusionado_en from public.temas",
    )
    const ganador = rows.find((r) => r.id === grande)
    const absorbido = rows.find((r) => r.id === chico)
    expect(ganador?.alias).toContain("Poco deseo")
    expect(ganador?.fusionado_en).toBeNull()
    expect(absorbido?.fusionado_en).toBe(grande)
    const esperado = mediaNormalizada([vec({ 0: 1 }), vec({ 0: 1 }), vec({ 0: 1, 1: 0.2 })])
    const centro = await centroideDe(grande)
    expect(centro[0]).toBeCloseTo(esperado[0] ?? 0, 3)
    expect(centro[1]).toBeCloseTo(esperado[1] ?? 0, 3)
  })

  it("keeps the older topic when both have the same number of claims", async () => {
    const viejo = await tema("Viejo", vec({ 0: 1 }))
    const nuevo = await tema("Nuevo", vec({ 0: 1, 1: 0.1 }))
    await afirmacion(vec({ 0: 1 }), { tema: viejo })
    await afirmacion(vec({ 0: 1 }), { tema: nuevo })
    simularClaude({ mismo: true })
    await fusionarTemas(deps())
    const { rows } = await pool.query<{ id: string; fusionado_en: string | null }>(
      "select id, fusionado_en from public.temas",
    )
    expect(rows.find((r) => r.id === nuevo)?.fusionado_en).toBe(viejo)
  })

  it("does nothing when Claude says they are not the same topic", async () => {
    const { grande, chico } = await dosParecidos()
    simularClaude({ mismo: false })
    const resultado = await fusionarTemas(deps())
    expect(resultado.fusionados).toBe(0)
    const { rows } = await pool.query("select id from public.temas where fusionado_en is null")
    expect(rows.map((r) => r.id).sort()).toEqual([grande, chico].sort())
  })

  it("makes no call when no pair reaches the threshold", async () => {
    await tema("Uno", vec({ 0: 1 }))
    await tema("Dos", vec({ 9: 1 }))
    const llamadas = simularClaude()
    const resultado = await fusionarTemas(deps())
    expect(llamadas.fusiones).toBe(0)
    expect(resultado).toMatchObject({ tope: false, fusionados: 0 })
  })

  it("follows a chain: a topic absorbed by one pair is not merged again as itself", async () => {
    const a = await tema("A", vec({ 0: 1 }))
    const b = await tema("B", vec({ 0: 1, 1: 0.1 }))
    const c = await tema("C", vec({ 0: 1, 1: 0.2 }))
    await afirmacion(vec({ 0: 1 }), { tema: a })
    await afirmacion(vec({ 0: 1 }), { tema: a })
    await afirmacion(vec({ 0: 1 }), { tema: a })
    await afirmacion(vec({ 0: 1 }), { tema: b })
    await afirmacion(vec({ 0: 1 }), { tema: c })
    simularClaude({ mismo: true })
    await fusionarTemas(deps())
    const { rows } = await pool.query<{ id: string; fusionado_en: string | null }>(
      "select id, fusionado_en from public.temas",
    )
    expect(rows.find((r) => r.id === a)?.fusionado_en).toBeNull()
    expect(rows.find((r) => r.id === b)?.fusionado_en).toBe(a)
    expect(rows.find((r) => r.id === c)?.fusionado_en).toBe(a)
    const { rows: n } = await pool.query<{ n: number }>(
      "select count(*)::int as n from public.afirmaciones where tema_id = $1",
      [a],
    )
    expect(n[0]?.n).toBe(5)
  })

  it("pays through the cap with paso temas and stops without throwing at the cap", async () => {
    await dosParecidos()
    simularClaude({ mismo: true })
    const resultado = await conTopeChico(() => fusionarTemas(deps()))
    expect(resultado.tope).toBe(true)
    const { rows } = await pool.query("select id from public.temas where fusionado_en is not null")
    expect(rows).toHaveLength(0)
    simularClaude({ mismo: true })
    await fusionarTemas(deps())
    const { rows: gastos } = await pool.query<{ paso: string; clave: string }>(
      "select paso, clave from public.gastos where clave like 'temas:%' and estado = 'confirmado'",
    )
    expect(gastos).toHaveLength(1)
    expect(gastos[0]?.paso).toBe("temas")
    expect(gastos[0]?.clave).toMatch(/^temas:fusionar:/)
  })
})

describe("recalcularTema", () => {
  it("recomputes the centroid from the non-excluded claims", async () => {
    const t = await tema("Deseo", vec({ 9: 1 }))
    await afirmacion(vec({ 0: 1 }), { tema: t })
    await afirmacion(vec({ 1: 1 }), { tema: t })
    await afirmacion(vec({ 2: 1 }), { tema: t, excluida: true })
    await recalcularTema(db, t)
    const c = await centroideDe(t)
    expect(c[0]).toBeCloseTo(Math.SQRT1_2, 4)
    expect(c[1]).toBeCloseTo(Math.SQRT1_2, 4)
    expect(c[2]).toBeCloseTo(0, 4)
    expect(c[9]).toBeCloseTo(0, 4)
  })

  it("deletes a topic left with no claims", async () => {
    const t = await tema("Vacío", vec({ 0: 1 }))
    await recalcularTema(db, t)
    const { rows } = await pool.query("select id from public.temas where id = $1", [t])
    expect(rows).toHaveLength(0)
  })
})

describe("temas_parecidos", () => {
  it("is for the service role only", async () => {
    await tema("Uno", vec({ 0: 1 }))
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select * from public.temas_parecidos(0.5)")
      expect(error.code).toBe("42501")
    })
    await como(comoServicio, async (c) => {
      await asumir(c, comoServicio)
      const { rows } = await c.query("select * from public.temas_parecidos(0.5)")
      expect(rows).toEqual([])
    })
  })
})

interface FilaTema {
  id: string
  alias: string[]
  fusionado_en: string | null
  c: string
}

describe("fusionar_par_de_temas", () => {
  // `como` rolls back: merges that depend on each other go in one call.
  const fusionarComoServicio = (ganador: string, perdedor: string, luego?: [string, string]) =>
    como(comoServicio, async (c) => {
      await c.query("select public.fusionar_par_de_temas($1, $2)", [ganador, perdedor])
      if (luego) await c.query("select public.fusionar_par_de_temas($1, $2)", luego)
      const { rows } = await c.query<FilaTema>("select id, alias, fusionado_en, centroide::text as c from public.temas")
      const { rows: a } = await c.query<{ id: string; tema_id: string | null }>(
        "select id, tema_id from public.afirmaciones",
      )
      const tema = (id: string): FilaTema => {
        const fila = rows.find((t) => t.id === id)
        if (!fila) throw new Error(`Falta el tema ${id}`)
        return fila
      }
      return { tema, afirmaciones: a }
    })

  it("moves claims, aliases, marks the loser and recomputes the normalized centroid in one call", async () => {
    const g = await tema("Ganador", vec({ 9: 1 }), { alias: ["Ya conocido"] })
    const p = await tema("Perdedor", vec({ 8: 1 }), { alias: ["Ya conocido", "Otro nombre"] })
    await afirmacion(vec({ 0: 1 }), { tema: g })
    await afirmacion(vec({ 1: 1 }), { tema: p })
    await afirmacion(vec({ 2: 1 }), { tema: p, excluida: true })
    const { tema: temaPor, afirmaciones } = await fusionarComoServicio(g, p)
    expect(afirmaciones.filter((x) => x.tema_id === g)).toHaveLength(3)
    const ganador = temaPor(g)
    expect(ganador.alias).toEqual(["Ya conocido", "Perdedor", "Otro nombre"])
    expect(temaPor(p).fusionado_en).toBe(g)
    const c = parsearVector(ganador.c)
    expect(c[0]).toBeCloseTo(Math.SQRT1_2, 4)
    expect(c[1]).toBeCloseTo(Math.SQRT1_2, 4)
    expect(c[2]).toBeCloseTo(0, 4)
  })

  it("repoints earlier merges: A into B, then B into C leaves both pointing at C", async () => {
    const a = await tema("A", vec({ 0: 1 }))
    const b = await tema("B", vec({ 0: 1 }))
    const c = await tema("C", vec({ 0: 1 }))
    await afirmacion(vec({ 0: 1 }), { tema: a })
    const { tema: temaPor, afirmaciones } = await fusionarComoServicio(b, a, [c, b])
    expect(temaPor(a).fusionado_en).toBe(c)
    expect(temaPor(b).fusionado_en).toBe(c)
    expect(temaPor(c).alias).toEqual(expect.arrayContaining(["B", "A"]))
    expect(afirmaciones.every((x) => x.tema_id === c)).toBe(true)
  })

  it("keeps the winner's centroid when it ends with no claim vectors", async () => {
    const g = await tema("G", vec({ 4: 1 }))
    const p = await tema("P", vec({ 5: 1 }))
    const { tema: temaPor } = await fusionarComoServicio(g, p)
    expect(parsearVector(temaPor(g).c)[4]).toBeCloseTo(1, 4)
  })

  it("refuses the same topic, a merged one and a missing one, and does nothing", async () => {
    const g = await tema("G", vec({ 4: 1 }))
    const p = await tema("P", vec({ 5: 1 }), { fusionado: g })
    await como(comoPostgres, async (c) => {
      expect((await fallaCon(c, "select public.fusionar_par_de_temas($1, $1)", [g])).message).toBe("temas_iguales")
      expect((await fallaCon(c, "select public.fusionar_par_de_temas($1, $2)", [g, p])).message).toBe(
        "tema_ya_fusionado",
      )
      expect((await fallaCon(c, "select public.fusionar_par_de_temas($1, gen_random_uuid())", [g])).message).toBe(
        "tema_inexistente",
      )
    })
  })

  it("is for the service role only", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.fusionar_par_de_temas(gen_random_uuid(), gen_random_uuid())")
      expect(error.code).toBe("42501")
    })
  })
})
