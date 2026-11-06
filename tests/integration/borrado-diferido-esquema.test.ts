import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoOtra, comoPostgres, pool, type Sesion } from "./db"

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
