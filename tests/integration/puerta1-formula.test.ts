import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoPostgres, fallaCon, pool } from "./db"
import { actualizar, crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

describe("puerta1_formula", () => {
  it("exists, starts empty and accepts only formulas 1, 2 and 3", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      expect((await leer(c, id)).puerta1_formula).toBeNull()
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        `update public.piezas set avatar_id = 'look_a', estado = 'en_render', puerta1_hash = $3, puerta1_formula = 4,
         version = $2 where id = $1`,
        [id, version + 1, "h".repeat(64)],
      )
      expect(error.code).toBe("23514")
    })
  })

  it("accepts formula 3 together with the gate 1 approval", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const { rows } = await actualizar(c, id, version, {
        estado: "en_render",
        avatar_id: "look_a",
        puerta1_hash: "h".repeat(64),
        puerta1_en: new Date().toISOString(),
        puerta1_formula: 3,
        version: version + 1,
      })
      expect(rows[0]?.puerta1_formula).toBe(3)
    })
  })

  it("is written only together with the gate 1 approval", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const suelta = await fallaCon(c, "update public.piezas set puerta1_formula = 2, version = $2 where id = $1", [
        id,
        version + 1,
      ])
      expect(suelta.message).toBe("formula_solo_con_aprobacion")

      const { rows } = await actualizar(c, id, version, {
        estado: "en_render",
        avatar_id: "look_a",
        puerta1_hash: "h".repeat(64),
        puerta1_en: new Date().toISOString(),
        puerta1_formula: 2,
        version: version + 1,
      })
      expect(rows[0]?.puerta1_formula).toBe(2)
    })
  })
})
