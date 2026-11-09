import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

type Cliente = Parameters<Parameters<typeof como>[1]>[0]

async function nuevaPieza(c: Cliente): Promise<string> {
  const { rows } = await c.query<{ id: string }>("insert into public.piezas (titulo) values ('Post') returning id")
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  return id
}

const IMPORTAR = "select public.importar_excel_linkedin($1::date, $2::jsonb, $3::date, $4::integer) as escritas"
const posts = (...lista: { pieza_id: string; impresiones: number | null; interacciones: number | null }[]) =>
  JSON.stringify(lista)
const FILA =
  "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen) values ($1, '2026-10-30', 1200, 14, 3, 1, $2)"

describe("importar_excel_linkedin", () => {
  it("lets only Coni run it: the maintainer is refused with sin_permiso", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoMantenedor)
      const error = await fallaCon(c, IMPORTAR, [
        "2026-10-30",
        posts({ pieza_id: pieza, impresiones: 1, interacciones: 1 }),
        "2026-10-26",
        null,
      ])
      expect([error.code, error.message]).toEqual(["42501", "sin_permiso"])
    })
  })

  it("does not let anyone signed out or the service role execute it", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query(
        `select has_function_privilege('anon', 'public.importar_excel_linkedin(date, jsonb, date, integer)', 'execute') as anon,
                has_function_privilege('service_role', 'public.importar_excel_linkedin(date, jsonb, date, integer)', 'execute') as servicio,
                has_function_privilege('authenticated', 'public.importar_excel_linkedin(date, jsonb, date, integer)', 'execute') as sesion`,
      )
      expect(rows).toEqual([{ anon: false, servicio: false, sesion: true }])
    })
  })

  it("writes each post with origin excel, seals Coni and returns how many rows it wrote", async () => {
    await como(comoPostgres, async (c) => {
      const a = await nuevaPieza(c)
      const b = await nuevaPieza(c)
      await asumir(c, comoConi)
      const { rows } = await c.query(IMPORTAR, [
        "2026-10-30",
        posts(
          { pieza_id: a, impresiones: 1200, interacciones: 12 },
          { pieza_id: b, impresiones: null, interacciones: 4 },
        ),
        "2026-10-26",
        null,
      ])
      expect(rows).toEqual([{ escritas: 2 }])
      await asumir(c, comoPostgres)
      const filas = await c.query(
        "select impresiones, interacciones, origen, anotado_por from public.metricas_linkedin order by interacciones desc",
      )
      expect(filas.rows).toEqual([
        { impresiones: 1200, interacciones: 12, origen: "excel", anotado_por: CONI },
        { impresiones: null, interacciones: 4, origen: "excel", anotado_por: CONI },
      ])
    })
  })

  it("never touches a row that came from the API (nor Metricool) and does not count it", async () => {
    await como(comoPostgres, async (c) => {
      const api = await nuevaPieza(c)
      const metricool = await nuevaPieza(c)
      await c.query(FILA, [api, "api"])
      await c.query(FILA, [metricool, "metricool"])
      await asumir(c, comoConi)
      const { rows } = await c.query(IMPORTAR, [
        "2026-10-30",
        posts(
          { pieza_id: api, impresiones: 5, interacciones: 5 },
          { pieza_id: metricool, impresiones: 5, interacciones: 5 },
        ),
        "2026-10-26",
        null,
      ])
      expect(rows).toEqual([{ escritas: 0 }])
      await asumir(c, comoPostgres)
      const filas = await c.query(
        "select impresiones, interacciones, origen from public.metricas_linkedin order by origen",
      )
      expect(filas.rows).toEqual([
        { impresiones: 1200, interacciones: null, origen: "api" },
        { impresiones: 1200, interacciones: null, origen: "metricool" },
      ])
    })
  })

  it("overwrites a manual row and keeps a figure the Excel does not bring", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await c.query(FILA, [pieza, "manual"])
      await asumir(c, comoConi)
      await c.query(IMPORTAR, [
        "2026-10-30",
        posts({ pieza_id: pieza, impresiones: null, interacciones: 20 }),
        "2026-10-26",
        null,
      ])
      await asumir(c, comoPostgres)
      const { rows } = await c.query(
        "select impresiones, interacciones, reacciones, origen from public.metricas_linkedin",
      )
      expect(rows).toEqual([{ impresiones: 1200, interacciones: 20, reacciones: 14, origen: "excel" }])
    })
  })

  it("keeps the last entry when the same piece comes twice in one import", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      const { rows } = await c.query(IMPORTAR, [
        "2026-10-30",
        posts(
          { pieza_id: pieza, impresiones: 100, interacciones: 1 },
          { pieza_id: pieza, impresiones: 200, interacciones: 2 },
        ),
        "2026-10-26",
        null,
      ])
      expect(rows).toEqual([{ escritas: 1 }])
      await asumir(c, comoPostgres)
      const filas = await c.query("select impresiones, interacciones from public.metricas_linkedin")
      expect(filas.rows).toEqual([{ impresiones: 200, interacciones: 2 }])
    })
  })

  it("upserts the week's followers with origin excel, but never over the API's", async () => {
    await como(comoPostgres, async (c) => {
      await asumir(c, comoConi)
      await c.query(IMPORTAR, ["2026-10-30", "[]", "2026-10-26", 830])
      await c.query(IMPORTAR, ["2026-10-30", "[]", "2026-10-26", 840])
      await asumir(c, comoPostgres)
      await c.query(
        "insert into public.metricas_linkedin_cuenta (semana, seguidores, origen) values ('2026-10-19', 700, 'api')",
      )
      await asumir(c, comoConi)
      await c.query(IMPORTAR, ["2026-10-23", "[]", "2026-10-19", 999])
      await asumir(c, comoPostgres)
      const { rows } = await c.query(
        "select semana::text, seguidores, origen from public.metricas_linkedin_cuenta order by semana",
      )
      expect(rows).toEqual([
        { semana: "2026-10-19", seguidores: 700, origen: "api" },
        { semana: "2026-10-26", seguidores: 840, origen: "excel" },
      ])
    })
  })

  it("writes nothing of the posts when the followers cannot be saved (one transaction)", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      // A week that does not start on Monday breaks the followers' check after the posts were inserted.
      const error = await fallaCon(c, IMPORTAR, [
        "2026-10-30",
        posts({ pieza_id: pieza, impresiones: 1, interacciones: 1 }),
        "2026-10-27",
        830,
      ])
      expect(error.code).toBe("23514")
      await asumir(c, comoPostgres)
      expect((await c.query("select * from public.metricas_linkedin")).rowCount).toBe(0)
    })
  })

  it("gives interacciones as the last column of the newest reading", async () => {
    await como(comoPostgres, async (c) => {
      const pieza = await nuevaPieza(c)
      await asumir(c, comoConi)
      await c.query(IMPORTAR, [
        "2026-10-30",
        posts({ pieza_id: pieza, impresiones: 9, interacciones: 3 }),
        "2026-10-26",
        null,
      ])
      const { rows, fields } = await c.query("select * from public.metricas_linkedin_ultima")
      expect(fields.at(-1)?.name).toBe("interacciones")
      expect(rows[0]).toMatchObject({ impresiones: 9, interacciones: 3, origen: "excel" })
    })
  })
})
