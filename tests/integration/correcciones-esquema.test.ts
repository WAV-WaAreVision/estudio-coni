import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

async function uno(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó: ${sql.slice(0, 60)}`)
  return id
}

/** As postgres, inside the test's transaction: one claim and one log row about it. */
async function sembrar(c: pg.PoolClient): Promise<{ afirmacion: string; correccion: string }> {
  const sufijo = randomUUID().slice(0, 8)
  const autor = await uno(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [
    `Autora registro ${sufijo}`,
  ])
  const material = await uno(
    c,
    `insert into public.materiales (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado)
     values ($1, 'documento', $2, 'referente', 'texto', now(), $3, 'listo') returning id`,
    [`Material registro ${sufijo}`, autor, CONI],
  )
  const afirmacion = await uno(
    c,
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
     values ($1, $2, 0, '{"pagina":1}'::jsonb, 'Una idea', 'cita', 'dato', 'estudio') returning id`,
    [material, autor],
  )
  const correccion = await uno(
    c,
    `insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues, version_id)
     select $1, 'tipo', 'todas', 'corrige', 'dato', 'consejo', id
       from public.versiones_de_vocabulario where lista = 'tipo' and estado = 'vigente'
     returning id`,
    [afirmacion],
  )
  return { afirmacion, correccion }
}

const filasDe = async (c: pg.PoolClient, afirmacion: string) =>
  (await c.query("select id from public.correcciones_de_etiqueta where afirmacion_id = $1", [afirmacion])).rowCount

describe("correcciones_de_etiqueta", () => {
  it("lets Coni and WAV read the log, and nobody else", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      expect(await filasDe(c, e.afirmacion)).toBe(1)
      await asumir(c, comoMantenedor)
      expect(await filasDe(c, e.afirmacion)).toBe(1)
      await asumir(c, comoOtra)
      expect(await filasDe(c, e.afirmacion)).toBe(0)
    })
  })

  it("takes no direct write from a session, not even Coni's", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      const insertar = await fallaCon(
        c,
        `insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues)
         values ($1, 'tipo', 'todas', 'confirma', 'dato', 'dato')`,
        [e.afirmacion],
      )
      expect(insertar.code).toBe("42501")
      const cambiar = await fallaCon(c, "update public.correcciones_de_etiqueta set despues = 'mito' where id = $1", [
        e.correccion,
      ])
      expect(cambiar.code).toBe("42501")
      const borrar = await fallaCon(c, "delete from public.correcciones_de_etiqueta where id = $1", [e.correccion])
      expect(borrar.code).toBe("42501")
    })
  })

  it("goes away with its claim", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query("delete from public.afirmaciones where id = $1", [e.afirmacion])
      expect(await filasDe(c, e.afirmacion)).toBe(0)
    })
  })

  it("refuses a row whose before and after do not fit its action", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      const fila = (accion: string, antes: string | null, despues: string | null, campo = "tipo") =>
        fallaCon(
          c,
          `insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues)
           values ($1, $2, 'todas', $3, $4, $5)`,
          [e.afirmacion, campo, accion, antes, despues],
        )
      expect((await fila("agrega", "dato", "mito")).code).toBe("23514")
      expect((await fila("quita", "dato", "mito")).code).toBe("23514")
      expect((await fila("confirma", "dato", "mito")).code).toBe("23514")
      expect((await fila("corrige", "dato", "mito", "titulo")).code).toBe("23514")
    })
  })

  it("asks a reason of an otro or otra after, outside dato and caso", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      const sinMotivo = await fallaCon(
        c,
        `insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues)
         values ($1, 'emocion', 'linkedin', 'corrige', 'calma', 'otra')`,
        [e.afirmacion],
      )
      expect(sinMotivo.code).toBe("23514")
      await c.query(
        `insert into public.correcciones_de_etiqueta (afirmacion_id, campo, red, accion, antes, despues)
         values ($1, 'dato', 'todas', 'corrige', 'otro', 'otro')`,
        [e.afirmacion],
      )
    })
  })

  it("has the index the monthly report reads (6c-3)", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname = 'public' and tablename = 'correcciones_de_etiqueta'",
    )
    expect(rows.map((fila) => fila.indexdef).join("\n")).toContain("(campo, accion, creada_en)")
  })
})
