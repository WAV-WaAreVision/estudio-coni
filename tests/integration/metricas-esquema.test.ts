import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

async function nuevaPieza(c: Parameters<Parameters<typeof como>[1]>[0]): Promise<string> {
  const { rows } = await c.query<{ id: string }>("insert into public.piezas (titulo) values ('Reel') returning id")
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  return id
}

const NUEVA_LECTURA =
  "insert into public.metricas_reel (pieza_id, dia, alcance, guardados) values ($1, '2026-10-09', 2400, 121)"

describe("tablas de métricas", () => {
  it("lets the service write a reading and Coni and the maintainer read it", async () => {
    await como(comoPostgres, async (c) => {
      const id = await nuevaPieza(c)
      await asumir(c, comoServicio)
      await c.query(NUEVA_LECTURA, [id])
      await c.query("insert into public.metricas_cuenta (dia, toques_perfil) values ('2026-10-09', 4)")
      for (const lector of [comoConi, comoMantenedor]) {
        await asumir(c, lector)
        expect((await c.query("select * from public.metricas_reel")).rowCount).toBe(1)
        expect((await c.query("select * from public.metricas_cuenta")).rowCount).toBe(1)
      }
    })
  })

  it("shows nothing to a signed-in user who is not a member", async () => {
    await como(comoPostgres, async (c) => {
      const id = await nuevaPieza(c)
      await c.query(NUEVA_LECTURA, [id])
      await asumir(c, comoOtra)
      expect((await c.query("select * from public.metricas_reel")).rowCount).toBe(0)
    })
  })

  it.each([
    ["Coni", comoConi],
    ["the maintainer", comoMantenedor],
  ])("does not let %s write readings: only the task does", async (_nombre, sesion) => {
    await como(comoPostgres, async (c) => {
      const id = await nuevaPieza(c)
      await asumir(c, sesion)
      const error = await fallaCon(c, NUEVA_LECTURA, [id])
      expect(error.message).toMatch(/permission denied|row-level security/)
      const cuenta = await fallaCon(
        c,
        "insert into public.metricas_cuenta (dia, toques_perfil) values ('2026-10-09', 1)",
      )
      expect(cuenta.message).toMatch(/permission denied|row-level security/)
    })
  })

  it("keeps one reading per reel per day and refuses negative figures", async () => {
    await como(comoPostgres, async (c) => {
      const id = await nuevaPieza(c)
      await c.query(NUEVA_LECTURA, [id])
      const repetida = await fallaCon(c, NUEVA_LECTURA, [id])
      expect(repetida.code).toBe("23505")
      const negativa = await fallaCon(
        c,
        "insert into public.metricas_reel (pieza_id, dia, guardados) values ($1, '2026-10-10', -1)",
        [id],
      )
      expect(negativa.code).toBe("23514")
    })
  })

  it("keeps an unknown figure unknown", async () => {
    await como(comoPostgres, async (c) => {
      const id = await nuevaPieza(c)
      await c.query("insert into public.metricas_reel (pieza_id, dia) values ($1, '2026-10-09')", [id])
      const { rows } = await c.query("select alcance, guardados, tiempo_promedio from public.metricas_reel")
      expect(rows[0]).toEqual({ alcance: null, guardados: null, tiempo_promedio: null })
    })
  })

  it("is read by the service role as well (the task upserts)", async () => {
    await como(comoServicio, async (c) => {
      expect((await c.query("select * from public.metricas_reel")).rowCount).toBe(0)
    })
  })
})

describe("metricas_reel_ultima", () => {
  it("gives the newest reading of each reel, for whoever can read the table", async () => {
    await como(comoPostgres, async (c) => {
      const a = await nuevaPieza(c)
      const b = await nuevaPieza(c)
      await c.query(
        `insert into public.metricas_reel (pieza_id, dia, guardados) values
           ($1, '2026-10-01', 1), ($1, '2026-10-03', 3), ($1, '2026-10-02', 2), ($2, '2026-09-20', 9)`,
        [a, b],
      )
      await asumir(c, comoConi)
      const { rows } = await c.query<{ pieza_id: string; guardados: number }>(
        "select pieza_id, guardados from public.metricas_reel_ultima order by guardados",
      )
      expect(rows.map((r) => r.guardados)).toEqual([3, 9])
    })
  })

  it("shows nothing to a signed-in user who is not a member: the table's policy still applies", async () => {
    await como(comoPostgres, async (c) => {
      const a = await nuevaPieza(c)
      await c.query("insert into public.metricas_reel (pieza_id, dia, guardados) values ($1, '2026-10-01', 1)", [a])
      await asumir(c, comoOtra)
      expect((await c.query("select * from public.metricas_reel_ultima")).rowCount).toBe(0)
    })
  })
})
