import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { actualizar, crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

describe("avatar de la pieza: esquema", () => {
  it("starts empty and only Coni chooses it", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      expect((await leer(c, id)).avatar_id).toBeNull()

      await asumir(c, comoServicio)
      const delServicio = await fallaCon(
        c,
        "update public.piezas set avatar_id = 'look_a', version = $2 where id = $1",
        [id, version + 1],
      )
      expect(delServicio.code).toBe("42501")
      expect(delServicio.message).toBe("solo_coni_elige_avatar")

      await asumir(c, comoMantenedor)
      const delMantenedor = await c.query("update public.piezas set avatar_id = 'look_a', version = $2 where id = $1", [
        id,
        version + 1,
      ])
      expect(delMantenedor.rowCount).toBe(0)

      await asumir(c, comoConi)
      const { rows } = await actualizar(c, id, version, { avatar_id: "look_a", version: version + 1 })
      expect(rows[0]?.avatar_id).toBe("look_a")
    })
  })

  it("refuses to approve gate 1 without a chosen avatar", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        `update public.piezas set estado = 'en_render', puerta1_hash = $3, puerta1_en = now(), version = $2
         where id = $1`,
        [id, version + 1, "h".repeat(64)],
      )
      expect(error.code).toBe("42501")
      expect(error.message).toBe("falta_avatar")
    })
  })

  it("lets her choose and approve in the same write, and the audit row names her and the avatar", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      await actualizar(c, id, version, {
        estado: "en_render",
        avatar_id: "look_a",
        puerta1_hash: "h".repeat(64),
        puerta1_en: new Date().toISOString(),
        version: version + 1,
      })
      await asumir(c, comoPostgres)
      const { rows } = await c.query(
        "select actor_usuario, datos ->> 'avatar_id' as avatar from public.eventos where pieza_id = $1 order by id desc limit 1",
        [id],
      )
      expect(rows[0]).toEqual({ actor_usuario: CONI, avatar: "look_a" })
    })
  })

  it("does not let the avatar change once the piece left the script screen", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "update public.piezas set avatar_id = 'otro', version = $2 where id = $1", [
        id,
        version + 1,
      ])
      expect(error.message).toBe("avatar_fuera_del_guion")
    })
  })
})
