import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { como, comoConi, comoMantenedor, fallaCon, pool } from "./db"

let antes: string | null = null

beforeAll(async () => {
  const { rows } = await pool.query<{ ultima_red: string | null }>("select ultima_red from public.ajustes")
  antes = rows[0]?.ultima_red ?? null
})

afterAll(async () => {
  await pool.query("update public.ajustes set ultima_red = $1", [antes])
  await pool.end()
})

describe("ajustes.ultima_red", () => {
  it("is empty until a network is stored, and takes only LinkedIn or Instagram", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set ultima_red = null")
      const { rows } = await c.query<{ ultima_red: string | null }>("select ultima_red from public.ajustes")
      expect(rows).toEqual([{ ultima_red: null }])
      const error = await fallaCon(c, "update public.ajustes set ultima_red = 'youtube'")
      expect(error.code).toBe("23514")
      expect(error.constraint).toBe("ultima_red_valida")
    })
  })

  it("is written by Coni through row level security; WAV's session changes no row", async () => {
    await como(comoMantenedor, async (c) => {
      const { rowCount } = await c.query("update public.ajustes set ultima_red = 'instagram'")
      expect(rowCount).toBe(0)
    })
    await como(comoConi, async (c) => {
      const { rows } = await c.query("update public.ajustes set ultima_red = 'instagram' returning ultima_red")
      expect(rows).toEqual([{ ultima_red: "instagram" }])
    })
  })
})
