import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, comoConi, comoServicio, fallaCon, pool } from "./db"
import { crearCarruselEn } from "./flujo"

afterAll(() => pool.end())

/** Every case runs in its own transaction and is rolled back: nothing stays in the database. */
async function enTransaccion(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await fn(c)
  } finally {
    await c.query("rollback")
    c.release()
  }
}

async function tiempos(c: pg.PoolClient, id: string) {
  const { rows } = await c.query<{
    id: string
    estado: string
    armado_pedido_en: Date | null
    armado_empezo_en: Date | null
  }>(
    `select id, estado, armado_pedido_en, armado_empezo_en from public.carruseles
      where pieza_id = $1 order by version desc limit 1`,
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`El carrusel ${id} no tiene versión`)
  return fila
}

describe("20261027000150: when a carousel's render was asked for and when it started", () => {
  it("stamps the request on the latest version when Coni signs it", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      const v = await tiempos(c, id)
      expect(v.armado_pedido_en).toBeInstanceOf(Date)
      expect(v.armado_empezo_en).toBeNull()
    })
  })

  it("asks again on Reintentar and forgets the start of the attempt that failed", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      const v = await tiempos(c, id)
      await c.query("update public.carruseles set estado = 'fallo', armado_empezo_en = $2 where id = $1", [
        v.id,
        "2026-10-01T12:00:00Z",
      ])
      await c.query(`update public.carruseles set armado_pedido_en = '2026-10-01T11:00:00Z' where id = $1`, [v.id])
      await c.query(
        `update public.piezas set estado = 'error_produccion', estado_antes_del_error = 'armando_carrusel',
         explicacion = 'No pude armar el carrusel.', version = version + 1 where id = $1`,
        [id],
      )
      await asumir(c, comoConi)
      await c.query(
        `update public.piezas set estado = 'armando_carrusel', estado_antes_del_error = null, explicacion = null,
         intento = intento + 1, version = version + 1 where id = $1`,
        [id],
      )
      const despues = await tiempos(c, id)
      expect(despues.armado_empezo_en).toBeNull()
      expect(despues.armado_pedido_en?.toISOString()).not.toBe("2026-10-01T11:00:00.000Z")
    })
  })

  it("never moves the timestamps of a rendered version, not even for the service", async () => {
    await enTransaccion(async (c) => {
      const id = await crearCarruselEn(c, "armando_carrusel")
      await asumir(c, comoServicio)
      const v = await tiempos(c, id)
      await c.query(
        `update public.carruseles set estado = 'listo', armado_empezo_en = now(), pdf_clave = $2,
         png_claves = array_fill('carruseles/lamina.png'::text, array[jsonb_array_length(laminas)]) where id = $1`,
        [v.id, `carruseles/${id}/${v.id}/carrusel.pdf`],
      )
      const error = await fallaCon(
        c,
        "update public.carruseles set armado_empezo_en = now() + interval '1 hour' where id = $1",
        [v.id],
      )
      expect(error.message).toBe("carrusel_inmutable")
    })
  })
})
