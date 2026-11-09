import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { como, comoConi, comoMantenedor, comoOtra, comoServicio, fallaCon, pool } from "./db"
import { afirmacion, limpiarFusiones, propuesta, tema, vec } from "./fusiones-comun"

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
