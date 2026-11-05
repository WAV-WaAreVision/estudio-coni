import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, fallaCon, pool } from "./db"
import { AVATAR, crearPiezaEn } from "./flujo"

afterAll(async () => {
  await pool.end()
})

const HASH = "f".repeat(64)

async function angulo(c: pg.PoolClient, slug: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select id from public.pilar_angulos where slug = $1", [slug])
  const id = rows[0]?.id
  if (!id) throw new Error(`No existe el ángulo ${slug}`)
  return id
}

async function idea(c: pg.PoolClient, pilar: string, anguloId: string | null = null): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.ideas (pilar, angulo_id, gancho, fuerza) values ($1, $2, 'Gancho', 'alta') returning id",
    [pilar, anguloId],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la idea")
  return id
}

async function anguloDe(c: pg.PoolClient, ideaId: string): Promise<string | null> {
  const { rows } = await c.query<{ angulo_id: string | null }>("select angulo_id from public.ideas where id = $1", [
    ideaId,
  ])
  return rows[0]?.angulo_id ?? null
}

/** A piece of `ideaId` signed by Coni at gate 1, as the app writes it (`aprobar-voz-esquema.test.ts`). */
async function firmada(c: pg.PoolClient, ideaId: string): Promise<string> {
  const id = await crearPiezaEn(c, "guion_por_aprobar")
  await asumir(c, comoPostgres)
  await c.query("update public.piezas set idea_id = $2, version = version + 1 where id = $1", [id, ideaId])
  await asumir(c, comoConi)
  await c.query(
    `update public.piezas set estado = 'guion_aprobado', puerta1_hash = $2, puerta1_en = now(), avatar_id = $3,
       puerta1_formula = 3, version = version + 1 where id = $1`,
    [id, HASH, AVATAR],
  )
  await asumir(c, comoPostgres)
  return id
}

describe("ideas.angulo_id", () => {
  it("takes an angle of the idea's pillar and refuses one of another pillar", async () => {
    await como(comoPostgres, async (c) => {
      const construyo = await angulo(c, "lo-que-construyo")
      const id = await idea(c, "psicologia-en-la-mesa", construyo)
      expect(await anguloDe(c, id)).toBe(construyo)
      const otro = await fallaCon(c, "update public.ideas set angulo_id = $2 where id = $1", [
        id,
        await angulo(c, "lo-vivo"),
      ])
      expect(otro.code).toBe("23514")
      expect(otro.message).toBe("angulo_de_otro_pilar")
      const enPilarSinAngulos = await fallaCon(
        c,
        "insert into public.ideas (pilar, angulo_id, gancho, fuerza) values ('mujeres-lideres', $1, 'G', 'alta')",
        [construyo],
      )
      expect(enPilarSinAngulos.message).toBe("angulo_de_otro_pilar")
    })
  })

  it("clears the angle when the pillar changes, and keeps one set in the same statement", async () => {
    await como(comoPostgres, async (c) => {
      const id = await idea(c, "psicologia-en-la-mesa", await angulo(c, "lo-que-construyo"))
      await c.query("update public.ideas set pilar = 'mi-nueva-partida' where id = $1", [id])
      expect(await anguloDe(c, id)).toBeNull()
      const vivo = await angulo(c, "lo-vivo")
      await c.query("update public.ideas set pilar = 'psicologia-en-la-mesa', angulo_id = null where id = $1", [id])
      await c.query("update public.ideas set pilar = 'mi-nueva-partida', angulo_id = $2 where id = $1", [id, vivo])
      expect(await anguloDe(c, id)).toBe(vivo)
    })
  })

  it("locks the angle once a live piece of the idea is signed at gate 1, and opens it when the signature is cleared", async () => {
    await como(comoPostgres, async (c) => {
      const id = await idea(c, "psicologia-en-la-mesa", await angulo(c, "lo-que-planteo"))
      const pieza = await firmada(c, id)
      const construyo = await angulo(c, "lo-que-construyo")
      await asumir(c, comoConi)
      const bloqueado = await fallaCon(c, "update public.ideas set angulo_id = $2 where id = $1", [id, construyo])
      expect(bloqueado.code).toBe("23514")
      expect(bloqueado.message).toBe("angulo_firmado")
      await asumir(c, comoPostgres)
      await c.query(
        `update public.piezas set estado = 'guion_por_aprobar', puerta1_hash = null, puerta1_en = null,
           version = version + 1 where id = $1`,
        [pieza],
      )
      await asumir(c, comoConi)
      await c.query("update public.ideas set angulo_id = $2 where id = $1", [id, construyo])
      expect(await anguloDe(c, id)).toBe(construyo)
    })
  })

  it("does not lock it for a discarded piece", async () => {
    await como(comoPostgres, async (c) => {
      const id = await idea(c, "psicologia-en-la-mesa", await angulo(c, "lo-que-planteo"))
      const pieza = await firmada(c, id)
      await c.query("update public.piezas set estado = 'descartado', version = version + 1 where id = $1", [pieza])
      await c.query("update public.ideas set angulo_id = null where id = $1", [id])
      expect(await anguloDe(c, id)).toBeNull()
    })
  })

  it("lets Coni set it and not WAV", async () => {
    await como(comoPostgres, async (c) => {
      const id = await idea(c, "psicologia-en-la-mesa")
      const construyo = await angulo(c, "lo-que-construyo")
      await asumir(c, comoMantenedor)
      expect((await c.query("update public.ideas set angulo_id = $2 where id = $1", [id, construyo])).rowCount).toBe(0)
      await asumir(c, comoConi)
      expect((await c.query("update public.ideas set angulo_id = $2 where id = $1", [id, construyo])).rowCount).toBe(1)
    })
  })
})
