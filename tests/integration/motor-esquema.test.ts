import { readFileSync } from "node:fs"
import { join } from "node:path"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
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
  pool,
} from "./db"

afterAll(() => pool.end())

type Cliente = pg.PoolClient

async function crearIdea(
  c: Cliente,
  extra: { estado?: string; origen?: string; semana?: string; fijada?: boolean } = {},
) {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.ideas (pilar, gancho, tema, formato, fuerza, estado, origen, semana, fijada_en)
     values ('pareja', 'Gancho', 'Tema', 'reel', 'media', $1, $2, $3, case when $4 then now() end) returning id`,
    [extra.estado ?? "idea", extra.origen ?? "motor", extra.semana ?? null, extra.fijada ?? false],
  )
  const fila = rows[0]
  if (!fila) throw new Error("No se creó la idea")
  return fila.id
}

describe("ideas del motor", () => {
  it("defaults origen to propuesta and rejects an unknown origen", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ origen: string }>(
        `insert into public.ideas (pilar, gancho, tema, formato, fuerza)
         values ('pareja', 'g', 't', 'f', 'media') returning origen`,
      )
      expect(rows[0]?.origen).toBe("propuesta")
      const error = await fallaCon(c, "update public.ideas set origen = 'otro' where origen = 'propuesta'")
      expect(error.code).toBe("23514")
    })
  })

  it("accepts the archivada state and rejects an unknown one", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c, { estado: "archivada" })
      expect(id).toBeTruthy()
      const error = await fallaCon(c, "update public.ideas set estado = 'rara' where id = $1", [id])
      expect(error.code).toBe("23514")
    })
  })

  it("rejects an unknown motivo_descarte", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      const error = await fallaCon(c, "update public.ideas set motivo_descarte = 'x' where id = $1", [id])
      expect(error.code).toBe("23514")
    })
  })

  it("keeps the idea when its theory is deleted", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        "insert into public.teorias (origen) values ('motor') returning id",
      )
      const teoria = rows[0]?.id
      const id = await crearIdea(c)
      await c.query("update public.ideas set teoria_id = $1 where id = $2", [teoria, id])
      await c.query("delete from public.teorias where id = $1", [teoria])
      const { rows: despues } = await c.query("select teoria_id from public.ideas where id = $1", [id])
      expect(despues[0]).toEqual({ teoria_id: null })
    })
  })
})

describe("teorias del motor", () => {
  it("defaults to a manual theory with no temas and no warnings", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query("insert into public.teorias default values returning origen, temas, advertencias")
      expect(rows[0]).toEqual({ origen: "manual", temas: [], advertencias: [] })
    })
  })

  it("accepts descartada_por_motor and rejects an unknown nivel_evidencia", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        "insert into public.teorias (estado) values ('descartada_por_motor') returning id",
      )
      const error = await fallaCon(c, "update public.teorias set nivel_evidencia = 'x' where id = $1", [rows[0]?.id])
      expect(error.code).toBe("23514")
    })
  })
})

describe("teoria_afirmaciones", () => {
  async function teoriaConAfirmacion(c: Cliente) {
    const { rows: autor } = await c.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
    const { rows: cat } = await c.query<{ id: string }>("select id from public.categorias where slug = 'general'")
    const { rows: mat } = await c.query<{ id: string }>(
      `insert into public.materiales (autor_id, tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, subido_por)
       values ($1, 'documento', $2, 'x', now(), $3) returning id`,
      [autor[0]?.id, cat[0]?.id, CONI],
    )
    const { rows: afirmacion } = await c.query<{ id: string }>(
      `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
       values ($1, $2, 0, '{}', 't', 'c', 'consejo', 'opinion') returning id`,
      [mat[0]?.id, autor[0]?.id],
    )
    const { rows: teoria } = await c.query<{ id: string }>(
      "insert into public.teorias (origen) values ('motor') returning id",
    )
    return { teoria: teoria[0]?.id, afirmacion: afirmacion[0]?.id }
  }

  const insertar =
    "insert into public.teoria_afirmaciones (teoria_id, afirmacion_id, aporte) values ($1, $2, 'aporta algo')"

  it("is written by the service role, read by members and invisible to others", async () => {
    await como(comoPostgres, async (c) => {
      const { teoria, afirmacion } = await teoriaConAfirmacion(c)
      await asumir(c, comoServicio)
      await c.query(insertar, [teoria, afirmacion])
      await asumir(c, comoConi)
      expect((await c.query("select 1 from public.teoria_afirmaciones")).rows).toHaveLength(1)
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.teoria_afirmaciones")).rows).toHaveLength(1)
      await asumir(c, comoOtra)
      expect((await c.query("select 1 from public.teoria_afirmaciones")).rows).toEqual([])
    })
  })

  it("refuses writes from members", async () => {
    await como(comoPostgres, async (c) => {
      const { teoria, afirmacion } = await teoriaConAfirmacion(c)
      await asumir(c, comoConi)
      expect((await fallaCon(c, insertar, [teoria, afirmacion])).code).toBe("42501")
    })
  })

  it("goes away with its theory", async () => {
    await como(comoPostgres, async (c) => {
      const { teoria, afirmacion } = await teoriaConAfirmacion(c)
      await c.query(insertar, [teoria, afirmacion])
      await c.query("delete from public.teorias where id = $1", [teoria])
      expect((await c.query("select 1 from public.teoria_afirmaciones")).rows).toEqual([])
    })
  })
})

describe("motor_corridas", () => {
  it("starts running with an empty summary and one run per week", async () => {
    await como(comoServicio, async (c) => {
      const { rows } = await c.query(
        "insert into public.motor_corridas (semana) values ('2026-10-05') returning estado, resumen, costo_usd",
      )
      expect(rows[0]).toEqual({ estado: "corriendo", resumen: {}, costo_usd: "0" })
      const error = await fallaCon(c, "insert into public.motor_corridas (semana) values ('2026-10-05')")
      expect(error.code).toBe("23505")
    })
  })

  it("rejects an unknown state", async () => {
    await como(comoServicio, async (c) => {
      const error = await fallaCon(c, "insert into public.motor_corridas (semana, estado) values ('2026-10-12', 'x')")
      expect(error.code).toBe("23514")
    })
  })

  it("is readable by members only and writable by the service role only", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.motor_corridas (semana) values ('2026-10-19')")
    })
    await como(comoMantenedor, async (c) => {
      const { rows } = await c.query("select 1 from public.motor_corridas where semana = '2026-10-19'")
      expect(rows.length).toBeLessThanOrEqual(1)
    })
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "insert into public.motor_corridas (semana) values ('2026-10-26')")
      expect(error.code).toBe("42501")
    })
    await como(comoOtra, async (c) => {
      const { rows } = await c.query("select 1 from public.motor_corridas")
      expect(rows).toEqual([])
    })
  })

  it("audits its writes", async () => {
    await como(comoServicio, async (c) => {
      await c.query("insert into public.motor_corridas (semana) values ('2026-11-02')")
      const { rows } = await c.query(
        "select actor_rol from public.eventos where tabla = 'motor_corridas' and operacion = 'insert' and datos ->> 'semana' = '2026-11-02'",
      )
      expect(rows[0]).toEqual({ actor_rol: "service_role" })
    })
  })
})

describe("ajustes.ideas_por_semana", () => {
  it("defaults to 10 and stays between 1 and 30", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query("select ideas_por_semana from public.ajustes")
      expect(rows[0]).toEqual({ ideas_por_semana: 10 })
      for (const valor of [0, 31]) {
        const error = await fallaCon(c, "update public.ajustes set ideas_por_semana = $1", [valor])
        expect(error.code).toBe("23514")
      }
    })
  })
})

describe("descartar_idea", () => {
  it("discards a plain idea with its motivo and unpins it", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c, { fijada: true })
      await asumir(c, comoConi)
      await c.query("select public.descartar_idea($1, 'debil')", [id])
      await asumir(c, comoPostgres)
      const { rows } = await c.query("select estado, motivo_descarte, fijada_en from public.ideas where id = $1", [id])
      expect(rows[0]).toEqual({ estado: "descartada", motivo_descarte: "debil", fijada_en: null })
    })
  })

  it("rejects an unknown motivo with motivo_invalido", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.descartar_idea($1, 'nada')", [id])
      expect(error).toMatchObject({ code: "22023", message: "motivo_invalido" })
    })
  })

  it("rejects an idea that is not in the bank with no_descartable", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c, { estado: "usada" })
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.descartar_idea($1, 'debil')", [id])
      expect(error).toMatchObject({ code: "22023", message: "no_descartable" })
    })
  })

  it("refuses non members and the service role", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.descartar_idea($1, 'debil')", [id])).code).toBe("42501")
      await asumir(c, comoServicio)
      expect((await fallaCon(c, "select public.descartar_idea($1, 'debil')", [id])).code).toBe("42501")
    })
  })

  it("lets the maintainer discard too", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearIdea(c)
      await asumir(c, comoMantenedor)
      await c.query("select public.descartar_idea($1, 'otro')", [id])
    })
  })
})

describe("backfill of origen in the migration", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261003000400_motor.sql"), "utf-8")
  const backfill = sql
    .split(";")
    .find((sentencia) => /update\s+public\.ideas\s+set\s+origen\s*=\s*'propia'/.test(sentencia))

  it("marks the ideas Coni wrote herself as propia and leaves the imported ones alone", async () => {
    if (!backfill) throw new Error("La migración 400 no marca las ideas propias que ya existían")
    await como(comoPostgres, async (c) => {
      const propia = await c.query<{ id: string }>(
        `insert into public.ideas (pilar, gancho, tema, formato, fuerza, origen, fuentes)
         values ('pareja', 'g', 't', 'f', 'media', 'importada', '["Idea de Coni"]'::jsonb) returning id`,
      )
      const importada = await c.query<{ id: string }>(
        `insert into public.ideas (pilar, gancho, tema, formato, fuerza, origen, fuentes)
         values ('pareja', 'h', 't', 'f', 'media', 'importada', '["Un libro"]'::jsonb) returning id`,
      )
      await c.query(backfill)
      const { rows } = await c.query<{ id: string; origen: string }>(
        "select id, origen from public.ideas where id = any($1)",
        [[propia.rows[0]?.id, importada.rows[0]?.id]],
      )
      const por = new Map(rows.map((r) => [r.id, r.origen]))
      expect(por.get(propia.rows[0]?.id ?? "")).toBe("propia")
      expect(por.get(importada.rows[0]?.id ?? "")).toBe("importada")
    })
  })
})

describe("archivar_ideas_del_motor", () => {
  it("archives only unpinned engine ideas older than the window and returns the count", async () => {
    await como(comoPostgres, async (c) => {
      const vieja = await crearIdea(c, { semana: "2020-01-06" })
      const fijada = await crearIdea(c, { semana: "2020-01-06", fijada: true })
      const propia = await crearIdea(c, { semana: "2020-01-06", origen: "propia" })
      const reciente = await crearIdea(c, { semana: new Date().toISOString().slice(0, 10) })
      await asumir(c, comoServicio)
      const { rows } = await c.query<{ n: number }>("select public.archivar_ideas_del_motor(6) as n")
      expect(rows[0]?.n).toBe(1)
      await asumir(c, comoPostgres)
      const { rows: estados } = await c.query<{ id: string; estado: string }>(
        "select id, estado from public.ideas where id = any($1)",
        [[vieja, fijada, propia, reciente]],
      )
      const por = new Map(estados.map((e) => [e.id, e.estado]))
      expect(por.get(vieja)).toBe("archivada")
      expect(por.get(fijada)).toBe("idea")
      expect(por.get(propia)).toBe("idea")
      expect(por.get(reciente)).toBe("idea")
    })
  })

  it("is for the service role only", async () => {
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.archivar_ideas_del_motor(6)")).code).toBe("42501")
    })
  })
})
