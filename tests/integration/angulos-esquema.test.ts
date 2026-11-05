import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(async () => {
  await pool.end()
})

describe("pilar_angulos", () => {
  it("holds the six angles of Coni's manuals, two per merged pillar, with the two minimums", async () => {
    const { rows } = await pool.query<{
      pilar: string
      slug: string
      nombre: string
      orden: number
      tope: number | null
    }>(
      `select c.slug as pilar, a.slug, a.nombre, a.orden, ceil(6 * a.minimo)::int as tope
         from public.pilar_angulos a join public.categorias c on c.id = a.pilar_id
        order by c.red, c.orden, a.orden`,
    )
    // `red` sorts instagram before linkedin.
    expect(rows).toEqual([
      { pilar: "mi-nueva-partida", slug: "lo-vivo", nombre: "Lo vivo", orden: 1, tope: null },
      { pilar: "mi-nueva-partida", slug: "pruebalo-tu", nombre: "Pruébalo tú", orden: 2, tope: 2 },
      { pilar: "bienestar-e-impacto", slug: "lo-que-se-ve", nombre: "Lo que se ve", orden: 1, tope: null },
      { pilar: "bienestar-e-impacto", slug: "como-se-mide", nombre: "Cómo se mide", orden: 2, tope: null },
      { pilar: "psicologia-en-la-mesa", slug: "lo-que-planteo", nombre: "Lo que planteo", orden: 1, tope: null },
      { pilar: "psicologia-en-la-mesa", slug: "lo-que-construyo", nombre: "Lo que construyo", orden: 2, tope: 2 },
    ])
  })

  it("keeps each angle's voice and format in its description, as the manuals say them", async () => {
    const { rows } = await pool.query<{ descripcion: string }>(
      "select descripcion from public.pilar_angulos where slug = 'lo-que-construyo'",
    )
    expect(rows[0]?.descripcion).toBe(
      "Mi caso a la vista. Una psicóloga que construye y entrena modelos: Eureka Engine, Game Over Impostora, videojuegos, el diplomado, Conidolly, mi etapa de psicóloga cyborg. Voz íntima, fotos reales, demos y video.",
    )
  })

  it("is read by Coni and WAV, by nobody else, and written by nobody through the API", async () => {
    await como(comoConi, async (c) => {
      expect((await c.query("select 1 from public.pilar_angulos")).rowCount).toBe(6)
      for (const sesion of [comoConi, comoMantenedor, comoServicio]) {
        await asumir(c, sesion)
        const escrito = await fallaCon(c, "update public.pilar_angulos set nombre = 'Otro'")
        expect(escrito.code).toBe("42501")
        const borrado = await fallaCon(c, "delete from public.pilar_angulos")
        expect(borrado.code).toBe("42501")
      }
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.pilar_angulos")).rowCount).toBe(6)
      await asumir(c, comoServicio)
      expect((await c.query("select 1 from public.pilar_angulos")).rowCount).toBe(6)
      await asumir(c, comoOtra)
      expect((await c.query("select 1 from public.pilar_angulos")).rowCount).toBe(0)
    })
  })

  it("belongs to a network's pillar, never to a layer nor to a pillar without a network", async () => {
    await como(comoPostgres, async (c) => {
      const insertar = (slugDelPilar: string, esCapa: string) =>
        fallaCon(
          c,
          `insert into public.pilar_angulos (pilar_id, red, es_capa, slug, nombre, descripcion, orden)
           select id, red, ${esCapa}, 'nuevo', 'Nuevo', 'Una descripción.', 9 from public.categorias where slug = $1`,
          [slugDelPilar],
        )
      // The layer as what it is: the check refuses it.
      expect((await insertar("capa-tdah", "es_capa")).code).toBe("23514")
      // The layer passed off as a pillar: no categorias row has that (id, red, es_capa).
      expect((await insertar("capa-tdah", "false")).code).toBe("23503")
      // A pillar of 2026-10-17, without a network.
      expect((await insertar("caso-coni", "false")).code).toBe("23514")
    })
  })
})
