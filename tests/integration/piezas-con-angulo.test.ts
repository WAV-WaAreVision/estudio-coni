import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, pool } from "./db"

type Red = "linkedin" | "instagram"
type Estado = "esperando" | "para_subir" | "subido_a_mano" | "publicado"

afterAll(async () => {
  await pool.end()
})

/** A piece of a new idea on `pilar` (with the angle `angulo`, or none), with one `publicaciones` row per salida. */
async function pieza(
  c: pg.PoolClient,
  pilar: string,
  angulo: string | null,
  salidas: readonly { destino: Red; estado: Estado; en: string }[],
): Promise<string> {
  const { rows: idea } = await c.query<{ id: string }>(
    `insert into public.ideas (pilar, angulo_id, gancho, fuerza, estado)
     values ($1, (select id from public.pilar_angulos where slug = $2), 'Gancho', 'alta', 'usada') returning id`,
    [pilar, angulo],
  )
  const { rows } = await c.query<{ id: string }>(
    "insert into public.piezas (idea_id, titulo) values ($1, 'Pieza') returning id",
    [idea[0]?.id],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la pieza")
  for (const { destino, estado, en } of salidas) {
    await c.query(
      `insert into public.publicaciones (pieza_id, destino, estado, marcado_en, post_urn)
       values ($1::uuid, $2::text, $3::text, $4::timestamptz,
               case when $2::text = 'linkedin' and $3::text = 'publicado' then 'urn:li:share:' || abs(hashtext($1::text)) end)`,
      [id, destino, estado, en],
    )
  }
  return id
}

async function filas(c: pg.PoolClient, piezas: readonly string[]) {
  const { rows } = await c.query<{ pieza_id: string; angulo: string; publicada_en: Date }>(
    `select v.pieza_id, a.slug as angulo, v.publicada_en
       from public.piezas_con_angulo v join public.pilar_angulos a on a.id = v.angulo_id
      where v.pieza_id = any($1::uuid[]) order by v.publicada_en`,
    [piezas],
  )
  return rows.map((fila) => ({ ...fila, publicada_en: fila.publicada_en.toISOString() }))
}

describe("piezas_con_angulo", () => {
  it("lists a piece that went out, with its angle and the first time it went out, once", async () => {
    await como(comoPostgres, async (c) => {
      const doble = await pieza(c, "psicologia-en-la-mesa", "lo-que-construyo", [
        { destino: "linkedin", estado: "publicado", en: "2026-10-02T12:00:00Z" },
        { destino: "instagram", estado: "subido_a_mano", en: "2026-10-01T12:00:00Z" },
      ])
      await asumir(c, comoConi)
      expect(await filas(c, [doble])).toEqual([
        { pieza_id: doble, angulo: "lo-que-construyo", publicada_en: "2026-10-01T12:00:00.000Z" },
      ])
    })
  })

  it("leaves out a piece still waiting or to upload, and one whose idea has no angle", async () => {
    await como(comoPostgres, async (c) => {
      const esperando = await pieza(c, "psicologia-en-la-mesa", "lo-que-planteo", [
        { destino: "linkedin", estado: "esperando", en: "2026-10-01T12:00:00Z" },
        { destino: "instagram", estado: "para_subir", en: "2026-10-01T12:00:00Z" },
      ])
      const sinAngulo = await pieza(c, "psicologia-en-la-mesa", null, [
        { destino: "linkedin", estado: "publicado", en: "2026-10-01T12:00:00Z" },
      ])
      await asumir(c, comoConi)
      expect(await filas(c, [esperando, sinAngulo])).toEqual([])
    })
  })

  it("is read through row level security: WAV sees nothing, because only Coni reads publicaciones", async () => {
    await como(comoPostgres, async (c) => {
      const id = await pieza(c, "mi-nueva-partida", "lo-vivo", [
        { destino: "instagram", estado: "subido_a_mano", en: "2026-10-01T12:00:00Z" },
      ])
      await asumir(c, comoMantenedor)
      expect(await filas(c, [id])).toEqual([])
    })
  })
})
