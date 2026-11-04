import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

const LOTE = "lote-de-prueba"
const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`
const VIEJOS = ["ia-salud-mental", "practica-clinica", "etica-regulacion", "acceso-salud-publica", "caso-coni"]

async function id(c: pg.PoolClient, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const valor = rows[0]?.id
  if (!valor) throw new Error(`Sin id para: ${sql}`)
  return valor
}

const tema = (c: pg.PoolClient, nombre: string) =>
  id(c, "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id", [
    nombre,
    CENTROIDE,
  ])

const idea = (c: pg.PoolClient, pilar: string, estado: "idea" | "usada" | "descartada") =>
  id(
    c,
    `insert into public.ideas (pilar, gancho, fuerza, estado, motivo_descarte)
     values ($1, 'lote de pilares', 'media', $2, $3) returning id`,
    [pilar, estado, estado === "descartada" ? "otro" : null],
  )

interface Escena {
  temaA: string
  temaB: string
  usadas: string[]
  descartadas: string[]
  /** Every bank idea on a pillar without a network: the scene's four and any the local DB already had. */
  banco: string[]
}

/** As postgres: 2 topics, 4 bank ideas, 2 used and 2 discarded on the pillars of 2026-10-17 (production: 4, 7, 9). */
async function escena(c: pg.PoolClient): Promise<Escena> {
  const temaA = await tema(c, "Lote tema A")
  const temaB = await tema(c, "Lote tema B")
  for (const pilar of ["caso-coni", "ia-salud-mental", "etica-regulacion", "practica-clinica"]) await idea(c, pilar, "idea")
  const usadas = [await idea(c, "caso-coni", "usada"), await idea(c, "acceso-salud-publica", "usada")]
  const descartadas = [await idea(c, "ia-salud-mental", "descartada"), await idea(c, "etica-regulacion", "descartada")]
  const { rows } = await c.query<{ id: string }>(
    `select i.id from public.ideas i join public.categorias c on c.slug = i.pilar
      where i.estado = 'idea' and c.es_pilar and c.activa and c.red is null order by i.id`,
  )
  return { temaA, temaB, usadas, descartadas, banco: rows.map((r) => r.id) }
}

const filasDelLote = (e: Escena, ideas: string[] = e.banco) =>
  JSON.stringify({
    temas: [
      {
        tema_id: e.temaA,
        pilares: [
          { pilar: "bienestar-e-impacto", fuerza: "alta" },
          { pilar: "diagnostico-doble", fuerza: "media" },
          { pilar: "capa-tdah", fuerza: null },
        ],
      },
      { tema_id: e.temaB, pilares: [{ pilar: "mi-nueva-partida", fuerza: "alta" }] },
    ],
    ideas: ideas.map((idea_id) => ({ idea_id, pilar: "psicologia-en-la-mesa" })),
  })

const aplicar = (c: pg.PoolClient, filas: string, lote = LOTE) =>
  c.query<{ r: { filas: number; ideas: number; retirados: number } }>(
    "select public.aplicar_lote_de_pilares($1, $2::jsonb) as r",
    [lote, filas],
  )

const pilarDe = async (c: pg.PoolClient, ideaId: string) =>
  (await c.query<{ pilar: string }>("select pilar from public.ideas where id = $1", [ideaId])).rows[0]?.pilar

describe("aplicar_lote_de_pilares", () => {
  it("writes the rows, moves every bank idea and retires the five old pillars, in that order", async () => {
    await como(comoPostgres, async (c) => {
      const e = await escena(c)
      await asumir(c, comoServicio)
      const { rows } = await aplicar(c, filasDelLote(e))
      expect(rows[0]?.r).toEqual({ filas: 4, ideas: e.banco.length, retirados: 5 })

      await asumir(c, comoPostgres)
      const filas = await c.query<{ origen: string; lote: string }>(
        "select origen, lote from public.tema_pilares where tema_id = any($1::uuid[])",
        [[e.temaA, e.temaB]],
      )
      expect(filas.rows).toHaveLength(4)
      expect(filas.rows.every((f) => f.origen === "reclasificacion" && f.lote === LOTE)).toBe(true)
      for (const ideaId of e.banco) expect(await pilarDe(c, ideaId)).toBe("psicologia-en-la-mesa")
      const antes = await c.query<{ n: number }>(
        "select count(*)::int as n from public.ideas_pilar_antes where lote = $1 and idea_id = any($2::uuid[])",
        [LOTE, e.banco],
      )
      expect(antes.rows[0]?.n).toBe(e.banco.length)
      expect(await pilarDe(c, e.usadas[0] ?? "")).toBe("caso-coni")
      expect(await pilarDe(c, e.descartadas[0] ?? "")).toBe("ia-salud-mental")
      const viejos = await c.query<{ activa: boolean }>("select activa from public.categorias where slug = any($1)", [
        VIEJOS,
      ])
      expect(viejos.rows.map((f) => f.activa)).toEqual([false, false, false, false, false])
      const enRetirados = await c.query<{ n: number }>(
        `select count(*)::int as n from public.ideas i join public.categorias c on c.slug = i.pilar
          where i.estado = 'idea' and not c.activa`,
      )
      expect(enRetirados.rows[0]?.n).toBe(0)
    })
  })

  it("refuses to retire the old pillars while a bank idea stays on one, and changes nothing", async () => {
    await como(comoPostgres, async (c) => {
      const e = await escena(c)
      await asumir(c, comoServicio)
      const error = await fallaCon(c, "select public.aplicar_lote_de_pilares($1, $2::jsonb)", [
        LOTE,
        filasDelLote(e, e.banco.slice(1)),
      ])
      expect(error).toMatchObject({ code: "22023", message: "idea_en_pilar_retirado" })
      await asumir(c, comoPostgres)
      const filas = await c.query("select 1 from public.tema_pilares where tema_id = $1", [e.temaA])
      expect(filas.rowCount).toBe(0)
      expect(await pilarDe(c, e.banco[1] ?? "")).not.toBe("psicologia-en-la-mesa")
    })
  })

  it("refuses the same lot twice", async () => {
    await como(comoPostgres, async (c) => {
      const e = await escena(c)
      await asumir(c, comoServicio)
      await aplicar(c, filasDelLote(e))
      const error = await fallaCon(c, "select public.aplicar_lote_de_pilares($1, $2::jsonb)", [LOTE, filasDelLote(e)])
      expect(error).toMatchObject({ code: "22023", message: "lote_ya_aplicado" })
    })
  })

  it("refuses a topic that already has pillars, an idea out of the bank, a layer for an idea and an empty lot", async () => {
    await como(comoPostgres, async (c) => {
      const e = await escena(c)
      await c.query(
        `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
         select $1, c.id, c.red, c.es_capa, 'alta', 'coni' from public.categorias c where c.slug = 'mujeres-lideres'`,
        [e.temaB],
      )
      await asumir(c, comoServicio)
      const conPilares = await fallaCon(c, "select public.aplicar_lote_de_pilares($1, $2::jsonb)", [
        LOTE,
        filasDelLote(e),
      ])
      expect(conPilares.message).toBe("tema_ya_tiene_pilares")
      const usada = JSON.stringify({ temas: [], ideas: [{ idea_id: e.usadas[0], pilar: "mi-nueva-partida" }] })
      expect((await fallaCon(c, "select public.aplicar_lote_de_pilares($1, $2::jsonb)", [LOTE, usada])).message).toBe(
        "idea_fuera_del_banco",
      )
      const capa = JSON.stringify({ temas: [], ideas: [{ idea_id: e.banco[0], pilar: "capa-tdah" }] })
      expect((await fallaCon(c, "select public.aplicar_lote_de_pilares($1, $2::jsonb)", [LOTE, capa])).message).toBe(
        "pilar_desconocido",
      )
      expect((await fallaCon(c, "select public.aplicar_lote_de_pilares(' ', '{}'::jsonb)")).message).toBe("lote_vacio")
    })
  })

  it("cannot be run by Coni or WAV from the app", async () => {
    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        const error = await fallaCon(c, "select public.aplicar_lote_de_pilares('x', '{}'::jsonb)")
        expect(error.code).toBe("42501")
      })
    }
  })
})
