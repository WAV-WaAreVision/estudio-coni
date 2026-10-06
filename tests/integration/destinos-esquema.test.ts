import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoPostgres, fallaCon, pool } from "./db"
import { actualizar, crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

/** Gate 2 as Coni gives it: the approval and its formula go in the same update. */
async function aprobadaConFormula2(c: pg.PoolClient): Promise<string> {
  const id = await crearPiezaEn(c, "video_por_aprobar")
  await asumir(c, comoConi)
  const { version, video_id: videoId } = await leer(c, id)
  await c.query(
    `update public.piezas set estado = 'programado', puerta2_video_id = $3, puerta2_hash_texto = 'hash-2',
       puerta2_publicar_en = now() + interval '1 day', puerta2_en = now(), puerta2_formula = 2, version = $2
     where id = $1`,
    [id, version + 1, videoId],
  )
  return id
}

describe("destinos de la pieza: esquema", () => {
  it("handles a new piece when nothing is said: destinos defaults to instagram only", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { rows } = await c.query(
        "select destinos, texto_linkedin, puerta2_formula from public.piezas where id = $1",
        [id],
      )
      expect(rows[0]).toEqual({ destinos: ["instagram"], texto_linkedin: null, puerta2_formula: null })
    })
  })

  it("refuses destinos when empty, duplicated, unknown or out of the canonical order", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      for (const destinos of [[], ["instagram", "instagram"], ["tiktok"], ["linkedin", "instagram"]]) {
        const { version } = await leer(c, id)
        const error = await fallaCon(c, "update public.piezas set destinos = $3::text[], version = $2 where id = $1", [
          id,
          version + 1,
          destinos,
        ])
        expect(error.message).toMatch(/destinos_validos/)
      }
    })
  })

  it("accepts each of the three lists", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      for (const destinos of [["linkedin"], ["instagram", "linkedin"], ["instagram"]]) {
        const { version } = await leer(c, id)
        const { rows } = await actualizar(c, id, version, { destinos, version: version + 1 })
        expect(rows[0]?.destinos).toEqual(destinos)
      }
    })
  })

  it("accepts a LinkedIn text over 3000 characters: the review blocks it, the database does not fail a run", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      const { rows } = await c.query(
        "update public.piezas set texto_linkedin = $3, version = $2 where id = $1 returning char_length(texto_linkedin) as n",
        [id, version + 1, "a".repeat(3500)],
      )
      expect(rows[0]).toEqual({ n: 3500 })
    })
  })

  it("refuses a change of texto_linkedin or destinos while gate 2 is approved", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      for (const columnas of ["texto_linkedin = 'otro'", "destinos = '{instagram,linkedin}'"]) {
        const { version } = await leer(c, id)
        const error = await fallaCon(c, `update public.piezas set ${columnas}, version = $2 where id = $1`, [
          id,
          version + 1,
        ])
        expect(error.message).toBe("artefacto_aprobado")
      }
    })
  })

  it("lets the text and the destinations change in the update that takes gate 2 back", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      const { version } = await leer(c, id)
      const { rows } = await c.query(
        `update public.piezas set texto_linkedin = 'nuevo', destinos = '{linkedin}', estado = 'video_por_aprobar',
           puerta2_video_id = null, puerta2_hash_texto = null, puerta2_publicar_en = null, puerta2_en = null,
           version = $2
         where id = $1 returning texto_linkedin, destinos, puerta2_formula`,
        [id, version + 1],
      )
      expect(rows[0]).toEqual({ texto_linkedin: "nuevo", destinos: ["linkedin"], puerta2_formula: null })
    })
  })

  it("clears puerta2_formula when the approval is taken back", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobadaConFormula2(c)
      expect((await leer(c, id)).puerta2_formula).toBe(2)
      await asumir(c, comoPostgres)
      const { version } = await leer(c, id)
      const { rows } = await c.query(
        `update public.piezas set estado = 'video_por_aprobar', puerta2_video_id = null, puerta2_hash_texto = null,
           puerta2_publicar_en = null, puerta2_en = null, version = $2
         where id = $1 returning puerta2_formula`,
        [id, version + 1],
      )
      expect(rows[0]).toEqual({ puerta2_formula: null })
    })
  })

  it("handles a formula written on a piece without an approval: it stays null", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar")
      await asumir(c, comoPostgres)
      const { version } = await leer(c, id)
      const { rows } = await c.query(
        "update public.piezas set puerta2_formula = 2, version = $2 where id = $1 returning puerta2_formula",
        [id, version + 1],
      )
      expect(rows[0]).toEqual({ puerta2_formula: null })
    })
  })

  it("refuses to change the formula of an approval after it was given", async () => {
    await como(comoPostgres, async (c) => {
      const id = await aprobadaConFormula2(c)
      await asumir(c, comoPostgres)
      const { version } = await leer(c, id)
      const error = await fallaCon(c, "update public.piezas set puerta2_formula = 1, version = $2 where id = $1", [
        id,
        version + 1,
      ])
      expect(error.message).toBe("formula_solo_con_aprobacion")
    })
  })

  it("handles publicaciones when Coni reads them and refuses her direct writes", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      await asumir(c, comoPostgres)
      await c.query(
        "insert into public.publicaciones (pieza_id, destino, estado) values ($1, 'instagram', 'esperando') on conflict do nothing",
        [id],
      )
      await asumir(c, comoConi)
      const { rows } = await c.query("select destino, estado from public.publicaciones where pieza_id = $1", [id])
      expect(rows).toEqual([{ destino: "instagram", estado: "esperando" }])
      for (const sql of [
        "insert into public.publicaciones (pieza_id, destino, estado) values ($1, 'linkedin', 'esperando')",
        "update public.publicaciones set estado = 'subido_a_mano' where pieza_id = $1",
        "delete from public.publicaciones where pieza_id = $1",
      ]) {
        const error = await fallaCon(c, sql, [id])
        expect(error.message).toMatch(/permission denied/)
      }
    })
  })

  it("refuses an unknown destination or state in publicaciones", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      await asumir(c, comoPostgres)
      for (const [destino, estado] of [
        ["tiktok", "esperando"],
        ["linkedin", "volando"],
      ]) {
        const error = await fallaCon(
          c,
          "insert into public.publicaciones (pieza_id, destino, estado) values ($1, $2, $3)",
          [id, destino, estado],
        )
        expect(error.message).toMatch(/violates check constraint/)
      }
    })
  })

  it("keeps the default destinations of Ajustes valid", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query("select destinos_por_defecto from public.ajustes")
      expect(rows[0]).toEqual({ destinos_por_defecto: ["instagram"] })
      const error = await fallaCon(c, "update public.ajustes set destinos_por_defecto = '{}'")
      expect(error.message).toMatch(/destinos_por_defecto_validos/)
    })
  })
})
