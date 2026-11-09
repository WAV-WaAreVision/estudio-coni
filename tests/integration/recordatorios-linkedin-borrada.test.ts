import { afterAll, describe, expect, it } from "vitest"
import { como, comoPostgres, pool } from "./db"

afterAll(() => pool.end())

describe("recordatorios_linkedin", () => {
  it("is gone: the nightly WAV email that claimed weeks in it was removed with the Excel importer", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ tabla: string | null }>(
        "select to_regclass('public.recordatorios_linkedin')::text as tabla",
      )
      expect(rows[0]?.tabla).toBeNull()
    })
  })
})
