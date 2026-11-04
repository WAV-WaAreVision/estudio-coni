import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

// [slug, red, orden, nombre, nombre_corto, es_pilar, es_capa] as in Coni's manuals of 2026-11-04 (spec section 1).
const SEMILLA = [
  [
    "diagnostico-doble",
    "linkedin",
    1,
    "Diagnóstico doble: transformación digital con factor humano",
    "Diagnóstico doble",
    true,
    false,
  ],
  [
    "bienestar-e-impacto",
    "linkedin",
    2,
    "Bienestar e impacto: lo que le pasa a las personas cuando llega la IA, y cómo medirlo",
    "Bienestar e impacto",
    true,
    false,
  ],
  [
    "psicologia-en-la-mesa",
    "linkedin",
    3,
    "Psicología en la mesa: la psicología donde se construye la IA",
    "Psicología en la mesa",
    true,
    false,
  ],
  ["mujeres-lideres", "linkedin", 4, "Mujeres líderes, IA y síndrome del impostor", "Mujeres líderes", true, false],
  ["game-over-impostora", "instagram", 1, "Game Over Impostora", "Game Over Impostora", true, false],
  ["mi-nueva-partida", "instagram", 2, "Mi nueva partida", "Mi nueva partida", true, false],
  [
    "inteligencia-emocional",
    "instagram",
    3,
    "Inteligencia emocional aplicada: autocuidado, productividad y relaciones",
    "Inteligencia emocional",
    true,
    false,
  ],
  ["capa-tdah", "instagram", 4, "Capa TDAH", "Capa TDAH", true, true],
] as const

interface FilaDeRed {
  slug: string
  red: string
  orden: number
  nombre: string
  nombre_corto: string
  es_pilar: boolean
  es_capa: boolean
  activa: boolean
  descripcion: string | null
}

describe("pilares por red", () => {
  it("seeds 7 pillars and 1 layer, active, with a network, a short name and a description", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<FilaDeRed>(
        `select slug, red, orden, nombre, nombre_corto, es_pilar, es_capa, activa, descripcion from public.categorias
          where red is not null order by red desc, orden`,
      )
      expect(rows.map((f) => [f.slug, f.red, f.orden, f.nombre, f.nombre_corto, f.es_pilar, f.es_capa])).toEqual(
        SEMILLA.map((s) => [...s]),
      )
      for (const fila of rows) {
        expect(fila.activa).toBe(true)
        expect(fila.descripcion?.length ?? 0).toBeGreaterThan(40)
        expect(fila.descripcion).not.toContain("—")
      }
    })
  })

  it("leaves every existing category without a network", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ n: number }>(
        `select count(*)::int as n from public.categorias
          where slug in ('ia-salud-mental', 'practica-clinica', 'etica-regulacion', 'acceso-salud-publica', 'caso-coni',
                         'pareja', 'deseo', 'autoestima', 'limites', 'bienestar', 'general') and red is null`,
      )
      expect(rows[0]?.n).toBe(11)
    })
  })

  it("refuses a new active pillar without a network", async () => {
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(
        c,
        `insert into public.categorias (slug, nombre, nombre_corto, descripcion, orden, es_pilar, activa)
         values ('x-sin-red', 'X sin red', 'X', 'Una descripción.', 9, true, true)`,
      )
      expect(error).toMatchObject({ code: "23514", message: "pilar_sin_red" })
    })
  })

  it("refuses taking the network away from an active pillar, and lets an old pillar be retired and reactivated", async () => {
    await como(comoPostgres, async (c) => {
      const quitar = await fallaCon(c, "update public.categorias set red = null where slug = 'mujeres-lideres'")
      expect(quitar.message).toBe("pilar_sin_red")
      await c.query("update public.categorias set activa = false where slug = 'caso-coni'")
      const { rowCount } = await c.query("update public.categorias set activa = true where slug = 'caso-coni'")
      expect(rowCount).toBe(1)
    })
  })

  it("refuses activating a pillar created after this change without a network", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(
        `insert into public.categorias (slug, nombre, nombre_corto, descripcion, orden, es_pilar, activa)
         values ('x-borrador', 'X borrador', 'X', 'Una descripción.', 9, true, false)`,
      )
      const error = await fallaCon(c, "update public.categorias set activa = true where slug = 'x-borrador'")
      expect(error).toMatchObject({ code: "23514", message: "pilar_sin_red" })
      // A seeded pillar of a network is not one of the old ones either, even after losing its network while retired.
      await c.query("update public.categorias set activa = false, red = null where slug = 'capa-tdah'")
      const capa = await fallaCon(c, "update public.categorias set activa = true where slug = 'capa-tdah'")
      expect(capa.message).toBe("pilar_sin_red")
    })
  })

  it("keeps a layer a pillar and a network only on pillars", async () => {
    await como(comoPostgres, async (c) => {
      expect((await fallaCon(c, "update public.categorias set es_capa = true where slug = 'general'")).code).toBe(
        "23514",
      )
      expect((await fallaCon(c, "update public.categorias set red = 'linkedin' where slug = 'general'")).code).toBe(
        "23514",
      )
    })
  })

  it("refuses a layer as the pillar of an idea", async () => {
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(
        c,
        "insert into public.ideas (pilar, gancho, fuerza) values ('capa-tdah', 'gancho', 'alta')",
      )
      expect(error.message).toBe("pilar_inactivo")
      const { rowCount } = await c.query(
        "insert into public.ideas (pilar, gancho, fuerza) values ('mi-nueva-partida', 'gancho', 'alta')",
      )
      expect(rowCount).toBe(1)
    })
  })
})

describe("pesos de los pilares", () => {
  it("seeds the three LinkedIn stages and the Instagram one, each adding up to 100", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ red: string; desde: string; total: number }>(
        `select c.red, w.desde::text as desde, sum(w.peso)::float as total
           from public.pilar_pesos w join public.categorias c on c.id = w.pilar_id
          group by c.red, w.desde order by c.red, w.desde`,
      )
      expect(rows).toEqual([
        { red: "instagram", desde: "2026-11-04", total: 100 },
        { red: "linkedin", desde: "2026-11-04", total: 100 },
        { red: "linkedin", desde: "2027-01-01", total: 100 },
        { red: "linkedin", desde: "2027-07-01", total: 100 },
      ])
    })
  })

  it("weighs each LinkedIn pillar as the manual's table says", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ slug: string; pesos: number[] }>(
        `select c.slug, array_agg(w.peso::float order by w.desde) as pesos
           from public.pilar_pesos w join public.categorias c on c.id = w.pilar_id
          where c.red = 'linkedin' group by c.slug, c.orden order by c.orden`,
      )
      expect(rows).toEqual([
        { slug: "diagnostico-doble", pesos: [30, 25, 25] },
        { slug: "bienestar-e-impacto", pesos: [25, 25, 20] },
        { slug: "psicologia-en-la-mesa", pesos: [30, 35, 30] },
        { slug: "mujeres-lideres", pesos: [15, 15, 25] },
      ])
    })
  })

  it("refuses a weight for a layer or for a pillar without a network", async () => {
    await como(comoPostgres, async (c) => {
      for (const slug of ["capa-tdah", "caso-coni"]) {
        const error = await fallaCon(
          c,
          `insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
           select id, red, es_capa, '2027-01-01', 10 from public.categorias where slug = $1`,
          [slug],
        )
        expect(error).toMatchObject({ code: "23514", constraint: "peso_de_pilar_de_red" })
      }
    })
  })

  it("refuses a weight whose network or layer flag is not the pillar's", async () => {
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(
        c,
        `insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
         select id, 'instagram', false, '2028-01-01', 10 from public.categorias where slug = 'mujeres-lideres'`,
      )
      expect(error.code).toBe("23503")
    })
  })

  it("refuses making a weighted pillar a layer or taking its network away", async () => {
    await como(comoPostgres, async (c) => {
      const capa = await fallaCon(c, "update public.categorias set es_capa = true where slug = 'mujeres-lideres'")
      expect(capa.code).toBe("23503")
      const sinRed = await fallaCon(
        c,
        "update public.categorias set activa = false, red = null where slug = 'mujeres-lideres'",
      )
      expect(sinRed.code).toBe("23503")
    })
  })

  it("is readable by Coni and WAV, by nobody else, and writable by none of them nor the service role", async () => {
    const leer = (sesion: typeof comoConi) =>
      como(sesion, async (c) => (await c.query("select 1 from public.pilar_pesos")).rowCount)
    expect(await leer(comoConi)).toBe(15)
    expect(await leer(comoMantenedor)).toBe(15)
    expect(await leer(comoOtra)).toBe(0)
    await como(comoPostgres, async (c) => {
      for (const sesion of [comoConi, comoServicio]) {
        await asumir(c, sesion)
        const error = await fallaCon(c, "delete from public.pilar_pesos")
        expect(error.code).toBe("42501")
      }
    })
  })
})
