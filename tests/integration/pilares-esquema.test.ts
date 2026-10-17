import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

interface FilaDePilar {
  slug: string
  nombre: string
  nombre_corto: string | null
  descripcion: string | null
  es_pilar: boolean
  activa: boolean
  orden: number | null
}

const NUEVOS = [
  ["ia-salud-mental", "IA y salud mental", "IA y salud mental", 1],
  ["practica-clinica", "Práctica clínica aumentada", "Práctica clínica", 2],
  ["etica-regulacion", "Ética y regulación", "Ética", 3],
  ["acceso-salud-publica", "Acceso y salud pública", "Acceso", 4],
  ["caso-coni", "Caso Coni: humana + avatar", "Caso Coni", 5],
] as const

const VIEJOS = ["pareja", "deseo", "autoestima", "limites", "bienestar"] as const

async function pilares(): Promise<FilaDePilar[]> {
  return como(comoPostgres, async (c) => {
    const { rows } = await c.query<FilaDePilar>(
      "select slug, nombre, nombre_corto, descripcion, es_pilar, activa, orden from public.categorias order by orden nulls last, slug",
    )
    return rows
  })
}

describe("categorias como pilares", () => {
  it("adds the five LinkedIn pillars, active and in the PDF's order", async () => {
    const filas = await pilares()
    const activos = filas.filter((f) => f.es_pilar && f.activa)
    expect(activos.map((f) => [f.slug, f.nombre, f.nombre_corto, f.orden])).toEqual(NUEVOS.map((n) => [...n]))
    for (const pilar of activos) expect(pilar.descripcion?.length ?? 0).toBeGreaterThan(20)
  })

  it("keeps the five old pillars as inactive pillar rows, after the new ones", async () => {
    const filas = await pilares()
    const viejos = filas.filter((f) => VIEJOS.some((slug) => slug === f.slug))
    expect(viejos).toHaveLength(5)
    for (const viejo of viejos) {
      expect(viejo).toMatchObject({ es_pilar: true, activa: false })
      expect(viejo.orden).toBeGreaterThan(5)
      expect(viejo.nombre_corto).not.toBeNull()
    }
  })

  it("leaves general as a plain active category", async () => {
    const general = (await pilares()).find((f) => f.slug === "general")
    expect(general).toMatchObject({ es_pilar: false, activa: true, orden: null })
  })

  it("refuses a pillar without its order or short name", async () => {
    await como(comoPostgres, async (c) => {
      await expect(
        c.query("insert into public.categorias (slug, nombre, es_pilar) values ('x-pilar', 'X pilar', true)"),
      ).rejects.toMatchObject({ code: "23514" })
    })
  })

  it("is readable by Coni and WAV and by nobody else", async () => {
    const leer = (sesion: typeof comoConi) =>
      como(
        sesion,
        async (c) => (await c.query("select slug from public.categorias where es_pilar and activa")).rowCount,
      )
    expect(await leer(comoConi)).toBe(5)
    expect(await leer(comoMantenedor)).toBe(5)
    expect(await leer(comoOtra)).toBe(0)
  })
})

const insertarIdea = (pilar: string, estado = "idea") =>
  `insert into public.ideas (pilar, gancho, fuerza, estado) values ('${pilar}', 'gancho', 'alta', '${estado}') returning id`

describe("ideas.pilar apunta a un pilar activo", () => {
  it("takes an active pillar", async () => {
    await como(comoPostgres, async (c) => {
      const { rowCount } = await c.query(insertarIdea("caso-coni"))
      expect(rowCount).toBe(1)
    })
  })

  it("refuses a retired pillar on insert and on update", async () => {
    await como(comoPostgres, async (c) => {
      expect((await fallaCon(c, insertarIdea("pareja"))).message).toBe("pilar_inactivo")
      const { rows } = await c.query<{ id: string }>(insertarIdea("caso-coni"))
      const error = await fallaCon(c, "update public.ideas set pilar = 'deseo' where id = $1", [rows[0]?.id])
      expect(error.message).toBe("pilar_inactivo")
    })
  })

  it("refuses a category that is not a pillar and a slug that does not exist", async () => {
    await como(comoPostgres, async (c) => {
      expect((await fallaCon(c, insertarIdea("general"))).message).toBe("pilar_inactivo")
      expect((await fallaCon(c, insertarIdea("no-existe"))).code).toBe("23503")
    })
  })

  it("has no pilar enum any more", async () => {
    await como(comoPostgres, async (c) => {
      const { rowCount } = await c.query(
        "select 1 from pg_type where typname = 'pilar' and typnamespace = 'public'::regnamespace",
      )
      expect(rowCount).toBe(0)
    })
  })

  it("archives bank ideas of retired pillars as pilar_retirado and keeps used ones", async () => {
    await como(comoPostgres, async (c) => {
      // Ideas of a retired pillar can no longer be inserted: the trigger is lifted for this transaction only.
      await c.query("alter table public.ideas disable trigger exigir_pilar_activo")
      const libre = (await c.query<{ id: string }>(insertarIdea("pareja"))).rows[0]?.id
      const usada = (await c.query<{ id: string }>(insertarIdea("deseo", "usada"))).rows[0]?.id
      const nueva = (await c.query<{ id: string }>(insertarIdea("caso-coni"))).rows[0]?.id
      await c.query("alter table public.ideas enable trigger exigir_pilar_activo")

      const { rows } = await c.query<{ n: number }>("select public.archivar_ideas_de_pilares_retirados() as n")
      expect(rows[0]?.n).toBeGreaterThanOrEqual(1)

      const estado = async (id: string | undefined) =>
        (
          await c.query<{ estado: string; motivo_descarte: string | null; pilar: string }>(
            "select estado, motivo_descarte, pilar from public.ideas where id = $1",
            [id],
          )
        ).rows[0]
      expect(await estado(libre)).toEqual({ estado: "descartada", motivo_descarte: "pilar_retirado", pilar: "pareja" })
      expect(await estado(usada)).toEqual({ estado: "usada", motivo_descarte: null, pilar: "deseo" })
      expect(await estado(nueva)).toMatchObject({ estado: "idea" })
    })
  })

  it("does not let Coni pick pilar_retirado", async () => {
    await como(comoPostgres, async (c) => {
      const id = (await c.query<{ id: string }>(insertarIdea("caso-coni"))).rows[0]?.id
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.descartar_idea($1, 'pilar_retirado')", [id])
      expect(error.message).toBe("motivo_invalido")
    })
  })

  it("keeps the archive function for postgres only", async () => {
    await como(comoServicio, async (c) => {
      expect((await fallaCon(c, "select public.archivar_ideas_de_pilares_retirados()")).code).toBe("42501")
    })
  })
})
