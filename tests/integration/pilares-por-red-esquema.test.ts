import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

// [slug, red, orden, nombre_corto, es_capa] as in Coni's manuals of 2026-11-04 (spec section 1).
const SEMILLA = [
  ["diagnostico-doble", "linkedin", 1, "Diagnóstico doble", false],
  ["bienestar-e-impacto", "linkedin", 2, "Bienestar e impacto", false],
  ["psicologia-en-la-mesa", "linkedin", 3, "Psicología en la mesa", false],
  ["mujeres-lideres", "linkedin", 4, "Mujeres líderes", false],
  ["game-over-impostora", "instagram", 1, "Game Over Impostora", false],
  ["mi-nueva-partida", "instagram", 2, "Mi nueva partida", false],
  ["inteligencia-emocional", "instagram", 3, "Inteligencia emocional", false],
  ["capa-tdah", "instagram", 4, "Capa TDAH", true],
] as const

interface FilaDeRed {
  slug: string
  red: string
  orden: number
  nombre_corto: string
  es_capa: boolean
  activa: boolean
  descripcion: string | null
}

describe("pilares por red", () => {
  it("seeds 7 pillars and 1 layer, active, with a network, a short name and a description", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<FilaDeRed>(
        `select slug, red, orden, nombre_corto, es_capa, activa, descripcion from public.categorias
          where red is not null order by red desc, orden`,
      )
      expect(rows.map((f) => [f.slug, f.red, f.orden, f.nombre_corto, f.es_capa])).toEqual(SEMILLA.map((s) => [...s]))
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
          `insert into public.pilar_pesos (pilar_id, desde, peso)
           select id, '2027-01-01', 10 from public.categorias where slug = $1`,
          [slug],
        )
        expect(error.message).toBe("peso_sin_pilar_de_red")
      }
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
