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
  MANTENEDOR,
  pool,
  type Sesion,
} from "./db"

afterAll(() => pool.end())

type Cliente = pg.PoolClient

/** Rows are written as the owner (members cannot insert authors), then the test goes back to `sesion`. */
async function comoDueno<T>(c: Cliente, sesion: Sesion, fn: () => Promise<T>): Promise<T> {
  await asumir(c, comoPostgres)
  const resultado = await fn()
  await asumir(c, sesion)
  return resultado
}

async function uno(c: Cliente, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó: ${sql.slice(0, 60)}`)
  return id
}

const autor = (c: Cliente, nombre: string) =>
  uno(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [nombre])

const material = (c: Cliente, autorId: string, subidoPor = CONI) =>
  uno(
    c,
    `insert into public.materiales (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('Borrable', 'documento', $1, 'referente', 'hola', now(), $2) returning id`,
    [autorId, subidoPor],
  )

const marcar = (c: Cliente, tabla: "materiales" | "autores", id: string, hace = "0 seconds") =>
  c.query(`update public.${tabla} set borrar_desde = now() - $2::interval where id = $1`, [id, hace])

describe("the views of what is not marked", () => {
  it("hide a marked material and a marked author from Coni, and show nothing to anyone else", async () => {
    await como(comoConi, async (c) => {
      const [visible, marcado, autorMarcado] = await comoDueno(c, comoConi, async () => {
        const a = await autor(c, "Autora de las vistas")
        const otro = await autor(c, "Autor marcado de las vistas")
        const m1 = await material(c, a)
        const m2 = await material(c, a)
        await marcar(c, "materiales", m2)
        await marcar(c, "autores", otro)
        return [m1, m2, otro]
      })
      const materiales = await c.query<{ id: string }>("select id from public.materiales_visibles where id = any($1)", [
        [visible, marcado],
      ])
      expect(materiales.rows.map((fila) => fila.id)).toEqual([visible])
      const autores = await c.query("select 1 from public.autores_visibles where id = $1", [autorMarcado])
      expect(autores.rowCount).toBe(0)
      // The base table still holds both: only maintenance deletes for real.
      const base = await c.query("select 1 from public.materiales where id = any($1)", [[visible, marcado]])
      expect(base.rowCount).toBe(2)
    })
    await como(comoOtra, async (c) => {
      expect((await c.query("select 1 from public.materiales_visibles")).rowCount).toBe(0)
      expect((await c.query("select 1 from public.autores_visibles")).rowCount).toBe(0)
    })
  })

  it("index the marked rows for the maintenance sweep", async () => {
    const { rows } = await pool.query<{ indexname: string }>(
      "select indexname from pg_indexes where indexname in ('materiales_por_borrar', 'autores_por_borrar') order by 1",
    )
    expect(rows.map((fila) => fila.indexname)).toEqual(["autores_por_borrar", "materiales_por_borrar"])
  })
})

const marcaDe = async (c: Cliente, tabla: "materiales" | "autores", id: string) =>
  (
    await c.query<{ marcado: boolean }>(
      `select borrar_desde is not null as marcado from public.${tabla} where id = $1`,
      [id],
    )
  ).rows[0]?.marcado

describe("marcar_material_para_borrar", () => {
  it("lets Coni mark any material and unmark it again", async () => {
    await como(comoConi, async (c) => {
      const id = await comoDueno(c, comoConi, async () => material(c, await autor(c, "Autora de Coni"), MANTENEDOR))
      await c.query("select public.marcar_material_para_borrar($1, true)", [id])
      expect(await marcaDe(c, "materiales", id)).toBe(true)
      await c.query("select public.marcar_material_para_borrar($1, false)", [id])
      expect(await marcaDe(c, "materiales", id)).toBe(false)
    })
  })

  it("lets the maintainer mark only what the maintainer uploaded", async () => {
    await como(comoMantenedor, async (c) => {
      const [suyo, deConi] = await comoDueno(c, comoMantenedor, async () => {
        const a = await autor(c, "Autora del mantenedor")
        return [await material(c, a, MANTENEDOR), await material(c, a, CONI)]
      })
      await c.query("select public.marcar_material_para_borrar($1, true)", [suyo])
      expect(await marcaDe(c, "materiales", suyo)).toBe(true)
      const ajeno = await fallaCon(c, "select public.marcar_material_para_borrar($1, true)", [deConi])
      expect([ajeno.code, ajeno.message]).toEqual(["22023", "no_se_pudo_marcar"])
    })
  })

  it("refuses anyone who is not Coni or the maintainer", async () => {
    await como(comoOtra, async (c) => {
      const id = await comoDueno(c, comoOtra, async () => material(c, await autor(c, "Autora ajena")))
      const error = await fallaCon(c, "select public.marcar_material_para_borrar($1, true)", [id])
      expect([error.code, error.message]).toEqual(["42501", "sin_permiso"])
    })
  })

  it("says no_se_pudo_marcar for a second mark, an unmark of a visible row and a missing row", async () => {
    await como(comoConi, async (c) => {
      const id = await comoDueno(c, comoConi, async () => material(c, await autor(c, "Autora repetida")))
      const visible = await fallaCon(c, "select public.marcar_material_para_borrar($1, false)", [id])
      expect(visible.message).toBe("no_se_pudo_marcar")
      await c.query("select public.marcar_material_para_borrar($1, true)", [id])
      const segunda = await fallaCon(c, "select public.marcar_material_para_borrar($1, true)", [id])
      expect(segunda.message).toBe("no_se_pudo_marcar")
      const falta = await fallaCon(c, "select public.marcar_material_para_borrar($1, true)", [
        "00000000-0000-4000-8000-000000000000",
      ])
      expect([falta.code, falta.message]).toEqual(["22023", "no_se_pudo_marcar"])
    })
  })

  it("is not callable by anon and is callable by authenticated", async () => {
    const { rows } = await pool.query<{ anon: boolean; autenticado: boolean }>(
      `select has_function_privilege('anon', 'public.marcar_material_para_borrar(uuid, boolean)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.marcar_material_para_borrar(uuid, boolean)', 'execute') as autenticado`,
    )
    expect(rows[0]).toEqual({ anon: false, autenticado: true })
  })
})

const idea = (c: Cliente, materialId: string, autorId: string, temaId: string | null, evidencia = "estudio") =>
  uno(
    c,
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id)
     values ($1, $2, 0, '{"pagina":1}'::jsonb, 'Una idea', 'cita', 'dato', $4, $3) returning id`,
    [materialId, autorId, temaId, evidencia],
  )

describe("marcar_autor_para_borrar", () => {
  it("marks and unmarks an author with nothing live", async () => {
    await como(comoConi, async (c) => {
      const id = await comoDueno(c, comoConi, () => autor(c, "Autor vacío"))
      await c.query("select public.marcar_autor_para_borrar($1, true)", [id])
      expect(await marcaDe(c, "autores", id)).toBe(true)
      await c.query("select public.marcar_autor_para_borrar($1, false)", [id])
      expect(await marcaDe(c, "autores", id)).toBe(false)
    })
  })

  it("never marks Coni's own card", async () => {
    await como(comoConi, async (c) => {
      const { rows } = await c.query<{ id: string }>("select id from public.autores where tipo = 'coni'")
      const error = await fallaCon(c, "select public.marcar_autor_para_borrar($1, true)", [rows[0]?.id])
      expect([error.code, error.message]).toEqual(["22023", "autor_coni_protegido"])
    })
  })

  it("refuses an author with a live material or a live idea, and allows it once they are marked", async () => {
    await como(comoConi, async (c) => {
      const [conMaterial, conIdea, materialPropio, materialAjeno] = await comoDueno(c, comoConi, async () => {
        const a = await autor(c, "Autor con material")
        const b = await autor(c, "Autor con idea")
        const otro = await autor(c, "Autor del material ajeno")
        const propio = await material(c, a)
        const ajeno = await material(c, otro)
        await idea(c, ajeno, b, null)
        return [a, b, propio, ajeno]
      })
      for (const id of [conMaterial, conIdea]) {
        const error = await fallaCon(c, "select public.marcar_autor_para_borrar($1, true)", [id])
        expect([error.code, error.message]).toEqual(["22023", "autor_con_materiales"])
      }
      await c.query("select public.marcar_material_para_borrar($1, true)", [materialPropio])
      await c.query("select public.marcar_material_para_borrar($1, true)", [materialAjeno])
      await c.query("select public.marcar_autor_para_borrar($1, true)", [conMaterial])
      await c.query("select public.marcar_autor_para_borrar($1, true)", [conIdea])
      expect(await marcaDe(c, "autores", conMaterial)).toBe(true)
      expect(await marcaDe(c, "autores", conIdea)).toBe(true)
    })
  })

  it("refuses anyone who is not Coni or the maintainer, and says no_se_pudo_marcar for a missing author", async () => {
    await como(comoOtra, async (c) => {
      const error = await fallaCon(c, "select public.marcar_autor_para_borrar($1, true)", [
        "00000000-0000-4000-8000-000000000000",
      ])
      expect([error.code, error.message]).toEqual(["42501", "sin_permiso"])
    })
    await como(comoMantenedor, async (c) => {
      const error = await fallaCon(c, "select public.marcar_autor_para_borrar($1, true)", [
        "00000000-0000-4000-8000-000000000000",
      ])
      expect([error.code, error.message]).toEqual(["22023", "no_se_pudo_marcar"])
    })
  })
})

describe("borrar_lo_marcado", () => {
  it("deletes only what was marked before the cut, with its ideas, and returns the deleted materials", async () => {
    await como(comoServicio, async (c) => {
      const { viejo, reciente, vivo, ideaVieja } = await comoDueno(c, comoServicio, async () => {
        const a = await autor(c, "Autora del barrido")
        const m1 = await material(c, a)
        const m2 = await material(c, a)
        const m3 = await material(c, a)
        const i = await idea(c, m1, a, null)
        await marcar(c, "materiales", m1, "10 minutes")
        await marcar(c, "materiales", m2, "10 seconds")
        return { viejo: m1, reciente: m2, vivo: m3, ideaVieja: i }
      })
      const { rows } = await c.query<{ borrados: string[] }>(
        "select public.borrar_lo_marcado(now() - interval '1 minute') as borrados",
      )
      expect(rows[0]?.borrados).toContain(viejo)
      expect(rows[0]?.borrados).not.toContain(reciente)
      await asumir(c, comoPostgres)
      const quedan = await c.query<{ id: string }>("select id from public.materiales where id = any($1) order by id", [
        [viejo, reciente, vivo],
      ])
      expect(quedan.rows.map((fila) => fila.id).sort()).toEqual([reciente, vivo].sort())
      expect((await c.query("select 1 from public.afirmaciones where id = $1", [ideaVieja])).rowCount).toBe(0)
    })
  })

  it("deletes a marked author nothing points at, keeps one still referenced, and never Coni's", async () => {
    await como(comoServicio, async (c) => {
      const { suelto, referido } = await comoDueno(c, comoServicio, async () => {
        const s = await autor(c, "Autor suelto")
        const r = await autor(c, "Autor todavía citado")
        await material(c, r)
        await marcar(c, "autores", s, "10 minutes")
        // Only as the owner: the function refuses this mark, the sweep must still be safe if one exists.
        await marcar(c, "autores", r, "10 minutes")
        await c.query("update public.autores set borrar_desde = now() - interval '10 minutes' where tipo = 'coni'")
        return { suelto: s, referido: r }
      })
      await c.query("select public.borrar_lo_marcado(now() - interval '1 minute')")
      await asumir(c, comoPostgres)
      expect((await c.query("select 1 from public.autores where id = $1", [suelto])).rowCount).toBe(0)
      expect((await c.query("select 1 from public.autores where id = $1", [referido])).rowCount).toBe(1)
      expect((await c.query("select 1 from public.autores where tipo = 'coni'")).rowCount).toBe(1)
    })
  })

  it("writes how many materials and authors it deleted in the deletion log, and nothing when it deleted nothing", async () => {
    await como(comoServicio, async (c) => {
      await comoDueno(c, comoServicio, async () => {
        const a = await autor(c, "Autora del registro")
        const s = await autor(c, "Autor del registro")
        const m = await material(c, a)
        await marcar(c, "materiales", m, "10 minutes")
        await marcar(c, "autores", s, "10 minutes")
      })
      await asumir(c, comoPostgres)
      const antes = await c.query<{ regla: string; cantidad: number }>(
        "select regla, cantidad from public.registro_de_borrados where borrado_en = now()",
      )
      expect(antes.rowCount).toBe(0)
      await asumir(c, comoServicio)
      await c.query("select public.borrar_lo_marcado(now() - interval '1 minute')")
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ regla: string; cantidad: number }>(
        "select regla, cantidad from public.registro_de_borrados where borrado_en = now() order by regla",
      )
      expect(rows.map((fila) => fila.regla)).toEqual(["autores_de_biblioteca", "materiales_de_biblioteca"])
      expect(rows.every((fila) => fila.cantidad >= 1)).toBe(true)
      await asumir(c, comoServicio)
      await c.query("select public.borrar_lo_marcado(now() - interval '1 minute')")
      await asumir(c, comoPostgres)
      const despues = await c.query("select 1 from public.registro_de_borrados where borrado_en = now()")
      expect(despues.rowCount).toBe(2)
    })
  })

  it("runs only as service_role", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.borrar_lo_marcado(now())")
      expect(error.code).toBe("42501")
    })
  })
})

const tema = (c: Cliente, nombre: string) =>
  uno(
    c,
    `insert into public.temas (nombre, centroide)
     values ($1, (select array_agg(0.1)::extensions.vector from generate_series(1, 1024))) returning id`,
    [nombre],
  )

describe("temas_resumen", () => {
  it("counts neither the ideas, the authors nor the evidence of a marked material", async () => {
    await como(comoConi, async (c) => {
      const { temaId, marcado } = await comoDueno(c, comoConi, async () => {
        const a = await autor(c, "Autora del tema")
        const b = await autor(c, "Autor marcado del tema")
        const t = await tema(c, "Tema del resumen")
        const vivo = await material(c, a)
        const otro = await material(c, b)
        await idea(c, vivo, a, t, "estudio")
        await idea(c, otro, b, t, "clinica")
        await idea(c, otro, b, t, "clinica")
        return { temaId: t, marcado: otro }
      })
      const leer = async () =>
        (
          await c.query<{ afirmaciones: number; autores: number; evidencia: Record<string, number> }>(
            "select afirmaciones, autores, evidencia from public.temas_resumen where id = $1",
            [temaId],
          )
        ).rows[0]
      expect(await leer()).toEqual({ afirmaciones: 3, autores: 2, evidencia: { estudio: 1, clinica: 2 } })
      await c.query("select public.marcar_material_para_borrar($1, true)", [marcado])
      expect(await leer()).toEqual({ afirmaciones: 1, autores: 1, evidencia: { estudio: 1 } })
    })
  })
})
