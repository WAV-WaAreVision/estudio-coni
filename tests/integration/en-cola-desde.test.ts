import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoOtra, comoPostgres, OTRA, pool } from "./db"

afterAll(() => pool.end())

// Issue 63: the sweep of abandoned uploads measures from `en_cola_desde`, so everything that sends a material (back)
// to processing must stamp it, or an old material waiting in the queue would look abandoned.

async function material(c: pg.PoolClient, estado: string, motivo: string | null, subidoPor = CONI): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ id: string }>(
    `insert into public.materiales (tipo, autor_id, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado, motivo_fallo, creado_en, en_cola_desde)
     select 'documento', (select id from public.autores where tipo = 'coni'), id, 'x', now(), $3, $1, $2,
            now() - interval '3 days', now() - interval '3 days'
       from public.categorias limit 1 returning id`,
    [estado, motivo, subidoPor],
  )
  return rows[0]?.id ?? ""
}

async function reciente(c: pg.PoolClient, id: string): Promise<boolean> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ reciente: boolean }>(
    "select en_cola_desde > now() - interval '1 minute' as reciente from public.materiales where id = $1",
    [id],
  )
  return rows[0]?.reciente ?? false
}

describe("materiales.en_cola_desde", () => {
  it("is stamped when a material is created", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into public.materiales (tipo, autor_id, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
         select 'documento', (select id from public.autores where tipo = 'coni'), id, 'x', now(), $1
           from public.categorias limit 1 returning id`,
        [CONI],
      )
      expect(await reciente(c, rows[0]?.id ?? "")).toBe(true)
    })
  })

  it("is stamped again by reintentar_material", async () => {
    await como(comoPostgres, async (c) => {
      const id = await material(c, "fallido", "sin_texto")
      await asumir(c, comoConi)
      await c.query("select public.reintentar_material($1)", [id])
      expect(await reciente(c, id)).toBe(true)
    })
  })

  it("is stamped again by reprocesar_material", async () => {
    await como(comoPostgres, async (c) => {
      const id = await material(c, "listo", null)
      await asumir(c, comoConi)
      await c.query("select public.reprocesar_material($1)", [id])
      expect(await reciente(c, id)).toBe(true)
    })
  })

  it.each([
    ["without a reason", null],
    ["with the reason of a failed start", "No pude iniciar el procesamiento. Reintenta."],
  ])(
    "is stamped by poner_material_en_cola for her own upload still processing %s, which answers true",
    async (_n, motivo) => {
      await como(comoPostgres, async (c) => {
        const id = await material(c, "procesando", motivo)
        await asumir(c, comoConi)
        const { rows } = await c.query<{ puesto: boolean }>("select public.poner_material_en_cola($1) as puesto", [id])
        expect(rows[0]?.puesto).toBe(true)
        expect(await reciente(c, id)).toBe(true)
      })
    },
  )

  it("clears the reason of a failed start, so a confirmed material shows as processing again (issue 117)", async () => {
    await como(comoPostgres, async (c) => {
      const id = await material(c, "procesando", "No pude iniciar el procesamiento. Reintenta.")
      await asumir(c, comoConi)
      await c.query("select public.poner_material_en_cola($1)", [id])
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ motivo_fallo: string | null }>(
        "select motivo_fallo from public.materiales where id = $1",
        [id],
      )
      expect(rows[0]?.motivo_fallo).toBeNull()
    })
  })

  it.each([
    ["a ready material", "listo", null, CONI],
    ["someone else's upload", "procesando", null, OTRA],
  ])("is not stamped by poner_material_en_cola for %s, which answers false", async (_n, estado, motivo, dueno) => {
    await como(comoPostgres, async (c) => {
      const id = await material(c, estado, motivo, dueno)
      await asumir(c, comoConi)
      const { rows } = await c.query<{ puesto: boolean }>("select public.poner_material_en_cola($1) as puesto", [id])
      expect(rows[0]?.puesto).toBe(false)
      expect(await reciente(c, id)).toBe(false)
    })
  })

  it("lets nobody but Coni and the maintainer call poner_material_en_cola", async () => {
    await como(comoPostgres, async (c) => {
      const id = await material(c, "procesando", null, OTRA)
      await asumir(c, comoOtra)
      await expect(c.query("select public.poner_material_en_cola($1)", [id])).rejects.toMatchObject({ code: "42501" })
    })
  })
})
