import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

async function materialEn(c: pg.PoolClient, estado: string, motivo: string | null): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ id: string }>(
    `insert into public.materiales (tipo, autor_id, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado, motivo_fallo)
     select 'documento', (select id from public.autores where tipo = 'coni'), id, 'x', now(), $3, $1, $2 from public.categorias limit 1 returning id`,
    [estado, motivo, CONI],
  )
  return rows[0]?.id ?? ""
}

describe("reintentar_material", () => {
  it.each([
    ["Coni", comoConi],
    ["the maintainer", comoMantenedor],
  ])("lets %s retry a failed material and clears the reason", async (_n, sesion) => {
    await como(comoPostgres, async (c) => {
      const id = await materialEn(c, "fallido", "sin_texto")
      await asumir(c, sesion)
      await c.query("select public.reintentar_material($1)", [id])
      const { rows } = await c.query("select estado, motivo_fallo from public.materiales where id = $1", [id])
      expect(rows[0]).toEqual({ estado: "procesando", motivo_fallo: null })
    })
  })

  it("lets a member retry a material stopped by the monthly cap", async () => {
    await como(comoPostgres, async (c) => {
      const id = await materialEn(c, "procesando", "tope_mensual")
      await asumir(c, comoConi)
      await c.query("select public.reintentar_material($1)", [id])
      const { rows } = await c.query("select motivo_fallo from public.materiales where id = $1", [id])
      expect(rows[0]?.motivo_fallo).toBeNull()
    })
  })

  it.each([
    ["ready", "listo", null],
    ["still processing without a reason", "procesando", null],
  ])("rejects a %s material with 22023 no_reintentable", async (_n, estado, motivo) => {
    await como(comoPostgres, async (c) => {
      const id = await materialEn(c, estado, motivo)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.reintentar_material($1)", [id])
      expect(error.code).toBe("22023")
      expect(error.message).toBe("no_reintentable")
    })
  })

  it("refuses non-members with 42501", async () => {
    await como(comoPostgres, async (c) => {
      const id = await materialEn(c, "fallido", "x")
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.reintentar_material($1)", [id])).code).toBe("42501")
    })
  })
})
