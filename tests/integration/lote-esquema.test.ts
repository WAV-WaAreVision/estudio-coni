import { readFileSync } from "node:fs"
import { join } from "node:path"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { VENTANA_DESHACER_MS } from "@/lib/dominio/estados"
import {
  asumir,
  CONI,
  como,
  comoConi,
  comoMantenedor,
  comoOtra,
  comoPostgres,
  comoServicio,
  fallaCon,
  MANTENEDOR,
  pool,
} from "./db"

afterAll(() => pool.end())

type Cliente = pg.PoolClient
const MIGRACION = readFileSync(join(process.cwd(), "supabase/migrations/20261017000400_lote.sql"), "utf-8")

async function crearIdea(c: Cliente, pilar = "ia-salud-mental"): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, tema, formato, fuerza, estado, origen, fijada_en)
     values ($1, 'Gancho', 'Tema', 'reel', 'media', 'idea', 'motor', now()) returning id`,
    [pilar],
  )
  const fila = rows[0]
  if (!fila) throw new Error("No se creó la idea")
  return fila.id
}

async function idea(c: Cliente, id: string) {
  const { rows } = await c.query(
    "select estado, motivo_descarte, fijada_en, descartada_en, descartada_por from public.ideas where id = $1",
    [id],
  )
  return rows[0]
}

describe("descartar_ideas", () => {
  it("discards every idea of the batch with one motive, stamps who and when, and unpins them", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = [await crearIdea(c), await crearIdea(c)]
      await asumir(c, comoConi)
      await c.query("select public.descartar_ideas($1::uuid[], 'repetida')", [[a, b]])
      await asumir(c, comoPostgres)
      for (const id of [a, b]) {
        expect(await idea(c, id)).toMatchObject({
          estado: "descartada",
          motivo_descarte: "repetida",
          fijada_en: null,
          descartada_por: CONI,
        })
        expect((await idea(c, id)).descartada_en).toBeInstanceOf(Date)
      }
    })
  })

  it("discards none when one of them already left the bank", async () => {
    await como(comoPostgres, async (c) => {
      const [libre, usada] = [await crearIdea(c), await crearIdea(c)]
      await c.query("update public.ideas set estado = 'usada' where id = $1", [usada])
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.descartar_ideas($1::uuid[], 'debil')", [[libre, usada]])
      expect(error).toMatchObject({ code: "22023", message: "no_descartable" })
      await asumir(c, comoPostgres)
      expect((await idea(c, libre)).estado).toBe("idea")
    })
  })

  it("refuses an empty batch, more than five, a repeated id or a null with lote_invalido", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      for (const ids of [[], [id, id], Array.from({ length: 6 }, () => id), [id, null]]) {
        const error = await fallaCon(c, "select public.descartar_ideas($1::uuid[], 'debil')", [ids])
        expect(error).toMatchObject({ code: "22023", message: "lote_invalido" })
      }
    })
  })

  it("refuses an unknown motive, pilar_retirado included", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      for (const motivo of ["nada", "pilar_retirado"]) {
        const error = await fallaCon(c, "select public.descartar_ideas($1::uuid[], $2)", [[id], motivo])
        expect(error).toMatchObject({ code: "22023", message: "motivo_invalido" })
      }
    })
  })

  it("lets the maintainer discard and refuses anyone else and the service role", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = [await crearIdea(c), await crearIdea(c)]
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.descartar_ideas($1::uuid[], 'debil')", [[a]])).code).toBe("42501")
      await asumir(c, comoServicio)
      expect((await fallaCon(c, "select public.descartar_ideas($1::uuid[], 'debil')", [[a]])).code).toBe("42501")
      await asumir(c, comoMantenedor)
      await c.query("select public.descartar_ideas($1::uuid[], 'otro')", [[b]])
      await asumir(c, comoPostgres)
      expect((await idea(c, b)).descartada_por).toBe(MANTENEDOR)
    })
  })
})

describe("descartar_idea after the batch migration", () => {
  it("stamps who and when too, so a single discard reads like a batch of one", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      await c.query("select public.descartar_idea($1, 'debil')", [id])
      await asumir(c, comoPostgres)
      expect(await idea(c, id)).toMatchObject({ estado: "descartada", motivo_descarte: "debil", descartada_por: CONI })
    })
  })
})

describe("restaurar_ideas", () => {
  it("brings back what Coni discarded inside the window and clears the motive, the time and the author", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = [await crearIdea(c), await crearIdea(c)]
      await asumir(c, comoConi)
      await c.query("select public.descartar_ideas($1::uuid[], 'debil')", [[a, b]])
      const { rows } = await c.query<{ vueltas: string[] }>("select public.restaurar_ideas($1::uuid[]) as vueltas", [
        [a, b],
      ])
      expect([...(rows[0]?.vueltas ?? [])].sort()).toEqual([a, b].sort())
      await asumir(c, comoPostgres)
      expect(await idea(c, a)).toMatchObject({
        estado: "idea",
        motivo_descarte: null,
        descartada_en: null,
        descartada_por: null,
      })
    })
  })

  it("leaves out an idea discarded more than 8 seconds ago by the database clock", async () => {
    await como(comoPostgres, async (c) => {
      const [reciente, vieja] = [await crearIdea(c), await crearIdea(c)]
      await asumir(c, comoConi)
      await c.query("select public.descartar_ideas($1::uuid[], 'debil')", [[reciente, vieja]])
      await asumir(c, comoPostgres)
      await c.query("update public.ideas set descartada_en = now() - interval '9 seconds' where id = $1", [vieja])
      await asumir(c, comoConi)
      const { rows } = await c.query("select public.restaurar_ideas($1::uuid[]) as vueltas", [[reciente, vieja]])
      expect(rows[0]?.vueltas).toEqual([reciente])
      await asumir(c, comoPostgres)
      expect((await idea(c, vieja)).estado).toBe("descartada")
    })
  })

  it("never brings back an idea its retired pillar took out of the bank", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await c.query(
        `update public.ideas set estado = 'descartada', motivo_descarte = 'pilar_retirado',
           descartada_en = now(), descartada_por = $2 where id = $1`,
        [id, CONI],
      )
      await asumir(c, comoConi)
      const { rows } = await c.query("select public.restaurar_ideas($1::uuid[]) as vueltas", [[id]])
      expect(rows[0]?.vueltas).toEqual([])
    })
  })

  it("leaves out an idea whose pillar was retired inside the window", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      await c.query("select public.descartar_ideas($1::uuid[], 'debil')", [[id]])
      await asumir(c, comoPostgres)
      await c.query("update public.categorias set activa = false where slug = 'ia-salud-mental'")
      await asumir(c, comoConi)
      const { rows } = await c.query("select public.restaurar_ideas($1::uuid[]) as vueltas", [[id]])
      expect(rows[0]?.vueltas).toEqual([])
    })
  })

  it("leaves out what the maintainer discarded and lets only Coni call it", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoMantenedor)
      await c.query("select public.descartar_ideas($1::uuid[], 'debil')", [[id]])
      expect((await fallaCon(c, "select public.restaurar_ideas($1::uuid[])", [[id]])).code).toBe("42501")
      await asumir(c, comoConi)
      const { rows } = await c.query("select public.restaurar_ideas($1::uuid[]) as vueltas", [[id]])
      expect(rows[0]?.vueltas).toEqual([])
    })
  })

  it("measures the same window as the app's undo", () => {
    expect(MIGRACION).toContain(`interval '${VENTANA_DESHACER_MS / 1000} seconds'`)
  })
})
