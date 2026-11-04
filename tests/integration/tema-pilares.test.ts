import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`

async function crearTema(c: pg.PoolClient, nombre: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id",
    [nombre, CENTROIDE],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el tema ${nombre}`)
  return id
}

/** Writes a row straight into the table, as postgres: what the RPCs do, without their checks. */
const fila = (c: pg.PoolClient, tema: string, slug: string, fuerza: string | null, origen = "coni") =>
  c.query(
    `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
     select $1, c.id, c.red, c.es_capa, $3, $4 from public.categorias c where c.slug = $2`,
    [tema, slug, fuerza, origen],
  )

describe("tema_pilares", () => {
  it("takes one main pillar per network, secondaries and a layer next to the main pillar", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema con pilares")
      await fila(c, tema, "bienestar-e-impacto", "alta")
      await fila(c, tema, "diagnostico-doble", "media")
      await fila(c, tema, "mi-nueva-partida", "alta")
      await fila(c, tema, "capa-tdah", null)
      const { rows } = await c.query<{ n: number }>(
        "select count(*)::int as n from public.tema_pilares where tema_id = $1",
        [tema],
      )
      expect(rows[0]?.n).toBe(4)
    })
  })

  it("refuses two main pillars for one topic in one network", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema con dos principales")
      await fila(c, tema, "bienestar-e-impacto", "alta")
      const error = await fallaCon(
        c,
        `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
         select $1, c.id, c.red, c.es_capa, 'alta', 'coni' from public.categorias c where c.slug = 'diagnostico-doble'`,
        [tema],
      )
      expect(error.code).toBe("23505")
    })
  })

  it("refuses a layer with a strength and a pillar without one", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema de fuerzas")
      const capa = await fallaCon(
        c,
        `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
         select $1, c.id, c.red, c.es_capa, 'media', 'coni' from public.categorias c where c.slug = 'capa-tdah'`,
        [tema],
      )
      expect(capa.code).toBe("23514")
      const pilar = await fallaCon(
        c,
        `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
         select $1, c.id, c.red, c.es_capa, null, 'coni' from public.categorias c where c.slug = 'mi-nueva-partida'`,
        [tema],
      )
      expect(pilar.code).toBe("23514")
    })
  })

  it("refuses a row whose network or layer flag is not the pillar's, and a pillar without a network", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema de red equivocada")
      const red = await fallaCon(
        c,
        `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
         select $1, c.id, 'linkedin', false, 'alta', 'coni' from public.categorias c where c.slug = 'mi-nueva-partida'`,
        [tema],
      )
      expect(red.code).toBe("23503")
      const viejo = await fallaCon(
        c,
        `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
         select $1, c.id, 'linkedin', false, 'alta', 'coni' from public.categorias c where c.slug = 'caso-coni'`,
        [tema],
      )
      expect(viejo.code).toBe("23503")
    })
  })

  it("asks a lot exactly on reclassification rows", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema de lote")
      const sinLote = await fallaCon(
        c,
        `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
         select $1, c.id, c.red, c.es_capa, 'alta', 'reclasificacion' from public.categorias c where c.slug = 'mujeres-lideres'`,
        [tema],
      )
      expect(sinLote.code).toBe("23514")
    })
  })

  it("goes away with its topic and keeps a pillar's network fixed while topics use it", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema que se va")
      await fila(c, tema, "mujeres-lideres", "alta")
      const cambiar = await fallaCon(c, "update public.categorias set red = 'instagram' where slug = 'mujeres-lideres'")
      expect(cambiar.code).toBe("23503")
      await c.query("delete from public.temas where id = $1", [tema])
      const { rows } = await c.query<{ n: number }>(
        "select count(*)::int as n from public.tema_pilares where tema_id = $1",
        [tema],
      )
      expect(rows[0]?.n).toBe(0)
    })
  })

  it("is read by Coni and WAV, by nobody else, and nobody writes it directly", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema leído")
      await fila(c, tema, "mujeres-lideres", "alta")
      for (const [sesion, filas] of [
        [comoConi, 1],
        [comoMantenedor, 1],
        [comoOtra, 0],
      ] as const) {
        await asumir(c, sesion)
        const { rowCount } = await c.query("select 1 from public.tema_pilares where tema_id = $1", [tema])
        expect(rowCount).toBe(filas)
      }
      await asumir(c, comoConi)
      const escribir = await fallaCon(c, "delete from public.tema_pilares where tema_id = $1", [tema])
      expect(escribir.code).toBe("42501")
      for (const sesion of [comoMantenedor, comoServicio]) {
        await asumir(c, sesion)
        const insertar = await fallaCon(
          c,
          `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
           select $1, c.id, c.red, c.es_capa, 'alta', 'coni' from public.categorias c where c.slug = 'mi-nueva-partida'`,
          [tema],
        )
        expect(insertar.code).toBe("42501")
      }
    })
  })
})
