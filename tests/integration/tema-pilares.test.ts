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

type Par = readonly [string, string | null]
const filas = (pares: readonly Par[]) => JSON.stringify(pares.map(([pilar, fuerza]) => ({ pilar, fuerza })))

async function pilaresDe(c: pg.PoolClient, tema: string) {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ slug: string; fuerza: string | null; origen: string }>(
    `select c.slug, t.fuerza, t.origen from public.tema_pilares t join public.categorias c on c.id = t.pilar_id
      where t.tema_id = $1 order by c.slug`,
    [tema],
  )
  return rows
}

describe("cambiar_pilares_de_tema", () => {
  it("as Coni replaces the topic's rows with hers", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema que Coni cambia")
      await fila(c, tema, "diagnostico-doble", "alta", "automatico")
      await asumir(c, comoConi)
      await c.query("select public.cambiar_pilares_de_tema($1, $2::jsonb)", [
        tema,
        filas([
          ["bienestar-e-impacto", "alta"],
          ["diagnostico-doble", "media"],
          ["mi-nueva-partida", "alta"],
          ["capa-tdah", null],
        ]),
      ])
      expect(await pilaresDe(c, tema)).toEqual([
        { slug: "bienestar-e-impacto", fuerza: "alta", origen: "coni" },
        { slug: "capa-tdah", fuerza: null, origen: "coni" },
        { slug: "diagnostico-doble", fuerza: "media", origen: "coni" },
        { slug: "mi-nueva-partida", fuerza: "alta", origen: "coni" },
      ])
    })
  })

  it("leaves the topic without pillars when she clears them", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema sin pilares")
      await fila(c, tema, "mujeres-lideres", "alta")
      await asumir(c, comoConi)
      await c.query("select public.cambiar_pilares_de_tema($1, '[]'::jsonb)", [tema])
      expect(await pilaresDe(c, tema)).toEqual([])
    })
  })

  it.each([
    [
      "two main pillars in one network",
      [
        ["bienestar-e-impacto", "alta"],
        ["diagnostico-doble", "alta"],
      ],
      "22023",
      "dos_principales",
    ],
    [
      "a secondary without a main pillar in its network",
      [["diagnostico-doble", "media"]],
      "22023",
      "secundario_sin_principal",
    ],
    ["a layer with a strength", [["capa-tdah", "media"]], "22023", "fuerza_invalida"],
    ["a pillar without a strength", [["mi-nueva-partida", null]], "22023", "fuerza_invalida"],
    [
      "a pillar twice",
      [
        ["mi-nueva-partida", "alta"],
        ["mi-nueva-partida", "media"],
      ],
      "22023",
      "pilar_repetido",
    ],
    ["a pillar without a network", [["caso-coni", "alta"]], "P0002", "pilar_desconocido"],
    ["a slug that is no pillar", [["no-existe", "alta"]], "P0002", "pilar_desconocido"],
  ] as const)("refuses %s and keeps what was there", async (_caso, pares, code, message) => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema que no cambia")
      await fila(c, tema, "mujeres-lideres", "alta")
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.cambiar_pilares_de_tema($1, $2::jsonb)", [tema, filas(pares)])
      expect(error).toMatchObject({ code, message })
      expect(await pilaresDe(c, tema)).toEqual([{ slug: "mujeres-lideres", fuerza: "alta", origen: "coni" }])
    })
  })

  it("refuses rows that are not a list, a merged or missing topic, and WAV", async () => {
    await como(comoPostgres, async (c) => {
      const tema = await crearTema(c, "Tema destino")
      const fusionado = await crearTema(c, "Tema fusionado")
      await c.query("update public.temas set fusionado_en = $1 where id = $2", [tema, fusionado])
      await asumir(c, comoConi)
      expect((await fallaCon(c, "select public.cambiar_pilares_de_tema($1, '{}'::jsonb)", [tema])).message).toBe(
        "filas_invalidas",
      )
      expect((await fallaCon(c, "select public.cambiar_pilares_de_tema($1, '[]'::jsonb)", [fusionado])).message).toBe(
        "tema_inexistente",
      )
      await asumir(c, comoMantenedor)
      const wav = await fallaCon(c, "select public.cambiar_pilares_de_tema($1, '[]'::jsonb)", [tema])
      expect(wav).toMatchObject({ code: "42501", message: "sin_permiso" })
    })
  })
})

describe("pilares_automaticos_de_tema", () => {
  it("as the service role fills a topic without pillars and leaves one that has them", async () => {
    await como(comoPostgres, async (c) => {
      const nuevo = await crearTema(c, "Tema recién creado")
      const conPilares = await crearTema(c, "Tema que ya tiene pilares")
      await fila(c, conPilares, "mujeres-lideres", "alta")
      await asumir(c, comoServicio)
      const pares = filas([
        ["game-over-impostora", "alta"],
        ["capa-tdah", null],
      ])
      const { rows } = await c.query<{ n: number }>("select public.pilares_automaticos_de_tema($1, $2::jsonb) as n", [
        nuevo,
        pares,
      ])
      expect(rows[0]?.n).toBe(2)
      const otra = await c.query<{ n: number }>("select public.pilares_automaticos_de_tema($1, $2::jsonb) as n", [
        conPilares,
        pares,
      ])
      expect(otra.rows[0]?.n).toBe(0)
      expect(await pilaresDe(c, nuevo)).toEqual([
        { slug: "capa-tdah", fuerza: null, origen: "automatico" },
        { slug: "game-over-impostora", fuerza: "alta", origen: "automatico" },
      ])
      expect(await pilaresDe(c, conPilares)).toEqual([{ slug: "mujeres-lideres", fuerza: "alta", origen: "coni" }])
    })
  })

  it("is for the service role only", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.pilares_automaticos_de_tema(gen_random_uuid(), '[]'::jsonb)")
      expect(error.code).toBe("42501")
    })
  })
})
