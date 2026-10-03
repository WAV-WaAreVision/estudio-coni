import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

async function materialEsperando(
  c: pg.PoolClient,
  datos: { estado?: string; costo?: number | null; confirmado?: boolean } = {},
): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ id: string }>(
    `insert into public.materiales (tipo, autor_id, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado,
       motivo_fallo, costo_estimado_usd, costo_confirmado_en)
     select 'documento', (select id from public.autores where tipo = 'coni'), id, 'x', now(), $1, $2, 'Este material es largo', $3, $4 from public.categorias limit 1
     returning id`,
    [
      CONI,
      datos.estado ?? "procesando",
      datos.costo === undefined ? 0.8 : datos.costo,
      datos.confirmado ? new Date() : null,
    ],
  )
  return rows[0]?.id ?? ""
}

describe("confirmar_costo_material", () => {
  it.each([
    ["Coni", comoConi],
    ["the maintainer", comoMantenedor],
  ])("lets %s confirm a material waiting for it: stamps the time and clears the reason", async (_n, sesion) => {
    await como(comoPostgres, async (c) => {
      const id = await materialEsperando(c)
      await asumir(c, sesion)
      await c.query("select public.confirmar_costo_material($1)", [id])
      const { rows } = await c.query(
        "select estado, motivo_fallo, costo_confirmado_en is not null as confirmado from public.materiales where id = $1",
        [id],
      )
      expect(rows[0]).toEqual({ estado: "procesando", motivo_fallo: null, confirmado: true })
    })
  })

  it.each([
    ["already confirmed", { confirmado: true }],
    ["without an estimate", { costo: null }],
    ["ready", { estado: "listo" }],
    ["failed", { estado: "fallido" }],
  ])("rejects a material %s with 22023 no_confirmable", async (_n, datos) => {
    await como(comoPostgres, async (c) => {
      const id = await materialEsperando(c, datos)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.confirmar_costo_material($1)", [id])
      expect(error.code).toBe("22023")
      expect(error.message).toBe("no_confirmable")
    })
  })

  it("refuses non-members with 42501", async () => {
    await como(comoPostgres, async (c) => {
      const id = await materialEsperando(c)
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.confirmar_costo_material($1)", [id])).code).toBe("42501")
    })
  })

  it("does not let a member write the estimate or the confirmation directly", async () => {
    await como(comoPostgres, async (c) => {
      const id = await materialEsperando(c)
      await asumir(c, comoConi)
      expect(
        (await fallaCon(c, "update public.materiales set costo_confirmado_en = now() where id = $1", [id])).code,
      ).toBe("42501")
      expect((await fallaCon(c, "update public.materiales set costo_estimado_usd = 0 where id = $1", [id])).code).toBe(
        "42501",
      )
    })
  })
})
