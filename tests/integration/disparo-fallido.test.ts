import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

const MOTIVO = "No pude iniciar el procesamiento. Reintenta."

async function materialEn(c: pg.PoolClient, estado: string, motivo: string | null): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ id: string }>(
    `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado, motivo_fallo)
     select 'documento', id, 'x', now(), $3, $1, $2 from public.categorias limit 1 returning id`,
    [estado, motivo, CONI],
  )
  return rows[0]?.id ?? ""
}

async function motivoDe(c: pg.PoolClient, id: string) {
  await asumir(c, comoPostgres)
  const { rows } = await c.query("select estado, motivo_fallo from public.materiales where id = $1", [id])
  return rows[0]
}

describe("marcar_disparo_fallido", () => {
  it.each([
    ["Coni", comoConi],
    ["the maintainer", comoMantenedor],
  ])("lets %s mark a material still procesando without a reason, keeping it procesando", async (_n, sesion) => {
    await como(comoPostgres, async (c) => {
      const id = await materialEn(c, "procesando", null)
      await asumir(c, sesion)
      await c.query("select public.marcar_disparo_fallido($1)", [id])
      expect(await motivoDe(c, id)).toEqual({ estado: "procesando", motivo_fallo: MOTIVO })
    })
  })

  it("then lets reintentar_material accept it", async () => {
    await como(comoPostgres, async (c) => {
      const id = await materialEn(c, "procesando", null)
      await asumir(c, comoConi)
      await c.query("select public.marcar_disparo_fallido($1)", [id])
      await c.query("select public.reintentar_material($1)", [id])
      expect((await motivoDe(c, id))?.motivo_fallo).toBeNull()
    })
  })

  it.each([
    ["ready", "listo", null],
    ["failed", "fallido", "otro"],
    ["stopped by the cap", "procesando", "tope"],
  ])("does nothing to a %s material", async (_n, estado, motivo) => {
    await como(comoPostgres, async (c) => {
      const id = await materialEn(c, estado, motivo)
      await asumir(c, comoConi)
      await c.query("select public.marcar_disparo_fallido($1)", [id])
      expect(await motivoDe(c, id)).toEqual({ estado, motivo_fallo: motivo })
    })
  })

  it("refuses non-members with 42501", async () => {
    await como(comoPostgres, async (c) => {
      const id = await materialEn(c, "procesando", null)
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.marcar_disparo_fallido($1)", [id])).code).toBe("42501")
    })
  })
})
