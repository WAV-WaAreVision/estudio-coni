import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, fallaCon, pool } from "./db"

afterAll(async () => {
  await pool.end()
})

const SUFIJO = randomUUID().slice(0, 8)
const HOY = "(now() at time zone 'America/Santiago')::date"

async function hoy(c: pg.PoolClient, dias = 0): Promise<string> {
  const { rows } = await c.query<{ dia: string }>(`select (${HOY} + $1::int)::text as dia`, [dias])
  const dia = rows[0]?.dia
  if (!dia) throw new Error("No pude leer la fecha de hoy")
  return dia
}

async function borrador(
  c: pg.PoolClient,
  red: "linkedin" | "instagram",
  nombre: string,
  nombreCorto: string,
  peso = 10,
): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
     values ($1, $2, $3, 'Una definición del pilar.', $4) returning id`,
    [red, nombre, nombreCorto, peso],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el borrador ${nombre}`)
  return id
}

async function idDe(c: pg.PoolClient, slug: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select id from public.categorias where slug = $1", [slug])
  const id = rows[0]?.id
  if (!id) throw new Error(`No existe la categoría ${slug}`)
  return id
}

/**
 * A later stage of LinkedIn of the test's own, 400 days ahead: after the seed's 2027 stages at any date, so no test
 * depends on today versus 2027 (decision 20). Only the pillars named get a row on it, at 25.
 */
async function etapaPropia(c: pg.PoolClient, slugs: readonly string[]): Promise<string> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ desde: string }>(
    `insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
     select id, red, es_capa, ${HOY} + 400, 25 from public.categorias where slug = any($1::text[])
     returning desde::text as desde`,
    [slugs],
  )
  await asumir(c, comoConi)
  const desde = rows[0]?.desde
  if (!desde) throw new Error("No se creó la etapa propia")
  return desde
}

/** Today and every later `desde` of LinkedIn's active pillars, as the RPC computes them. */
async function etapasDeLinkedin(c: pg.PoolClient): Promise<string[]> {
  const { rows } = await c.query<{ desde: string }>(
    `select s.desde::text as desde from (
       select ${HOY} as desde
       union
       select w.desde from public.pilar_pesos w join public.categorias c on c.id = w.pilar_id
       where c.es_pilar and c.activa and not c.es_capa and c.red = 'linkedin' and w.desde > ${HOY}
     ) s order by s.desde`,
  )
  return rows.map((fila) => fila.desde)
}

async function aprobar(c: pg.PoolClient, id: string, pesos: unknown): Promise<string> {
  const { rows } = await c.query<{ pilar: string }>(
    "select public.aprobar_borrador_de_pilar($1, $2::jsonb) as pilar",
    [id, JSON.stringify(pesos)],
  )
  const pilar = rows[0]?.pilar
  if (!pilar) throw new Error("La aprobación no devolvió el pilar")
  return pilar
}

const rechazo = (c: pg.PoolClient, id: string, pesos: unknown) =>
  fallaCon(c, "select public.aprobar_borrador_de_pilar($1, $2::jsonb)", [id, JSON.stringify(pesos)])

/** The rows of a pillar written exactly on `desde`. */
async function filasEn(c: pg.PoolClient, pilar: string, desde: string): Promise<number[]> {
  const { rows } = await c.query<{ peso: number }>(
    "select peso::float8 as peso from public.pilar_pesos where pilar_id = $1 and desde = $2::date",
    [pilar, desde],
  )
  return rows.map((fila) => fila.peso)
}

/** A pillar's effective weight on a date: its row with the latest `desde` on or before it. */
async function pesoEn(c: pg.PoolClient, pilar: string, fecha: string): Promise<number> {
  const { rows } = await c.query<{ peso: number }>(
    `select peso::float8 as peso from public.pilar_pesos where pilar_id = $1 and desde <= $2::date
     order by desde desc limit 1`,
    [pilar, fecha],
  )
  const peso = rows[0]?.peso
  if (peso === undefined) throw new Error(`El pilar ${pilar} no tiene peso el ${fecha}`)
  return peso
}

async function filasDePeso(c: pg.PoolClient, pilar: string): Promise<number> {
  const { rows } = await c.query<{ n: number }>(
    "select count(*)::int as n from public.pilar_pesos where pilar_id = $1",
    [pilar],
  )
  return rows[0]?.n ?? 0
}

describe("aprobar_borrador_de_pilar", () => {
  it("turns the draft into an active pillar of its network, next in order, with a slug from its name", async () => {
    await como(comoConi, async (c) => {
      const { rows: maximo } = await c.query<{ orden: number }>(
        "select max(orden)::int as orden from public.categorias where es_pilar and red = 'linkedin'",
      )
      const id = await borrador(c, "linkedin", `Liderazgo sereno ${SUFIJO}`, `Sereno ${SUFIJO}`)
      const pilar = await aprobar(c, id, {})
      const { rows } = await c.query(
        `select slug, nombre, nombre_corto, descripcion, red, orden::int as orden, es_pilar, activa, es_capa
         from public.categorias where id = $1`,
        [pilar],
      )
      expect(rows).toEqual([
        {
          slug: `liderazgo-sereno-${SUFIJO}`,
          nombre: `Liderazgo sereno ${SUFIJO}`,
          nombre_corto: `Sereno ${SUFIJO}`,
          descripcion: "Una definición del pilar.",
          red: "linkedin",
          orden: (maximo[0]?.orden ?? 0) + 1,
          es_pilar: true,
          activa: true,
          es_capa: false,
        },
      ])
      const { rows: decidido } = await c.query(
        "select estado, pilar_id, decidido_en is not null as decidido from public.borradores_de_pilar where id = $1",
        [id],
      )
      expect(decidido).toEqual([{ estado: "aprobado", pilar_id: pilar, decidido: true }])
    })
  })

  it("writes today's weight for the new pillar and only for the pillars whose weight changed; «nuevo» overrides the draft's", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      const diagnostico = await idDe(c, "diagnostico-doble")
      const bienestar = await idDe(c, "bienestar-e-impacto")
      const filasDeBienestar = await filasDePeso(c, bienestar)
      const id = await borrador(c, "linkedin", `Con pesos ${SUFIJO}`, `Pesos ${SUFIJO}`, 10)
      const pilar = await aprobar(c, id, {
        [dia]: { [diagnostico]: 20, [bienestar]: await pesoEn(c, bienestar, dia), nuevo: 12 },
      })
      expect(await filasEn(c, pilar, dia)).toEqual([12])
      expect(await filasEn(c, diagnostico, dia)).toEqual([20])
      expect(await filasDePeso(c, bienestar)).toBe(filasDeBienestar)
    })
  })

  it("gives the new pillar a row on today and on every later stage of its network, the draft's weight where none is sent", async () => {
    await como(comoConi, async (c) => {
      await etapaPropia(c, ["diagnostico-doble", "bienestar-e-impacto", "psicologia-en-la-mesa", "mujeres-lideres"])
      const etapas = await etapasDeLinkedin(c)
      expect(etapas.length).toBeGreaterThanOrEqual(2)
      const pilar = await aprobar(c, await borrador(c, "linkedin", `Etapas ${SUFIJO}`, `Etapas ${SUFIJO}`, 10), {})
      const { rows } = await c.query<{ desde: string; peso: number }>(
        "select desde::text as desde, peso::float8 as peso from public.pilar_pesos where pilar_id = $1 order by desde",
        [pilar],
      )
      expect(rows).toEqual(etapas.map((desde) => ({ desde, peso: 10 })))
    })
  })

  it("writes a later stage's changes on its date, replacing that day's row, and keeps there the value the screen showed", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      // Mujeres líderes gets no row on the stage: its weight there comes from an earlier row.
      const etapa = await etapaPropia(c, ["diagnostico-doble", "bienestar-e-impacto", "psicologia-en-la-mesa"])
      const diagnostico = await idDe(c, "diagnostico-doble")
      const mujeres = await idDe(c, "mujeres-lideres")
      const mujeresEnLaEtapa = await pesoEn(c, mujeres, etapa)
      const pilar = await aprobar(c, await borrador(c, "linkedin", `Reparto ${SUFIJO}`, `Reparto ${SUFIJO}`, 10), {
        [dia]: { [diagnostico]: 20, [mujeres]: 5 },
        [etapa]: { [diagnostico]: 15, [mujeres]: mujeresEnLaEtapa, nuevo: 12 },
      })
      expect(await filasEn(c, diagnostico, dia)).toEqual([20])
      expect(await filasEn(c, diagnostico, etapa)).toEqual([15])
      expect(await pesoEn(c, mujeres, dia)).toBe(5)
      // Lowering it today must not carry into the stage, where she kept its value (decision 7).
      expect(await pesoEn(c, mujeres, etapa)).toBe(mujeresEnLaEtapa)
      expect(await filasEn(c, pilar, dia)).toEqual([10])
      expect(await filasEn(c, pilar, etapa)).toEqual([12])
    })
  })

  it("replaces a second change of the same day, and approves a draft only once", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      const diagnostico = await idDe(c, "diagnostico-doble")
      const uno = await borrador(c, "linkedin", `Uno ${SUFIJO}`, `Uno ${SUFIJO}`)
      const dos = await borrador(c, "linkedin", `Dos ${SUFIJO}`, `Dos ${SUFIJO}`)
      await aprobar(c, uno, { [dia]: { [diagnostico]: 20 } })
      await aprobar(c, dos, { [dia]: { [diagnostico]: 18 } })
      expect(await filasEn(c, diagnostico, dia)).toEqual([18])
      const otraVez = await rechazo(c, uno, {})
      expect([otraVez.code, otraVez.message]).toEqual(["22023", "borrador_ya_decidido"])
      const descartado = await borrador(c, "linkedin", `Tres ${SUFIJO}`, `Tres ${SUFIJO}`)
      await c.query("update public.borradores_de_pilar set estado = 'descartado' where id = $1", [descartado])
      const tarde = await rechazo(c, descartado, {})
      expect([tarde.code, tarde.message]).toEqual(["22023", "borrador_ya_decidido"])
    })
  })

  it("accepts a network whose weights no longer add up to 100", async () => {
    await como(comoConi, async (c) => {
      await aprobar(c, await borrador(c, "linkedin", `Sobra ${SUFIJO}`, `Sobra ${SUFIJO}`, 10), {})
      const { rows } = await c.query<{ total: number }>(
        `select sum(w.peso)::float8 as total
         from public.categorias c
         cross join lateral (
           select p.peso from public.pilar_pesos p
           where p.pilar_id = c.id and p.desde <= ${HOY} order by p.desde desc limit 1
         ) w
         where c.es_pilar and c.activa and not c.es_capa and c.red = 'linkedin'`,
      )
      expect(rows[0]?.total).toBe(110)
    })
  })

  it("refuses a stage that is not today or a later date the network already has", async () => {
    await como(comoConi, async (c) => {
      const etapa = await etapaPropia(c, ["diagnostico-doble"])
      const id = await borrador(c, "linkedin", `Fechas ${SUFIJO}`, `Fechas ${SUFIJO}`)
      const { rows } = await c.query<{ siguiente: string }>("select ($1::date + 1)::text as siguiente", [etapa])
      for (const clave of [await hoy(c, -1), "2026-11-04", rows[0]?.siguiente ?? "", "hoy", "2026-13-45"]) {
        const error = await rechazo(c, id, { [clave]: { nuevo: 10 } })
        expect([error.code, error.message], clave).toEqual(["22023", "etapa_invalida"])
      }
    })
  })

  it("refuses a name or short name any category already has, retired or not, whatever its case and accents", async () => {
    await como(comoConi, async (c) => {
      const casos: [string, string][] = [
        ["PAREJA Y CONVERSACION", `Pareja ${SUFIJO}`],
        [`Límites nuevos ${SUFIJO}`, "LIMITES"],
        [`Categoría ${SUFIJO}`, "General"],
        ["Diagnóstico doble", `DD ${SUFIJO}`],
      ]
      for (const [nombre, corto] of casos) {
        const error = await rechazo(c, await borrador(c, "linkedin", nombre, corto), {})
        expect([error.code, error.message], `${nombre} / ${corto}`).toEqual(["23505", "nombre_en_uso"])
      }
    })
  })

  it("takes a slug with a number when its name's slug is taken", async () => {
    await como(comoConi, async (c) => {
      const pilar = await aprobar(c, await borrador(c, "linkedin", "Diagnóstico-doble", `Doble ${SUFIJO}`), {})
      const { rows } = await c.query("select slug from public.categorias where id = $1", [pilar])
      expect(rows).toEqual([{ slug: "diagnostico-doble-2" }])
    })
  })

  it("refuses a weight for a pillar of the other network, a layer, a retired pillar or no pillar at all", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      const deLinkedin = await borrador(c, "linkedin", `Cruce ${SUFIJO}`, `Cruce ${SUFIJO}`)
      const deInstagram = await borrador(c, "instagram", `Capa ${SUFIJO}`, `Capa ${SUFIJO}`)
      const casos: [string, Record<string, Record<string, number>>][] = [
        [deLinkedin, { [dia]: { [await idDe(c, "mi-nueva-partida")]: 30 } }],
        [deInstagram, { [dia]: { [await idDe(c, "capa-tdah")]: 10 } }],
        [deLinkedin, { [dia]: { [await idDe(c, "pareja")]: 10 } }],
        [deLinkedin, { [dia]: { "no-es-un-id": 10 } }],
      ]
      for (const [id, pesos] of casos) {
        const error = await rechazo(c, id, pesos)
        expect([error.code, error.message], JSON.stringify(pesos)).toEqual(["22023", "pilar_de_otra_red"])
      }
    })
  })

  it("refuses weights that are not numbers over 0 and up to 100, or a stage that is not an object", async () => {
    await como(comoConi, async (c) => {
      const dia = await hoy(c)
      const id = await borrador(c, "linkedin", `Peso ${SUFIJO}`, `Peso ${SUFIJO}`)
      const casos = [
        { [dia]: { nuevo: 0 } },
        { [dia]: { nuevo: 100.5 } },
        { [dia]: { nuevo: "10" } },
        { [dia]: { nuevo: 0.001 } },
        { [dia]: 10 },
        [],
      ]
      for (const pesos of casos) {
        const error = await rechazo(c, id, pesos)
        expect([error.code, error.message], JSON.stringify(pesos)).toEqual(["22023", "peso_invalido"])
      }
    })
  })

  it("refuses WAV and a draft that does not exist", async () => {
    await como(comoConi, async (c) => {
      const id = await borrador(c, "linkedin", `Ajeno ${SUFIJO}`, `Ajeno ${SUFIJO}`)
      await asumir(c, comoMantenedor)
      const deWav = await rechazo(c, id, {})
      expect([deWav.code, deWav.message]).toEqual(["42501", "sin_permiso"])
      await asumir(c, comoConi)
      const ausente = await rechazo(c, "00000000-0000-4000-8000-000000000000", {})
      expect([ausente.code, ausente.message]).toEqual(["P0002", "borrador_inexistente"])
    })
  })

  it("leaves a draft out of every pillar: temas_de_red finds nothing for its id and categorias has no row of it", async () => {
    await como(comoConi, async (c) => {
      const id = await borrador(c, "linkedin", `Invisible ${SUFIJO}`, `Invisible ${SUFIJO}`)
      expect((await c.query("select 1 from public.temas_de_red('linkedin', $1)", [id])).rowCount).toBe(0)
      expect(
        (await c.query("select 1 from public.categorias where nombre = $1", [`Invisible ${SUFIJO}`])).rowCount,
      ).toBe(0)
    })
  })
})
