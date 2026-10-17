import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { MOTIVO_TOPE } from "@/lib/ingesta/procesar"
import { correrMotor, type DepsDelMotor } from "@/lib/motor/semanal"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { servidor } from "../msw"
import { CONI, pool } from "./db"
import { URL_CLAUDE, USO } from "./procesar-comun"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const db = clienteDeServicio()
const SEMANA = "2026-10-04"

function deps(): DepsDelMotor {
  return {
    db,
    almacen: almacenEnMemoria(),
    ahora: () => new Date().toISOString(),
    claude: new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
  }
}

async function limpiar() {
  await pool.query("delete from public.ideas where origen = 'motor'")
  await pool.query("delete from public.teorias where origen = 'motor'")
  await pool.query("delete from public.motor_corridas")
  await pool.query("delete from public.afirmaciones")
  await pool.query("delete from public.temas")
  await pool.query("delete from public.materiales where texto_pegado like 'motor-semanal%'")
  await pool.query("delete from public.autores where nombre like '%semanal motor'")
  await pool.query("delete from public.gastos where paso = 'motor'")
  await pool.query("update public.ajustes set ideas_por_semana = 10")
}
beforeEach(limpiar)
afterEach(limpiar)

const eje = (i: number, valor = 1) => `[${Array.from({ length: 1024 }, (_, k) => (k === i ? valor : 0)).join(",")}]`

async function uno(sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`Sin id para: ${sql}`)
  return id
}

const autor = (nombre: string) =>
  uno("insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [`${nombre} semanal motor`])

const material = (autorId: string, rol: string, texto = "motor-semanal") =>
  uno(
    `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado)
     values ('documento', $1, $2, $3, now(), $4, 'listo') returning id`,
    [autorId, rol, texto, CONI],
  )

const tema = (nombre: string, pilar: string, posicion: number) =>
  uno(
    `insert into public.temas (nombre, descripcion, categoria_id, centroide)
     values ($1, 'd', (select id from public.categorias where slug = $2), $3::extensions.vector) returning id`,
    [nombre, pilar, eje(posicion)],
  )

async function afirmacion(
  materialId: string,
  autorId: string,
  temaId: string,
  texto: string,
  extra: { evidencia?: string; vector?: string } = {},
): Promise<string> {
  return uno(
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, vector)
     values ($1, $2, 0, '{"pagina": 1}', $3, 'cita ' || $3, 'consejo', $4, $5, $6::extensions.vector) returning id`,
    [materialId, autorId, texto, extra.evidencia ?? "estudio", temaId, extra.vector ?? null],
  )
}

/** Three topics from three pillars, each backed by the same two authors: three crossings qualify. */
async function tresTemas(evidencia = "estudio"): Promise<{ t1: string; t2: string; t3: string }> {
  const ana = await autor("Ana")
  const beto = await autor("Beto")
  const mAna = await material(ana, "referente")
  const mBeto = await material(beto, "referente")
  const t1 = await tema("Tema uno", "deseo", 0)
  const t2 = await tema("Tema dos", "pareja", 1)
  const t3 = await tema("Tema tres", "limites", 2)
  for (const t of [t1, t2, t3]) {
    await afirmacion(mAna, ana, t, `Ana dice sobre ${t}`, { evidencia })
    await afirmacion(mBeto, beto, t, `Beto dice sobre ${t}`, { evidencia })
  }
  return { t1, t2, t3 }
}

/** Ten topics over the five pillars, all backed by the same two authors: eight crossings qualify. */
async function ochoTemas(): Promise<void> {
  const ana = await autor("Ana")
  const beto = await autor("Beto")
  const mAna = await material(ana, "referente")
  const mBeto = await material(beto, "referente")
  const pilares = ["pareja", "deseo", "autoestima", "limites", "bienestar"]
  for (let i = 0; i < 10; i += 1) {
    const t = await tema(`Tema ${i}`, pilares[i % pilares.length] ?? "pareja", i)
    await afirmacion(mAna, ana, t, `Ana dice sobre ${t}`)
    await afirmacion(mBeto, beto, t, `Beto dice sobre ${t}`)
  }
}

interface CruceEnviado {
  id: string
  minimoAutores?: number
  temas: { id: string; nombre: string; pilar: string }[]
  afirmaciones: { id: string; autor: string; texto: string }[]
}

interface Pedido {
  messages: { content: string }[]
}

function simularClaude(
  opciones: { nada?: (indice: number) => boolean; estado?: number; fallaLlamada?: (llamada: number) => boolean } = {},
) {
  const registro = { llamadas: 0, cruces: [] as CruceEnviado[], lotes: [] as CruceEnviado[][], usuario: "" }
  servidor.use(
    http.post<never, Pedido>(URL_CLAUDE, async ({ request }) => {
      if (opciones.estado)
        return HttpResponse.json({ error: { type: "api_error", message: "x" } }, { status: opciones.estado })
      const cuerpo = await request.json()
      const usuario = cuerpo.messages[0]?.content ?? ""
      registro.llamadas += 1
      if (opciones.fallaLlamada?.(registro.llamadas))
        return HttpResponse.json({ error: { type: "api_error", message: "x" } }, { status: 500 })
      registro.usuario = usuario
      const cruces: CruceEnviado[] = JSON.parse(usuario.split("<cruces>\n")[1]?.split("\n</cruces>")[0] ?? "[]")
      registro.cruces = cruces
      registro.lotes.push(cruces)
      const teorias = cruces.map((cruce, i) => {
        if (opciones.nada?.(i)) {
          return {
            cruceId: cruce.id,
            nada: true,
            razon: "No suma nada nuevo.",
            titulo: null,
            tesis: null,
            porQue: null,
            aportes: [],
            tensiones: [],
            nivelEvidencia: null,
            advertencias: [],
            ideas: [],
          }
        }
        const porAutor = new Map(cruce.afirmaciones.map((a) => [a.autor, a]))
        return {
          cruceId: cruce.id,
          nada: false,
          razon: null,
          titulo: `Teoría ${i}`,
          tesis: `Tesis ${i}`,
          porQue: "Porque sí.",
          aportes: [...porAutor.values()]
            .slice(0, 2)
            .map((a) => ({ afirmacionId: a.id, aporte: `Aporte de ${a.autor}` })),
          tensiones: ["Depende del caso."],
          nivelEvidencia: "medio",
          advertencias: [],
          ideas: [
            { gancho: `Gancho ${i} a`, tema: "t", pilar: "deseo", formato: "reel" },
            { gancho: `Gancho ${i} b`, tema: "t", pilar: "pareja", formato: "reel" },
          ],
        }
      })
      return HttpResponse.json({
        id: "msg_prueba",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify({ teorias }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: USO,
      })
    }),
  )
  return registro
}

async function corrida() {
  const { rows } = await pool.query<{
    estado: string
    motivo_fallo: string | null
    resumen: Record<string, unknown>
    costo_usd: string
  }>("select estado, motivo_fallo, resumen, costo_usd::text from public.motor_corridas where semana = $1", [SEMANA])
  return rows[0]
}

const contar = async (sql: string): Promise<number> => Number((await pool.query<{ n: string }>(sql)).rows[0]?.n)

describe("motor_afirmaciones_de_tema", () => {
  it("puts studies and clinical practice first, then the claims closest to the centroid", async () => {
    const ana = await autor("Ana")
    const m = await material(ana, "referente")
    const t = await tema("Orden", "deseo", 0)
    await afirmacion(m, ana, t, "lejana", { evidencia: "opinion", vector: eje(1) })
    const cercana = await afirmacion(m, ana, t, "cercana", { evidencia: "opinion", vector: eje(0) })
    const estudio = await afirmacion(m, ana, t, "estudio", { evidencia: "estudio", vector: eje(1) })

    const { rows } = await pool.query<{ id: string }>("select id from public.motor_afirmaciones_de_tema($1, 2)", [t])

    expect(rows.map((r) => r.id)).toEqual([estudio, cercana])
  })
})

describe("correrMotor", () => {
  it("turns three crossings into theories, ideas and a finished run", async () => {
    const { t1 } = await tresTemas()
    await pool.query(
      "insert into public.ideas (numero, pilar, gancho, estado, fuerza, origen, semana) values (500, 'ia-salud-mental', 'vieja', 'idea', 'baja', 'motor', '2026-01-04')",
    )
    const claude = simularClaude()

    const resultado = await correrMotor(deps(), { semana: SEMANA, manual: false })

    expect(resultado.resultado).toBe("lista")
    expect(claude.llamadas).toBe(1)
    expect(claude.cruces).toHaveLength(3)
    expect(claude.cruces.every((c) => c.temas.length === 2 && c.minimoAutores === undefined)).toBe(true)
    const teorias = await pool.query<{
      estado: string
      semana: string
      temas: string[]
      puntaje: string
      nivel_evidencia: string
      argumentos: unknown[]
      contradicciones: unknown[]
    }>(
      "select estado, semana::text, temas, puntaje::text, nivel_evidencia, argumentos, contradicciones from public.teorias where origen = 'motor'",
    )
    expect(teorias.rows).toHaveLength(3)
    expect(teorias.rows[0]).toMatchObject({ estado: "guardada", semana: SEMANA, nivel_evidencia: "medio" })
    expect(teorias.rows[0]?.temas).toHaveLength(2)
    expect(teorias.rows[0]?.argumentos).toHaveLength(2)
    expect(teorias.rows[0]?.contradicciones).toEqual(["Depende del caso."])
    expect(await contar("select count(*) as n from public.teoria_afirmaciones")).toBe(6)

    const ideas = await pool.query<{
      numero: number | null
      estado: string
      fuerza: string
      semana: string
      teoria_id: string
      fuentes: { autor: string; cita: string; tema: string }[]
    }>(
      "select numero, estado, fuerza, semana::text, teoria_id, fuentes from public.ideas where origen = 'motor' and gancho like 'Gancho%' order by gancho",
    )
    expect(ideas.rows).toHaveLength(6)
    expect(ideas.rows.every((i) => i.estado === "idea" && i.semana === SEMANA && i.teoria_id)).toBe(true)
    // The number belongs to the imported bank: engine ideas have none (a counter would collide with the importer).
    expect(ideas.rows.map((i) => i.numero)).toEqual([null, null, null, null, null, null])
    expect(ideas.rows[0]?.fuentes[0]).toMatchObject({
      autor: expect.stringContaining("semanal motor"),
      cita: expect.any(String),
    })

    const vieja = await pool.query<{ estado: string }>("select estado from public.ideas where numero = 500")
    expect(vieja.rows[0]?.estado).toBe("archivada")
    const c = await corrida()
    expect(c).toMatchObject({ estado: "lista" })
    expect(c?.resumen).toMatchObject({ teorias: 3, ideas: 6, archivadas: 1, descartadas: [] })
    expect(Number(c?.costo_usd)).toBeGreaterThan(0)
    expect(t1).toBeTruthy()
    const gasto = await pool.query<{ estado: string; clave: string }>(
      "select estado, clave from public.gastos where paso = 'motor'",
    )
    expect(gasto.rows).toHaveLength(1)
    expect(gasto.rows[0]?.estado).toBe("confirmado")
    expect(gasto.rows[0]?.clave).toMatch(new RegExp(`^motor:${SEMANA}:`))
  })

  it("sends eight crossings to Claude in batches of three, one paid step each", async () => {
    await ochoTemas()
    const claude = simularClaude()

    const r = await correrMotor(deps(), { semana: SEMANA, manual: false })

    expect(r.resultado).toBe("lista")
    expect(claude.lotes.map((l) => l.length)).toEqual([3, 3, 2])
    expect(new Set(claude.lotes.flat().map((c) => c.id)).size).toBe(8)
    const gastos = await pool.query<{ clave: string; estado: string }>(
      "select clave, estado from public.gastos where paso = 'motor'",
    )
    expect(gastos.rows).toHaveLength(3)
    expect(gastos.rows.every((g) => g.estado === "confirmado")).toBe(true)
    expect(new Set(gastos.rows.map((g) => g.clave)).size).toBe(3)
    const c = await corrida()
    expect(c?.resumen).toMatchObject({ teorias: 8 })
    expect(Number(c?.costo_usd)).toBeCloseTo(0.018, 3)
  })

  it("keeps the batches that worked and discards the crossings of a failed one", async () => {
    await ochoTemas()
    simularClaude({ fallaLlamada: (n) => n === 2 })

    const r = await correrMotor(deps(), { semana: SEMANA, manual: false })

    expect(r.resultado).toBe("lista")
    const c = await corrida()
    expect(c).toMatchObject({ estado: "lista" })
    expect(c?.resumen).toMatchObject({ teorias: 5, descartadas: expect.any(Array) })
    const descartadas = await pool.query<{ motivo_fallo: string }>(
      "select motivo_fallo from public.teorias where estado = 'descartada_por_motor'",
    )
    expect(descartadas.rows).toHaveLength(3)
    expect(descartadas.rows.every((d) => d.motivo_fallo === "no alcancé a escribirla")).toBe(true)
    expect(await contar("select count(*) as n from public.teorias where estado = 'guardada'")).toBe(5)
    expect(await contar("select count(*) as n from public.gastos where paso = 'motor' and estado = 'reservado'")).toBe(
      0,
    )
  })

  it("fails the run and rethrows when every batch failed", async () => {
    await ochoTemas()
    simularClaude({ estado: 500 })

    await expect(correrMotor(deps(), { semana: SEMANA, manual: false })).rejects.toThrow()

    expect((await corrida())?.estado).toBe("fallida")
    expect(await contar("select count(*) as n from public.teorias where origen = 'motor'")).toBe(0)
  })

  it("names in each source the topic of the claim, not the topic of the idea", async () => {
    await tresTemas()
    simularClaude()

    await correrMotor(deps(), { semana: SEMANA, manual: false })

    const { rows } = await pool.query<{ fuentes: { tema: string }[] }>(
      "select fuentes from public.ideas where origen = 'motor' and gancho like 'Gancho%'",
    )
    const nombres = rows.flatMap((r) => r.fuentes.map((f) => f.tema))
    expect(nombres.length).toBeGreaterThan(0)
    expect(nombres.every((n) => ["Tema uno", "Tema dos", "Tema tres"].includes(n))).toBe(true)
  })

  it("does nothing the second time the same week", async () => {
    await tresTemas()
    const claude = simularClaude()
    await correrMotor(deps(), { semana: SEMANA, manual: false })

    const otra = await correrMotor(deps(), { semana: SEMANA, manual: true })

    expect(otra.resultado).toBe("ya_corrio")
    expect(claude.llamadas).toBe(1)
    expect(await contar("select count(*) as n from public.gastos where paso = 'motor'")).toBe(1)
  })

  it("runs again a week whose run failed, clearing what the failed attempt left", async () => {
    await tresTemas()
    await pool.query("insert into public.motor_corridas (semana, estado, motivo_fallo) values ($1, 'fallida', 'x')", [
      SEMANA,
    ])
    const sobra = await uno(
      "insert into public.teorias (titulo, tesis, origen, semana, creada_por) values ('sobra', 't', 'motor', $1, $2) returning id",
      [SEMANA, CONI],
    )
    await pool.query(
      "insert into public.ideas (numero, pilar, gancho, estado, fuerza, origen, semana, teoria_id) values (700, 'ia-salud-mental', 'sobra', 'idea', 'baja', 'motor', $1, $2)",
      [SEMANA, sobra],
    )
    simularClaude()

    const r = await correrMotor(deps(), { semana: SEMANA, manual: true })

    expect(r.resultado).toBe("lista")
    expect(await corrida()).toMatchObject({ estado: "lista", motivo_fallo: null })
    expect(await contar("select count(*) as n from public.ideas where gancho = 'sobra'")).toBe(0)
    expect(await contar("select count(*) as n from public.teorias where titulo = 'sobra'")).toBe(0)
    expect(await contar("select count(*) as n from public.ideas where origen = 'motor'")).toBe(6)
  })

  it("keeps a pinned idea from the failed attempt, and its theory, when the week runs again", async () => {
    await tresTemas()
    await pool.query("insert into public.motor_corridas (semana, estado, motivo_fallo) values ($1, 'fallida', 'x')", [
      SEMANA,
    ])
    const fijada = await uno(
      "insert into public.teorias (titulo, tesis, origen, semana, creada_por) values ('fijada', 't', 'motor', $1, $2) returning id",
      [SEMANA, CONI],
    )
    await pool.query(
      "insert into public.ideas (numero, pilar, gancho, estado, fuerza, origen, semana, teoria_id, fijada_en) values (710, 'ia-salud-mental', 'fijada', 'idea', 'baja', 'motor', $1, $2, now())",
      [SEMANA, fijada],
    )
    simularClaude()

    await correrMotor(deps(), { semana: SEMANA, manual: true })

    expect(await contar("select count(*) as n from public.ideas where gancho = 'fijada'")).toBe(1)
    expect(await contar("select count(*) as n from public.teorias where titulo = 'fijada'")).toBe(1)
  })

  it("takes over a run stuck in corriendo for more than 30 minutes but not a recent one", async () => {
    await tresTemas()
    await pool.query("insert into public.motor_corridas (semana, estado) values ($1, 'corriendo')", [SEMANA])
    const claude = simularClaude()

    const reciente = await correrMotor(deps(), { semana: SEMANA, manual: false })
    expect(reciente.resultado).toBe("ya_corrio")
    expect(claude.llamadas).toBe(0)

    await pool.query("update public.motor_corridas set creada_en = now() - interval '31 minutes'")
    const colgada = await correrMotor(deps(), { semana: SEMANA, manual: false })
    expect(colgada.resultado).toBe("lista")
    expect(claude.llamadas).toBe(1)
  })

  it("stores a crossing that gives nothing as a theory discarded by the engine, with no ideas", async () => {
    await tresTemas()
    simularClaude({ nada: (i) => i === 0 })

    await correrMotor(deps(), { semana: SEMANA, manual: false })

    const d = await pool.query<{ motivo_fallo: string; titulo: string | null }>(
      "select motivo_fallo, titulo from public.teorias where estado = 'descartada_por_motor'",
    )
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0]?.motivo_fallo).toBe("No suma nada nuevo.")
    expect(
      await contar("select count(*) as n from public.ideas where origen = 'motor' and gancho like 'Gancho%'"),
    ).toBe(4)
    expect((await corrida())?.resumen).toMatchObject({ teorias: 2, ideas: 4, descartadas: [expect.anything()] })
  })

  it("inserts at most ideas_por_semana ideas, from the best theories", async () => {
    await tresTemas()
    await pool.query("update public.ajustes set ideas_por_semana = 3")
    simularClaude()

    await correrMotor(deps(), { semana: SEMANA, manual: false })

    expect(
      await contar("select count(*) as n from public.ideas where origen = 'motor' and gancho like 'Gancho%'"),
    ).toBe(3)
  })

  it("flags the ideas of weakly backed theories", async () => {
    await tresTemas("opinion")
    simularClaude()

    await correrMotor(deps(), { semana: SEMANA, manual: false })

    const { rows } = await pool.query<{ alertas: { tipo: string; texto: string }[] }>(
      "select alertas from public.ideas where gancho like 'Gancho%'",
    )
    expect(rows).toHaveLength(6)
    expect(rows.every((r) => r.alertas[0]?.texto === "respaldo débil" && r.alertas[0]?.tipo === "respaldo")).toBe(true)
  })

  it("ranks a topic with two discarded engine ideas below an equal one", async () => {
    const { t3 } = await tresTemas()
    const teoria = await uno(
      "insert into public.teorias (titulo, tesis, origen, semana, temas, creada_por) values ('previa', 't', 'motor', '2026-09-13', $1, $2) returning id",
      [[t3], CONI],
    )
    for (const n of [601, 602]) {
      await pool.query(
        "insert into public.ideas (numero, pilar, gancho, estado, fuerza, origen, semana, teoria_id) values ($1, 'ia-salud-mental', 'previa', 'descartada', 'media', 'motor', '2026-09-13', $2)",
        [n, teoria],
      )
    }
    const claude = simularClaude()

    await correrMotor(deps(), { semana: SEMANA, manual: false })

    expect(claude.cruces[0]?.temas.map((t) => t.id)).not.toContain(t3)
    expect(claude.cruces[2]?.temas.map((t) => t.id)).toContain(t3)
  })

  it("fills a cold start with single topics, relaxing the author rule", async () => {
    const ana = await autor("Ana")
    const m = await material(ana, "referente")
    const t = await tema("Solo", "deseo", 0)
    await afirmacion(m, ana, t, "uno")
    await afirmacion(m, ana, t, "dos")
    const sinClaims = await tema("Con una sola", "pareja", 1)
    await afirmacion(m, ana, sinClaims, "uno")
    const claude = simularClaude()

    const r = await correrMotor(deps(), { semana: SEMANA, manual: false })

    expect(r.resultado).toBe("lista")
    expect(claude.cruces).toHaveLength(1)
    expect(claude.cruces[0]).toMatchObject({ minimoAutores: 1 })
    expect(claude.cruces[0]?.temas).toHaveLength(1)
    expect(
      await contar("select count(*) as n from public.ideas where origen = 'motor' and gancho like 'Gancho%'"),
    ).toBe(2)
  })

  it("sends the guide, the strategy cards and the voice claims as context", async () => {
    await tresTemas()
    const coni = await autor("Coni")
    const estrategia = await material(coni, "estrategia")
    await pool.query(
      "insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente) values ($1, 'Resumen de estrategia semanal', '[]', '[]', '{}')",
      [estrategia],
    )
    const voz = await material(coni, "voz_propia")
    const tv = await tema("Voz", "bienestar", 3)
    await afirmacion(voz, coni, tv, "Frase propia de Coni semanal")
    const claude = simularClaude()

    await correrMotor(deps(), { semana: SEMANA, manual: false })

    expect(claude.usuario).toContain("Resumen de estrategia semanal")
    expect(claude.usuario).toContain("Frase propia de Coni semanal")
  })

  it("fails the run with the cap motive and no ideas when the monthly cap is reached", async () => {
    await tresTemas()
    const claude = simularClaude()
    const { rows } = await pool.query<{ t: string }>("select tope_mensual_usd::text as t from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0.00001")
    try {
      const r = await correrMotor(deps(), { semana: SEMANA, manual: false })
      expect(r.resultado).toBe("fallida")
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [rows[0]?.t ?? "100"])
    }

    expect(claude.llamadas).toBe(0)
    expect(await corrida()).toMatchObject({ estado: "fallida", motivo_fallo: MOTIVO_TOPE })
    expect(await contar("select count(*) as n from public.ideas where origen = 'motor'")).toBe(0)
  })

  it("fails the run with a Spanish motive and rethrows on any other error", async () => {
    await tresTemas()
    simularClaude({ estado: 500 })

    await expect(correrMotor(deps(), { semana: SEMANA, manual: false })).rejects.toThrow()

    const c = await corrida()
    expect(c?.estado).toBe("fallida")
    expect(c?.motivo_fallo).toMatch(/motor|semana|ideas/i)
    expect(await contar("select count(*) as n from public.ideas where origen = 'motor'")).toBe(0)
    expect(await contar("select count(*) as n from public.gastos where paso = 'motor' and estado = 'reservado'")).toBe(
      0,
    )
  })

  it("finishes with zero ideas, the upload report and no Claude call when there are no topics", async () => {
    const claude = simularClaude()

    const r = await correrMotor(deps(), { semana: SEMANA, manual: false })

    expect(r.resultado).toBe("lista")
    expect(claude.llamadas).toBe(0)
    const c = await corrida()
    expect(c?.estado).toBe("lista")
    expect(c?.resumen).toMatchObject({
      ideas: 0,
      teorias: 0,
      queSubir: { unSoloAutor: [], pilaresSinMaterial: expect.any(Array) },
    })
  })
})
