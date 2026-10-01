import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

describe("consultas", () => {
  it("lets Coni note one, stamped by the database, and read it back", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ anotada_en: Date }>(
        "insert into public.consultas default values returning anotada_en",
      )
      expect(Math.abs(Date.now() - (rows[0]?.anotada_en.getTime() ?? 0))).toBeLessThan(10_000)
      expect((await c.query("select * from public.consultas")).rowCount).toBe(1)
    })
  })

  it("lets the maintainer read the total but not note or undo one", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.consultas default values")
      await asumir(c, comoMantenedor)
      expect((await c.query("select * from public.consultas")).rowCount).toBe(1)
      const alta = await fallaCon(c, "insert into public.consultas default values")
      expect(alta.message).toMatch(/row-level security/)
      expect((await c.query("delete from public.consultas")).rowCount).toBe(0)
    })
  })

  it("hides everything from a signed-in user who is not a member", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.consultas default values")
      await asumir(c, comoOtra)
      expect((await c.query("select * from public.consultas")).rowCount).toBe(0)
      const alta = await fallaCon(c, "insert into public.consultas default values")
      expect(alta.message).toMatch(/row-level security/)
    })
  })

  it("lets Coni undo a tap from the last day but not rewrite the earlier history", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(
        "insert into public.consultas (anotada_en) values (now() - interval '2 hours'), (now() - interval '3 days')",
      )
      await asumir(c, comoConi)
      expect((await c.query("delete from public.consultas")).rowCount).toBe(1)
      expect((await c.query("select * from public.consultas")).rowCount).toBe(1)
    })
  })

  it("does not let anybody change a note after the fact", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.consultas default values")
      await asumir(c, comoConi)
      const cambio = await fallaCon(c, "update public.consultas set anotada_en = now() - interval '1 year'")
      expect(cambio.message).toMatch(/permission denied/)
    })
  })
})
