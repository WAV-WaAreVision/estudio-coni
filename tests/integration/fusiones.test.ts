import type pg from "pg"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  asumir,
  CONI,
  como,
  comoConi,
  comoMantenedor,
  comoOtra,
  comoPostgres,
  comoServicio,
  fallaCon,
  pool,
} from "./db"
import {
  afirmacion,
  desvioDelCentroide,
  escenaDeFusion,
  foto,
  limpiarFusiones,
  propuesta,
  tema,
  vec,
} from "./fusiones-comun"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())
beforeEach(limpiarFusiones)
afterEach(limpiarFusiones)

describe("fusiones schema", () => {
  it("lets Coni and WAV read merges, subtopics and rejected pairs, write none, and hides them from others", async () => {
    const a = await tema("A", vec({ 0: 1 }))
    const b = await tema("B", vec({ 1: 1 }))
    await propuesta(a, b)
    await pool.query("insert into public.temas_subtemas (tema_id, padre_id, origen) values ($1, $2, 'claude')", [b, a])
    await pool.query("insert into public.temas_fusion_rechazada (tema_a, tema_b) values ($1, $2)", [a, b].sort())
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        expect((await c.query("select 1 from public.fusiones")).rows).toHaveLength(1)
        expect((await c.query("select 1 from public.temas_subtemas")).rows).toHaveLength(1)
        expect((await c.query("select 1 from public.temas_fusion_rechazada")).rows).toHaveLength(1)
        const escribir = await fallaCon(
          c,
          "insert into public.fusiones (ganador_id, perdedor_id, origen) values ($1, $2, 'coni')",
          [b, a],
        )
        expect(escribir.code).toBe("42501")
        expect((await fallaCon(c, "select 1 from public.fusiones_afirmaciones")).code).toBe("42501")
      })
    }
    await como(comoOtra, async (c) => {
      expect((await c.query("select 1 from public.fusiones")).rows).toEqual([])
      expect((await c.query("select 1 from public.temas_fusion_rechazada")).rows).toEqual([])
    })
  })

  it("keeps one open proposal per pair, whatever the order", async () => {
    const a = await tema("A", vec({ 0: 1 }))
    const b = await tema("B", vec({ 1: 1 }))
    await propuesta(a, b)
    await como(comoServicio, async (c) => {
      const error = await fallaCon(
        c,
        "insert into public.fusiones (ganador_id, perdedor_id, origen) values ($1, $2, 'claude')",
        [b, a],
      )
      expect(error.code).toBe("23505")
    })
  })

  it("keeps a subtopic pair once in either direction and never a topic under itself", async () => {
    const a = await tema("A", vec({ 0: 1 }))
    const b = await tema("B", vec({ 1: 1 }))
    await pool.query("insert into public.temas_subtemas (tema_id, padre_id, origen) values ($1, $2, 'claude')", [b, a])
    await como(comoServicio, async (c) => {
      const sql = "insert into public.temas_subtemas (tema_id, padre_id, origen) values ($1, $2, 'claude')"
      expect((await fallaCon(c, sql, [a, b])).code).toBe("23505")
      expect((await fallaCon(c, sql, [a, a])).code).toBe("23514")
    })
  })

  it("defaults an old rejection to Claude's, without reason, counts or model", async () => {
    const a = await tema("A", vec({ 0: 1 }))
    const b = await tema("B", vec({ 1: 1 }))
    await como(comoServicio, async (c) => {
      await c.query("insert into public.temas_fusion_rechazada (tema_a, tema_b) values ($1, $2)", [a, b].sort())
      const { rows } = await c.query(
        "select origen, razon, afirmaciones_a, afirmaciones_b, modelo from public.temas_fusion_rechazada",
      )
      expect(rows).toEqual([
        { origen: "claude", razon: null, afirmaciones_a: null, afirmaciones_b: null, modelo: null },
      ])
    })
  })

  it("counts a topic's live claims for the service role only", async () => {
    const a = await tema("A", vec({ 0: 1 }))
    await afirmacion(vec({ 0: 1 }), { tema: a })
    await afirmacion(vec({ 0: 1 }), { tema: a })
    await como(comoServicio, async (c) => {
      const { rows } = await c.query<{ n: number }>("select public.afirmaciones_vivas($1) as n", [a])
      expect(rows[0]?.n).toBe(2)
    })
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.afirmaciones_vivas($1)", [a])).code).toBe("42501")
    })
  })
})

describe("fusionar_par_de_temas with its log", () => {
  it("logs a two-argument merge as Claude's, with the snapshot taken before anything changed", async () => {
    const e = await escenaDeFusion()
    await como(comoServicio, async (c) => {
      await asumir(c, comoPostgres)
      const antes = await foto(c, [e.ganador, e.perdedor, e.encadenado])
      await asumir(c, comoServicio)
      const { rows } = await c.query<{ id: string }>("select public.fusionar_par_de_temas($1, $2) as id", [
        e.ganador,
        e.perdedor,
      ])
      await asumir(c, comoPostgres)
      const fusion = await c.query("select * from public.fusiones where id = $1", [rows[0]?.id])
      const f = fusion.rows[0]
      expect(f).toMatchObject({
        estado: "aplicada",
        origen: "claude",
        veredicto: "mismo",
        modelo: "voyage-3.5",
        alias_agregados: ["Perdedor", "Otro nombre"],
        encadenados: [e.encadenado],
      })
      expect(f.aplicada_en).not.toBeNull()
      const sinFecha = (filas: Record<string, unknown>[]) => filas.map(({ creado_en, ...resto }) => resto)
      const desdeJson = (filas: Record<string, unknown>[]) =>
        filas.map(({ tema_id, pilar_id, red, es_capa, fuerza, origen, lote }) => ({
          tema_id,
          pilar_id,
          red,
          es_capa,
          fuerza,
          origen,
          lote,
        }))
      expect(desdeJson(f.pilares_ganador)).toEqual(sinFecha(antes.pilares.filter((p) => p.tema_id === e.ganador)))
      expect(desdeJson(f.pilares_perdedor)).toEqual(sinFecha(antes.pilares.filter((p) => p.tema_id === e.perdedor)))
      const movidas = await c.query(
        "select afirmacion_id, tema_origen from public.fusiones_afirmaciones where fusion_id = $1 order by afirmacion_id",
        [f.id],
      )
      expect(movidas.rows).toEqual(
        [...e.dePerdedor].sort().map((id) => ({ afirmacion_id: id, tema_origen: e.perdedor })),
      )
      const despues = await foto(c, [e.ganador])
      expect(desdeJson(f.pilares_ganador_despues)).toEqual(sinFecha(despues.pilares))
    })
  })

  it("is still called by name with two arguments through PostgREST, as the Trigger code before this deploy does", async () => {
    const e = await escenaDeFusion()
    const { data, error } = await clienteDeServicio().rpc("fusionar_par_de_temas", {
      p_ganador: e.ganador,
      p_perdedor: e.perdedor,
    })
    expect(error).toBeNull()
    const { rows } = await pool.query("select estado from public.fusiones where id = $1", [data])
    expect(rows).toEqual([{ estado: "aplicada" }])
  })

  it("applies the proposal it is given and refuses a decided one or one of another pair", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    await como(comoServicio, async (c) => {
      expect(
        (await fallaCon(c, "select public.fusionar_par_de_temas($2, $1, $3)", [e.ganador, e.perdedor, id])).message,
      ).toBe("fusion_de_otro_par")
      const { rows } = await c.query<{ id: string }>("select public.fusionar_par_de_temas($1, $2, $3) as id", [
        e.ganador,
        e.perdedor,
        id,
      ])
      expect(rows[0]?.id).toBe(id)
      const estado = await c.query("select estado from public.fusiones where id = $1", [id])
      expect(estado.rows).toEqual([{ estado: "aplicada" }])
    })
    await pool.query("update public.fusiones set estado = 'rechazada' where id = $1", [id])
    await como(comoServicio, async (c) => {
      expect(
        (await fallaCon(c, "select public.fusionar_par_de_temas($1, $2, $3)", [e.ganador, e.perdedor, id])).message,
      ).toBe("fusion_ya_decidida")
    })
  })

  it("closes as vencida the other proposals about the topic that went away", async () => {
    const e = await escenaDeFusion()
    const tercero = await tema("Tercero", vec({ 0: 1, 3: 0.2 }))
    const otra = await propuesta(tercero, e.perdedor)
    await como(comoServicio, async (c) => {
      await c.query("select public.fusionar_par_de_temas($1, $2)", [e.ganador, e.perdedor])
      const { rows } = await c.query("select estado from public.fusiones where id = $1", [otra])
      expect(rows).toEqual([{ estado: "vencida" }])
    })
  })

  it("is for the service role only", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.fusionar_par_de_temas(gen_random_uuid(), gen_random_uuid())")
      expect(error.code).toBe("42501")
    })
  })
})

describe("temas_parecidos with Coni's and Claude's decisions", () => {
  const parecidos = () =>
    como(comoServicio, async (c) => {
      const { rows } = await c.query<{ a: string; b: string }>("select a, b from public.temas_parecidos(0.6)")
      return rows.map((r) => [r.a, r.b].sort().join("|"))
    })
  const par = (x: string, y: string) => [x, y].sort().join("|")

  async function tres() {
    const a = await tema("A", vec({ 0: 1 }))
    const b = await tema("B", vec({ 0: 1, 1: 0.1 }))
    const c = await tema("C", vec({ 0: 1, 2: 0.1 }))
    for (const t of [a, b, c]) for (let i = 0; i < 3; i++) await afirmacion(vec({ 0: 1 }), { tema: t })
    return { a, b, c }
  }

  it("leaves out every pair that touches a topic waiting in a proposal", async () => {
    const { a, b, c } = await tres()
    await propuesta(a, b)
    expect(await parecidos()).toEqual([])
    await pool.query("update public.fusiones set estado = 'rechazada'")
    expect((await parecidos()).sort()).toEqual([par(a, b), par(a, c), par(b, c)].sort())
  })

  it("leaves out a stored subtopic pair in either direction", async () => {
    const { a, b, c } = await tres()
    await pool.query("insert into public.temas_subtemas (tema_id, padre_id, origen) values ($1, $2, 'claude')", [b, a])
    expect(await parecidos()).not.toContain(par(a, b))
    expect(await parecidos()).toContain(par(a, c))
  })

  it("never offers again a pair Coni rejected, even after growth or a model change", async () => {
    const { a, b } = await tres()
    await pool.query(
      `insert into public.temas_fusion_rechazada (tema_a, tema_b, origen, afirmaciones_a, afirmaciones_b, modelo)
       values ($1, $2, 'coni', 3, 3, 'voyage-4')`,
      [a, b].sort(),
    )
    for (let i = 0; i < 5; i++) await afirmacion(vec({ 0: 1 }), { tema: a })
    expect(await parecidos()).not.toContain(par(a, b))
  })

  it("offers Claude's rejected pair again once either topic grew 30 % or the model changed, not before", async () => {
    const { a, b } = await tres()
    await pool.query(
      `insert into public.temas_fusion_rechazada (tema_a, tema_b, origen, afirmaciones_a, afirmaciones_b, modelo)
       values ($1, $2, 'claude', 3, 3, 'voyage-3.5')`,
      [a, b].sort(),
    )
    expect(await parecidos()).not.toContain(par(a, b))
    await afirmacion(vec({ 0: 1 }), { tema: b })
    expect(await parecidos()).toContain(par(a, b))
    await pool.query(
      "delete from public.afirmaciones where id = (select id from public.afirmaciones where tema_id = $1 limit 1)",
      [b],
    )
    expect(await parecidos()).not.toContain(par(a, b))
    await pool.query("update public.temas_fusion_rechazada set modelo = 'voyage-4'")
    expect(await parecidos()).toContain(par(a, b))
  })

  it("asks again once about a rejection the old code left without counts or model", async () => {
    const { a, b } = await tres()
    await pool.query("insert into public.temas_fusion_rechazada (tema_a, tema_b) values ($1, $2)", [a, b].sort())
    expect(await parecidos()).toContain(par(a, b))
  })
})

describe("deshacer_fusion", () => {
  /** Merges as the service role, then runs `fn` as Coni, in one rolled-back transaction. */
  const fusionarYLuego = <T>(ganador: string, perdedor: string, fn: (c: pg.PoolClient, fusion: string) => Promise<T>) =>
    como(comoServicio, async (c) => {
      const { rows } = await c.query<{ id: string }>("select public.fusionar_par_de_temas($1, $2) as id", [
        ganador,
        perdedor,
      ])
      await asumir(c, comoConi)
      return fn(c, rows[0]?.id ?? "")
    })

  it("gives back every claim, both topics' pillar rows, the aliases and the chain, and fresh mean centroids", async () => {
    const e = await escenaDeFusion()
    await como(comoPostgres, async (c) => {
      const antes = await foto(c, [e.ganador, e.perdedor, e.encadenado])
      await asumir(c, comoServicio)
      const { rows } = await c.query<{ id: string }>("select public.fusionar_par_de_temas($1, $2) as id", [
        e.ganador,
        e.perdedor,
      ])
      await asumir(c, comoConi)
      await c.query("select public.deshacer_fusion($1)", [rows[0]?.id])
      await asumir(c, comoPostgres)
      expect(await foto(c, [e.ganador, e.perdedor, e.encadenado])).toEqual(antes)
      expect(await desvioDelCentroide(c, e.ganador)).toBeLessThan(1e-6)
      expect(await desvioDelCentroide(c, e.perdedor)).toBeLessThan(1e-6)
      const fusion = await c.query("select estado, deshecha_en is not null as con_fecha from public.fusiones")
      expect(fusion.rows).toEqual([{ estado: "deshecha", con_fecha: true }])
      const rechazo = await c.query("select origen, afirmaciones_a, afirmaciones_b from public.temas_fusion_rechazada")
      expect(rechazo.rows).toEqual([{ origen: "coni", afirmaciones_a: 2, afirmaciones_b: 2 }])
      const decision = await c.query(
        "select tipo, tema_nombre, otro_tema_nombre, decidida_por from public.decisiones_de_tema",
      )
      expect(decision.rows).toEqual([
        { tipo: "fusion_rechazada", tema_nombre: "Ganador", otro_tema_nombre: "Perdedor", decidida_por: CONI },
      ])
    })
  })

  it("refuses with pilares_cambiados, changing nothing, when Coni changed the winner's pillars after the merge", async () => {
    const e = await escenaDeFusion()
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoPostgres)
      await c.query(
        `update public.tema_pilares set fuerza = 'baja'
          where tema_id = $1 and pilar_id = (select id from public.categorias where slug = 'mi-nueva-partida')`,
        [e.ganador],
      )
      const cambiado = await foto(c, [e.ganador, e.perdedor, e.encadenado])
      await asumir(c, comoConi)
      expect((await fallaCon(c, "select public.deshacer_fusion($1)", [fusion])).message).toBe("pilares_cambiados")
      await asumir(c, comoPostgres)
      expect(await foto(c, [e.ganador, e.perdedor, e.encadenado])).toEqual(cambiado)
      const { rows } = await c.query("select estado from public.fusiones where id = $1", [fusion])
      expect(rows).toEqual([{ estado: "aplicada" }])
    })
  })

  it("refuses with pilares_cambiados when Coni added or removed a pillar of the winner after the merge", async () => {
    const e = await escenaDeFusion()
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoPostgres)
      await c.query("delete from public.tema_pilares where tema_id = $1 and es_capa", [e.ganador])
      await asumir(c, comoConi)
      expect((await fallaCon(c, "select public.deshacer_fusion($1)", [fusion])).message).toBe("pilares_cambiados")
    })
  })

  it("still undoes after Coni saved the same pillars again, which rewrites every row with new dates", async () => {
    const e = await escenaDeFusion()
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ pilar: string; fuerza: string | null }>(
        `select cat.slug as pilar, p.fuerza from public.tema_pilares p
           join public.categorias cat on cat.id = p.pilar_id where p.tema_id = $1`,
        [e.ganador],
      )
      await asumir(c, comoConi)
      await c.query("select public.cambiar_pilares_de_tema($1, $2::jsonb)", [e.ganador, JSON.stringify(rows)])
      await c.query("select public.deshacer_fusion($1)", [fusion])
      await asumir(c, comoPostgres)
      const estado = await c.query("select estado from public.fusiones where id = $1", [fusion])
      expect(estado.rows).toEqual([{ estado: "deshecha" }])
    })
  })

  it("refuses with pilares_cambiados, before writing, when a pillar of the snapshot no longer exists", async () => {
    const e = await escenaDeFusion()
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoPostgres)
      // Only possible by bypassing the foreign key; the undo must not trust the snapshot's pillars to exist.
      await c.query("set local session_replication_role = replica")
      await c.query("delete from public.categorias where slug = 'capa-tdah'")
      await c.query("set local session_replication_role = origin")
      const antes = await foto(c, [e.ganador, e.perdedor, e.encadenado])
      await asumir(c, comoConi)
      expect((await fallaCon(c, "select public.deshacer_fusion($1)", [fusion])).message).toBe("pilares_cambiados")
      await asumir(c, comoPostgres)
      expect(await foto(c, [e.ganador, e.perdedor, e.encadenado])).toEqual(antes)
    })
  })

  it("restores the pillars exactly when Coni did not touch them since the merge", async () => {
    const e = await escenaDeFusion()
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoPostgres)
      const { rows: antes } = await c.query("select count(*)::int as n from public.tema_pilares where tema_id = $1", [
        e.ganador,
      ])
      expect(antes[0]?.n).toBeGreaterThan(0)
      await asumir(c, comoConi)
      await c.query("select public.deshacer_fusion($1)", [fusion])
      await asumir(c, comoPostgres)
      const { rows } = await c.query(
        "select tema_id, count(*)::int as n from public.tema_pilares where tema_id = any($1::uuid[]) group by 1 order by 1",
        [[e.ganador, e.perdedor]],
      )
      expect(Object.fromEntries(rows.map((r) => [r.tema_id, r.n]))).toEqual({ [e.ganador]: 2, [e.perdedor]: 3 })
    })
  })

  it("leaves a claim excluded since where it is", async () => {
    const e = await escenaDeFusion()
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoPostgres)
      await c.query("update public.afirmaciones set excluida = true, tema_id = null where id = $1", [e.dePerdedor[0]])
      await asumir(c, comoConi)
      await c.query("select public.deshacer_fusion($1)", [fusion])
      await asumir(c, comoPostgres)
      const { rows } = await c.query(
        "select id, tema_id from public.afirmaciones where id = any($1::uuid[]) order by id",
        [e.dePerdedor],
      )
      expect(rows).toEqual(
        [...e.dePerdedor].sort().map((id) => ({ id, tema_id: id === e.dePerdedor[0] ? null : e.perdedor })),
      )
    })
  })

  it("refuses when the winner was merged away or a later merge went into it", async () => {
    const e = await escenaDeFusion()
    const otro = await tema("Otro", vec({ 0: 1, 4: 0.2 }))
    await afirmacion(vec({ 0: 1 }), { tema: otro })
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoServicio)
      await c.query("select public.fusionar_par_de_temas($1, $2)", [e.ganador, otro])
      await asumir(c, comoConi)
      expect((await fallaCon(c, "select public.deshacer_fusion($1)", [fusion])).message).toBe("fusion_superada")
    })
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoServicio)
      await c.query("select public.fusionar_par_de_temas($1, $2)", [otro, e.ganador])
      await asumir(c, comoConi)
      expect((await fallaCon(c, "select public.deshacer_fusion($1)", [fusion])).message).toBe("fusion_superada")
    })
  })

  it("refuses when either topic would be left with no claim", async () => {
    const e = await escenaDeFusion()
    await fusionarYLuego(e.ganador, e.perdedor, async (c, fusion) => {
      await asumir(c, comoPostgres)
      await c.query("update public.afirmaciones set excluida = true, tema_id = null where id = any($1::uuid[])", [
        e.dePerdedor,
      ])
      await asumir(c, comoConi)
      expect((await fallaCon(c, "select public.deshacer_fusion($1)", [fusion])).message).toBe("fusion_sin_ideas")
    })
  })

  it("refuses a fusion that is not applied, and anyone but Coni", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.deshacer_fusion($1)", [id])).message).toBe("fusion_no_aplicada")
    })
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        const error = await fallaCon(c, "select public.deshacer_fusion($1)", [id])
        expect([error.code, error.message]).toEqual(["42501", "sin_permiso"])
      })
    }
  })
})

describe("decidir_fusion and unir_temas_a_mano", () => {
  const decisiones = (c: pg.PoolClient) =>
    c.query("select tipo, tema_nombre, otro_tema_nombre from public.decisiones_de_tema").then((r) => r.rows)

  it("mismo applies the proposal and records fusion_aceptada with both names", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    await como(comoConi, async (c) => {
      await c.query("select public.decidir_fusion($1, 'mismo')", [id])
      await asumir(c, comoPostgres)
      expect((await c.query("select estado from public.fusiones where id = $1", [id])).rows).toEqual([
        { estado: "aplicada" },
      ])
      expect((await c.query("select fusionado_en from public.temas where id = $1", [e.perdedor])).rows).toEqual([
        { fusionado_en: e.ganador },
      ])
      expect(await decisiones(c)).toEqual([
        { tipo: "fusion_aceptada", tema_nombre: "Ganador", otro_tema_nombre: "Perdedor" },
      ])
    })
  })

  it("parte_de stores the loser under the winner, closes the proposal and records fusion_rechazada", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    await como(comoConi, async (c) => {
      await c.query("select public.decidir_fusion($1, 'parte_de')", [id])
      await asumir(c, comoPostgres)
      expect((await c.query("select tema_id, padre_id, origen from public.temas_subtemas")).rows).toEqual([
        { tema_id: e.perdedor, padre_id: e.ganador, origen: "coni" },
      ])
      expect((await c.query("select estado from public.fusiones")).rows).toEqual([{ estado: "rechazada" }])
      expect(await decisiones(c)).toEqual([
        { tipo: "fusion_rechazada", tema_nombre: "Ganador", otro_tema_nombre: "Perdedor" },
      ])
    })
  })

  it("distintos remembers the pair as Coni's, so it is never offered again, and records fusion_rechazada", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    await como(comoConi, async (c) => {
      await c.query("select public.decidir_fusion($1, 'distintos')", [id])
      await asumir(c, comoServicio)
      expect((await c.query("select * from public.temas_parecidos(0.6)")).rows).toEqual([])
      await asumir(c, comoPostgres)
      expect((await c.query("select origen from public.temas_fusion_rechazada")).rows).toEqual([{ origen: "coni" }])
      expect(await decisiones(c)).toHaveLength(1)
    })
  })

  it("keeps Coni's verdict on the row next to Claude's, whichever way she decided", async () => {
    for (const veredicto of ["mismo", "parte_de", "distintos"]) {
      const e = await escenaDeFusion()
      const id = await propuesta(e.ganador, e.perdedor)
      await como(comoConi, async (c) => {
        await c.query("select public.decidir_fusion($1, $2)", [id, veredicto])
        await asumir(c, comoPostgres)
        const { rows } = await c.query("select veredicto, veredicto_coni from public.fusiones where id = $1", [id])
        expect(rows).toEqual([{ veredicto: "mismo", veredicto_coni: veredicto }])
      })
      await limpiarFusiones()
    }
  })

  it("refuses a decided proposal and an unknown verdict", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.decidir_fusion($1, 'quizas')", [id])).message).toBe("veredicto_invalido")
      await c.query("select public.decidir_fusion($1, 'distintos')", [id])
      expect((await fallaCon(c, "select public.decidir_fusion($1, 'mismo')", [id])).message).toBe("fusion_ya_decidida")
    })
  })

  it("joins a rejected pair into the topic with more claims, forgets the rejection and records fusion_aceptada", async () => {
    const e = await escenaDeFusion()
    await afirmacion(vec({ 0: 1 }), { tema: e.perdedor })
    await pool.query("insert into public.temas_fusion_rechazada (tema_a, tema_b) values ($1, $2)", [
      ...[e.ganador, e.perdedor].sort(),
    ])
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ id: string }>("select public.unir_temas_a_mano($1, $2) as id", [
        e.ganador,
        e.perdedor,
      ])
      await asumir(c, comoPostgres)
      const fusion = await c.query(
        "select ganador_id, perdedor_id, origen, estado from public.fusiones where id = $1",
        [rows[0]?.id],
      )
      expect(fusion.rows).toEqual([
        { ganador_id: e.perdedor, perdedor_id: e.ganador, origen: "coni", estado: "aplicada" },
      ])
      expect((await c.query("select 1 from public.temas_fusion_rechazada")).rows).toEqual([])
      expect(await decisiones(c)).toEqual([
        { tipo: "fusion_aceptada", tema_nombre: "Perdedor", otro_tema_nombre: "Ganador" },
      ])
    })
  })

  it("applies the open proposal of a rejected pair instead of failing on the one-proposal-per-pair index", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    await pool.query("insert into public.temas_fusion_rechazada (tema_a, tema_b) values ($1, $2)", [
      ...[e.ganador, e.perdedor].sort(),
    ])
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ id: string }>("select public.unir_temas_a_mano($1, $2) as id", [
        e.perdedor,
        e.ganador,
      ])
      expect(rows[0]?.id).toBe(id)
      await asumir(c, comoPostgres)
      const fusiones = await c.query("select id, estado, veredicto_coni from public.fusiones")
      expect(fusiones.rows).toEqual([{ id, estado: "aplicada", veredicto_coni: "mismo" }])
      expect((await c.query("select 1 from public.temas_fusion_rechazada")).rows).toEqual([])
      expect(await decisiones(c)).toEqual([
        { tipo: "fusion_aceptada", tema_nombre: "Ganador", otro_tema_nombre: "Perdedor" },
      ])
    })
  })

  it("refuses to join a pair that was not rejected, and lets only Coni decide or join", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.unir_temas_a_mano($1, $2)", [e.ganador, e.perdedor])).message).toBe(
        "par_no_rechazado",
      )
    })
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        expect((await fallaCon(c, "select public.decidir_fusion($1, 'mismo')", [id])).message).toBe("sin_permiso")
        expect((await fallaCon(c, "select public.unir_temas_a_mano($1, $2)", [e.ganador, e.perdedor])).message).toBe(
          "sin_permiso",
        )
      })
    }
  })
})
