import { afterAll, describe, expect, it } from "vitest"
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
  MANTENEDOR,
  pool,
} from "./db"

afterAll(() => pool.end())

async function nuevaPieza(c: Parameters<Parameters<typeof como>[1]>[0]): Promise<string> {
  const { rows } = await c.query<{ id: string }>("insert into public.piezas (titulo) values ('Post') returning id")
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  return id
}

const NUMEROS =
  "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen) values ($1, $2, 1200, 14, 3, 1, $3)"
const SEGUIDORES = "insert into public.metricas_linkedin_cuenta (semana, seguidores, origen) values ($1, 830, $2)"

describe("métricas de LinkedIn", () => {
  it.each([
    ["Coni", comoConi, CONI],
    ["the maintainer", comoMantenedor, MANTENEDOR],
  ])("lets %s note manual numbers and seals them with their id", async (_nombre, sesion, id) => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, sesion)
      await c.query(NUMEROS, [pieza, "2026-10-19", "manual"])
      await c.query(SEGUIDORES, ["2026-10-19", "manual"])
      const { rows } = await c.query("select anotado_por, origen from public.metricas_linkedin")
      expect(rows).toEqual([{ anotado_por: id, origen: "manual" }])
      const cuenta = await c.query("select anotado_por from public.metricas_linkedin_cuenta")
      expect(cuenta.rows).toEqual([{ anotado_por: id }])
    })
  })

  it("ignores an anotado_por the client sends", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      await c.query(
        "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, origen, anotado_por) values ($1, '2026-10-19', 5, 'manual', $2)",
        [pieza, MANTENEDOR],
      )
      const { rows } = await c.query("select anotado_por from public.metricas_linkedin")
      expect(rows).toEqual([{ anotado_por: CONI }])
    })
  })

  it("keeps api and metricool rows for the service", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      const error = await fallaCon(c, NUMEROS, [pieza, "2026-10-19", "api"])
      expect(error.message).toMatch(/row-level security/)
      await asumir(c, comoServicio)
      await c.query(NUMEROS, [pieza, "2026-10-19", "metricool"])
      const { rows } = await c.query("select anotado_por from public.metricas_linkedin")
      expect(rows).toEqual([{ anotado_por: null }])
    })
  })

  it("shows nothing to a signed-in user who is not a member and does not let them write", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-19", "api"])
      await asumir(c, comoOtra)
      expect((await c.query("select * from public.metricas_linkedin")).rowCount).toBe(0)
      expect((await c.query("select * from public.metricas_linkedin_ultima")).rowCount).toBe(0)
      const error = await fallaCon(c, SEGUIDORES, ["2026-10-19", "manual"])
      expect(error.message).toMatch(/row-level security/)
    })
  })

  it("rejects a manual writer updating an api row, on both tables", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-19", "api"])
      await c.query(SEGUIDORES, ["2026-10-19", "metricool"])
      await asumir(c, comoConi)
      const numeros = await c.query(
        "update public.metricas_linkedin set impresiones = 1, origen = 'manual' where pieza_id = $1",
        [pieza],
      )
      const cuenta = await c.query("update public.metricas_linkedin_cuenta set seguidores = 1, origen = 'manual'")
      expect([numeros.rowCount, cuenta.rowCount]).toEqual([0, 0])
      await asumir(c, comoPostgres)
      const { rows } = await c.query("select impresiones, origen from public.metricas_linkedin")
      expect(rows).toEqual([{ impresiones: 1200, origen: "api" }])
    })
  })

  it("lets a manual writer correct a manual row", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-19", "manual"])
      await c.query(SEGUIDORES, ["2026-10-19", "manual"])
      await asumir(c, comoMantenedor)
      const numeros = await c.query("update public.metricas_linkedin set impresiones = 1300 where pieza_id = $1", [
        pieza,
      ])
      const cuenta = await c.query("update public.metricas_linkedin_cuenta set seguidores = 900")
      expect([numeros.rowCount, cuenta.rowCount]).toEqual([1, 1])
    })
  })

  it("lets nobody signed in delete a row", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-19", "manual"])
      await asumir(c, comoConi)
      const error = await fallaCon(c, "delete from public.metricas_linkedin")
      expect(error.message).toMatch(/permission denied/)
    })
  })

  it("keeps one row per post per day, refuses negative figures and a week that does not start on Monday", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-19", "manual"])
      expect((await fallaCon(c, NUMEROS, [pieza, "2026-10-19", "manual"])).code).toBe("23505")
      const negativa = await fallaCon(
        c,
        "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, origen) values ($1, '2026-10-20', -1, 'manual')",
        [pieza],
      )
      expect(negativa.code).toBe("23514")
      expect((await fallaCon(c, SEGUIDORES, ["2026-10-20", "manual"])).code).toBe("23514")
      expect((await fallaCon(c, NUMEROS, [pieza, "2026-10-21", "a mano"])).code).toBe("23514")
    })
  })

  it("gives the newest row of each post in the view", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(NUMEROS, [pieza, "2026-10-12", "manual"])
      await c.query(
        "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, origen) values ($1, '2026-10-19', 2000, 'manual')",
        [pieza],
      )
      await asumir(c, comoMantenedor)
      const { rows } = await c.query("select medido_en::text, impresiones from public.metricas_linkedin_ultima")
      expect(rows).toEqual([{ medido_en: "2026-10-19", impresiones: 2000 }])
    })
  })

  it("saves nothing of a post when the followers of the same save cannot be written", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(SEGUIDORES, ["2026-10-19", "api"])
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "select public.anotar_numeros_linkedin('2026-10-19', '2026-10-19', $1::jsonb, 900)",
        [JSON.stringify([{ pieza_id: pieza, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }])],
      )
      expect(error.message).toMatch(/row-level security/)
      await asumir(c, comoPostgres)
      expect((await c.query("select * from public.metricas_linkedin")).rowCount).toBe(0)
      const { rows } = await c.query("select seguidores, origen from public.metricas_linkedin_cuenta")
      expect(rows).toEqual([{ seguidores: 830, origen: "api" }])
    })
  })

  it("does not let anyone signed out run the weekly save", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("set local role anon")
      const error = await fallaCon(
        c,
        "select public.anotar_numeros_linkedin('2026-10-19', '2026-10-19', '[]'::jsonb, 900)",
      )
      expect(error.message).toMatch(/permission denied for function/)
    })
  })
})
