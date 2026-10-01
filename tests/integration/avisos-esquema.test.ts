import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { crearPieza } from "./flujo"

afterAll(() => pool.end())

const NUEVO = "insert into public.avisos (tipo, clave, mensaje) values ('guion_listo', $1, 'Tienes un guion listo.')"

describe("avisos", () => {
  it("lets only the service role write a notice", async () => {
    await como(comoServicio, async (c) => {
      await c.query(NUEVO, ["a"])
      expect((await c.query("select * from public.avisos")).rowCount).toBe(1)
    })
    for (const sesion of [comoConi, comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        const error = await fallaCon(c, NUEVO, ["b"])
        expect(error.message).toMatch(/permission denied/)
      })
    }
  })

  it("lets Coni and WAV read notices and hides them from anybody else", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(NUEVO, ["a"])
      for (const [sesion, filas] of [
        [comoConi, 1],
        [comoMantenedor, 1],
        [comoOtra, 0],
      ] as const) {
        await asumir(c, sesion)
        expect((await c.query("select * from public.avisos")).rowCount).toBe(filas)
      }
    })
  })

  it("keeps a retried run from creating the same notice twice", async () => {
    await como(comoServicio, async (c) => {
      await c.query(NUEVO, ["misma"])
      const repetido = await fallaCon(c, NUEVO, ["misma"])
      expect(repetido.code).toBe("23505")
    })
  })

  it("lets Coni mark a notice as read but change nothing else of it", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(NUEVO, ["a"])
      await asumir(c, comoConi)
      const leido = await c.query("update public.avisos set leido_en = now() returning leido_en")
      expect(leido.rows[0]?.leido_en).toBeInstanceOf(Date)
      const cambio = await fallaCon(c, "update public.avisos set mensaje = 'otra cosa'")
      expect(cambio.message).toMatch(/permission denied/)
      const borrado = await fallaCon(c, "delete from public.avisos")
      expect(borrado.message).toMatch(/permission denied/)
    })
  })

  it("does not let the maintainer mark notices as read: they are Coni's", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(NUEVO, ["a"])
      await asumir(c, comoMantenedor)
      expect((await c.query("update public.avisos set leido_en = now()")).rowCount).toBe(0)
    })
  })

  it("accepts only the kinds of the design and a channel that matches the send time", async () => {
    await como(comoPostgres, async (c) => {
      const tipoRaro = await fallaCon(c, "insert into public.avisos (tipo, clave, mensaje) values ('otro', 'x', 'm')")
      expect(tipoRaro.message).toMatch(/avisos_tipo_check|check constraint/)
      const sinCanal = await fallaCon(
        c,
        "insert into public.avisos (tipo, clave, mensaje, enviado_en) values ('guion_listo', 'y', 'm', now())",
      )
      expect(sinCanal.message).toMatch(/envio_con_canal|check constraint/)
      await c.query(
        "insert into public.avisos (tipo, clave, mensaje, enviado_en, canal) values ('publicado', 'z', 'm', now(), 'push')",
      )
    })
  })

  it("points at a piece and is audited like the other tables", async () => {
    await como(comoPostgres, async (c) => {
      const piezaId = await crearPieza(c)
      await asumir(c, comoPostgres)
      const antes = await c.query<{ n: string }>("select count(*) as n from public.eventos where tabla = 'avisos'")
      await c.query("insert into public.avisos (tipo, clave, mensaje, pieza_id) values ('publicado', 'p', 'm', $1)", [
        piezaId,
      ])
      await asumir(c, comoServicio)
      await c.query("update public.avisos set enviado_en = now(), canal = 'correo' where clave = 'p'")
      await asumir(c, comoPostgres)
      const despues = await c.query<{ n: string; roles: string[] }>(
        "select count(*) as n, array_agg(actor_rol order by id) as roles from public.eventos where tabla = 'avisos'",
      )
      expect(Number(despues.rows[0]?.n) - Number(antes.rows[0]?.n)).toBe(2)
      expect(despues.rows[0]?.roles.slice(-1)).toEqual(["service_role"])
    })
  })

  it("goes away with its piece, so cleaning up pieces never trips over a notice", async () => {
    await como(comoPostgres, async (c) => {
      const piezaId = await crearPieza(c)
      await c.query("insert into public.avisos (tipo, clave, mensaje, pieza_id) values ('publicado', 'p', 'm', $1)", [
        piezaId,
      ])
      await c.query("delete from public.piezas where id = $1", [piezaId])
      expect((await c.query("select * from public.avisos")).rowCount).toBe(0)
    })
  })
})
