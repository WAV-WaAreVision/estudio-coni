// tests/integration/voz-antes-de-firmar-esquema.test.ts
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

describe("la voz antes de la firma, en la base", () => {
  it("lets Coni send a script without gate 1 to grabando_voz, and the voice task bring it back", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      await c.query(
        "update public.piezas set estado = 'grabando_voz', intento = intento + 1, version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoServicio)
      await c.query(
        "update public.piezas set estado = 'guion_por_aprobar', audio_id = 'voces/x.mp3', version = version + 1 where id = $1",
        [id],
      )
      await asumir(c, comoPostgres)
      expect(await leer(c, id)).toMatchObject({
        estado: "guion_por_aprobar",
        puerta1_hash: null,
        audio_id: "voces/x.mp3",
      })
    })
  })

  it("still refuses en_render without gate 1", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'en_render', version = version + 1 where id = $1",
        [id],
      )
      expect(error.constraint).toBe("aprobada_para_grabar")
    })
  })
})
