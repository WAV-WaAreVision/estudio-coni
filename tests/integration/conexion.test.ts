import { afterAll, describe, expect, it } from "vitest"
import { CONI, como, comoConi, comoServicio, pool } from "./db"

afterAll(() => pool.end())

describe("conexión a supabase local", () => {
  it("ve el id de coni en auth.uid cuando actúa como coni", async () => {
    const { rows } = await como(comoConi, (c) => c.query("select auth.uid() as id, current_user as rol"))
    expect(rows[0]).toEqual({ id: CONI, rol: "authenticated" })
  })

  it("no tiene usuario cuando actúa como servicio", async () => {
    const { rows } = await como(comoServicio, (c) => c.query("select auth.uid() as id, current_user as rol"))
    expect(rows[0]).toEqual({ id: null, rol: "service_role" })
  })
})
