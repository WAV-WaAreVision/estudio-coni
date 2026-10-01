import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

const HUELLA_A = "a".repeat(64)
const HUELLA_B = "b".repeat(64)

async function clic(c: Parameters<Parameters<typeof como>[1]>[0], enlace: string, huella: string, dia: string) {
  const { rows } = await c.query<{ r: boolean }>("select public.registrar_clic($1, $2, $3::date) as r", [
    enlace,
    huella,
    dia,
  ])
  return rows[0]?.r
}

async function total(c: Parameters<Parameters<typeof como>[1]>[0], enlace: string, dia: string): Promise<number> {
  const { rows } = await c.query<{ clics: number }>(
    "select clics from public.clics_enlace_dia where enlace = $1 and dia = $2::date",
    [enlace, dia],
  )
  return rows[0]?.clics ?? 0
}

describe("registrar_clic", () => {
  it("counts a visitor once per link per day and says whether it counted", async () => {
    await como(comoServicio, async (c) => {
      expect(await clic(c, "agenda", HUELLA_A, "2026-10-09")).toBe(true)
      expect(await clic(c, "agenda", HUELLA_A, "2026-10-09")).toBe(false)
      expect(await clic(c, "agenda", HUELLA_A, "2026-10-09")).toBe(false)
      expect(await total(c, "agenda", "2026-10-09")).toBe(1)
    })
  })

  it("counts another visitor, another link and another day separately", async () => {
    await como(comoServicio, async (c) => {
      await clic(c, "agenda", HUELLA_A, "2026-10-09")
      expect(await clic(c, "agenda", HUELLA_B, "2026-10-09")).toBe(true)
      expect(await clic(c, "libros", HUELLA_A, "2026-10-09")).toBe(true)
      expect(await clic(c, "agenda", HUELLA_A, "2026-10-10")).toBe(true)
      expect(await total(c, "agenda", "2026-10-09")).toBe(2)
      expect(await total(c, "libros", "2026-10-09")).toBe(1)
      expect(await total(c, "agenda", "2026-10-10")).toBe(1)
    })
  })

  it("forgets the visitors of earlier days and keeps their counts", async () => {
    await como(comoServicio, async (c) => {
      await clic(c, "agenda", HUELLA_A, "2026-10-08")
      await clic(c, "agenda", HUELLA_A, "2026-10-09")
      expect((await c.query("select * from public.visitas_clic")).rowCount).toBe(2)

      await clic(c, "agenda", HUELLA_B, "2026-10-10")

      const { rows } = await c.query<{ dia: string }>(
        "select to_char(dia, 'YYYY-MM-DD') as dia from public.visitas_clic order by dia",
      )
      expect(rows.map((r) => r.dia)).toEqual(["2026-10-09", "2026-10-10"])
      expect(await total(c, "agenda", "2026-10-08")).toBe(1)
    })
  })

  it("stores nothing but a day, a link and a 64-character hash per visitor", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'visitas_clic' order by ordinal_position",
      )
      expect(rows.map((r) => r.column_name)).toEqual(["dia", "enlace", "visitante"])
      const ip = await fallaCon(c, "insert into public.visitas_clic values ('2026-10-09', 'agenda', '190.20.30.40')")
      expect(ip.code).toBe("23514")
    })
  })

  it.each([
    ["Coni", comoConi],
    ["the maintainer", comoMantenedor],
    ["another signed-in user", comoOtra],
  ])("is not callable by %s", async (_nombre, sesion) => {
    await como(comoPostgres, async (c) => {
      await asumir(c, sesion)
      const error = await fallaCon(c, "select public.registrar_clic('agenda', $1, '2026-10-09')", [HUELLA_A])
      expect(error.message).toMatch(/permission denied/)
    })
  })
})

describe("lectura de clics", () => {
  it("lets Coni and the maintainer read the counts, and nobody read the visitors", async () => {
    await como(comoServicio, async (c) => {
      await clic(c, "agenda", HUELLA_A, "2026-10-09")
      for (const lector of [comoConi, comoMantenedor]) {
        await asumir(c, lector)
        expect((await c.query("select * from public.clics_enlace_dia")).rowCount).toBe(1)
        const error = await fallaCon(c, "select * from public.visitas_clic")
        expect(error.message).toMatch(/permission denied/)
      }
      await asumir(c, comoOtra)
      expect((await c.query("select * from public.clics_enlace_dia")).rowCount).toBe(0)
    })
  })
})

describe("ajustes.enlaces", () => {
  it("starts with Coni's four links, none with an address yet, so the page shows none until one is set", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ enlaces: { id: string; url: string | null }[] }>(
        "select enlaces from public.ajustes",
      )
      expect(rows[0]?.enlaces.map((e) => e.id)).toEqual(["agenda", "taller", "libros", "ring"])
      expect(rows[0]?.enlaces.every((e) => e.url === null)).toBe(true)
    })
  })

  it("only accepts a list", async () => {
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(c, `update public.ajustes set enlaces = '{"id": "agenda"}'::jsonb`)
      expect(error.code).toBe("23514")
    })
  })
})

describe("olvidar_visitas_clic", () => {
  it("forgets the visitors from before a day, keeps the counts and is for the service only", async () => {
    await como(comoServicio, async (c) => {
      await clic(c, "agenda", HUELLA_A, "2026-10-09")
      await clic(c, "libros", HUELLA_B, "2026-10-09")
      const { rows } = await c.query<{ n: number }>("select public.olvidar_visitas_clic('2026-10-10'::date) as n")
      expect(rows[0]?.n).toBe(2)
      expect((await c.query("select * from public.visitas_clic")).rowCount).toBe(0)
      expect(await total(c, "agenda", "2026-10-09")).toBe(1)
    })
    await como(comoPostgres, async (c) => {
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.olvidar_visitas_clic('2026-10-10'::date)")
      expect(error.message).toMatch(/permission denied/)
    })
  })
})
