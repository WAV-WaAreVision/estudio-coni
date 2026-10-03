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
} from "./db"

afterAll(() => pool.end())

type Cliente = pg.PoolClient

/** A material with its card, written as postgres so the test controls who uploaded it. */
async function material(
  c: Cliente,
  extra: { estado?: string; conFicha?: boolean; subidoPor?: string } = {},
): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.materiales (tipo, categoria_id, texto_pegado, declaracion_sin_pacientes_en, estado, subido_por)
     values ('documento', (select id from public.categorias where slug = 'general'), 'hola', now(), $1, $2) returning id`,
    [extra.estado ?? "listo", extra.subidoPor ?? CONI],
  )
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó el material")
  if (extra.conFicha ?? true) {
    await c.query(
      "insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente) values ($1, 'r', '[]', '[]', '{}')",
      [id],
    )
  }
  return id
}

async function dosMateriales(c: Cliente): Promise<[string, string]> {
  const a = await material(c)
  const b = await material(c)
  return [a, b]
}

async function pedir(c: Cliente, ids: string[]): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select public.pedir_teoria($1::uuid[]) as id", [ids])
  const id = rows[0]?.id
  if (!id) throw new Error("No se creó la teoría")
  return id
}

async function estadoDe(c: Cliente, id: string): Promise<{ estado: string; motivo_fallo: string | null }> {
  const { rows } = await c.query<{ estado: string; motivo_fallo: string | null }>(
    "select estado, motivo_fallo from public.teorias where id = $1",
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error("No existe la teoría")
  return fila
}

const RESULTADO = `update public.teorias set titulo = 'T', tesis = 'Tesis', argumentos = '[]'::jsonb,
  contradicciones = '[]'::jsonb, estado = 'borrador' where id = $1`

describe("pedir_teoria", () => {
  it.each([
    ["Coni", comoConi, CONI],
    ["the maintainer", comoMantenedor, MANTENEDOR],
  ])("lets %s ask for a theory over two sources and leaves it sintetizando", async (_n, sesion, quien) => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, sesion)
      const id = await pedir(c, [a, b])
      const { rows } = await c.query<{ estado: string; creada_por: string; titulo: string | null }>(
        "select estado, creada_por, titulo from public.teorias where id = $1",
        [id],
      )
      expect(rows[0]).toEqual({ estado: "sintetizando", creada_por: quien, titulo: null })
      const fuentes = await c.query("select material_id from public.teoria_fuentes where teoria_id = $1", [id])
      expect(fuentes.rows.map((f) => f.material_id).sort()).toEqual([a, b].sort())
    })
  })

  it("refuses anyone who is not Coni or the maintainer with 42501", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.pedir_teoria($1::uuid[])", [[a, b]])).code).toBe("42501")
    })
  })

  it("does not let members insert theories or sources directly", async () => {
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "insert into public.teorias (estado) values ('sintetizando')")).code).toBe("42501")
    })
  })

  it("rejects fewer than two, more than eight and repeated sources with 22023", async () => {
    await como(comoPostgres, async (c) => {
      const ids: string[] = []
      for (let i = 0; i < 9; i++) ids.push(await material(c))
      await asumir(c, comoConi)
      const [primero] = ids
      expect((await fallaCon(c, "select public.pedir_teoria($1::uuid[])", [[primero]])).code).toBe("22023")
      expect((await fallaCon(c, "select public.pedir_teoria($1::uuid[])", [[primero, primero]])).code).toBe("22023")
      const error = await fallaCon(c, "select public.pedir_teoria($1::uuid[])", [ids])
      expect(error.code).toBe("22023")
      expect(error.message).toBe("teoria_fuentes_invalidas")
      expect((await fallaCon(c, "select public.pedir_teoria(null)")).code).toBe("22023")
    })
  })

  it("accepts exactly eight sources", async () => {
    await como(comoPostgres, async (c) => {
      const ids: string[] = []
      for (let i = 0; i < 8; i++) ids.push(await material(c))
      await asumir(c, comoConi)
      const id = await pedir(c, ids)
      const { rows } = await c.query("select 1 from public.teoria_fuentes where teoria_id = $1", [id])
      expect(rows).toHaveLength(8)
    })
  })

  it("rejects materials that are not listo, have no card or do not exist", async () => {
    await como(comoPostgres, async (c) => {
      const buena = await material(c)
      const procesando = await material(c, { estado: "procesando", conFicha: false })
      const sinFicha = await material(c, { conFicha: false })
      await asumir(c, comoConi)
      expect((await fallaCon(c, "select public.pedir_teoria($1::uuid[])", [[buena, procesando]])).code).toBe("22023")
      expect((await fallaCon(c, "select public.pedir_teoria($1::uuid[])", [[buena, sinFicha]])).code).toBe("22023")
      const fantasma = "d0000000-0000-4000-8000-0000000000ff"
      expect((await fallaCon(c, "select public.pedir_teoria($1::uuid[])", [[buena, fantasma]])).code).toBe("22023")
    })
  })
})

describe("lectura y borrado", () => {
  it("lets Coni and the maintainer read theories and hides them from anyone else", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      await pedir(c, [a, b])
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.teorias")).rowCount).toBe(1)
      expect((await c.query("select 1 from public.teoria_fuentes")).rowCount).toBe(2)
      await asumir(c, comoOtra)
      expect((await c.query("select 1 from public.teorias")).rowCount).toBe(0)
      expect((await c.query("select 1 from public.teoria_fuentes")).rowCount).toBe(0)
    })
  })

  it("lets Coni delete any theory and the maintainer only their own", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const deConi = await pedir(c, [a, b])
      await asumir(c, comoMantenedor)
      const propia = await pedir(c, [a, b])
      expect((await c.query("delete from public.teorias where id = $1", [deConi])).rowCount).toBe(0)
      expect((await c.query("delete from public.teorias where id = $1", [propia])).rowCount).toBe(1)
      await asumir(c, comoConi)
      expect((await c.query("delete from public.teorias where id = $1", [deConi])).rowCount).toBe(1)
      const restantes = await c.query("select 1 from public.teoria_fuentes")
      expect(restantes.rowCount).toBe(0)
    })
  })

  it("drops the source row, not the theory, when a material is deleted", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      await c.query("delete from public.materiales where id = $1", [a])
      expect((await c.query("select 1 from public.teoria_fuentes where teoria_id = $1", [id])).rowCount).toBe(1)
      expect((await c.query("select 1 from public.teorias where id = $1", [id])).rowCount).toBe(1)
    })
  })

  it("records an audit event when a theory is requested", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      await asumir(c, comoPostgres)
      const { rows } = await c.query("select 1 from public.eventos where tabla = 'teorias' and datos ->> 'id' = $1", [
        id,
      ])
      expect(rows).toHaveLength(1)
    })
  })
})

describe("resultado de la síntesis", () => {
  it("lets the service write the result and leaves it borrador", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      await asumir(c, comoServicio)
      await c.query(RESULTADO, [id])
      expect((await estadoDe(c, id)).estado).toBe("borrador")
    })
  })

  it("does not let a member write the synthesis or the state directly", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      expect((await fallaCon(c, "update public.teorias set estado = 'guardada' where id = $1", [id])).code).toBe(
        "42501",
      )
      expect((await fallaCon(c, "update public.teorias set titulo = 'x' where id = $1", [id])).code).toBe("42501")
    })
  })

  it("rejects a state outside the four known", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      await asumir(c, comoServicio)
      const error = await fallaCon(c, "update public.teorias set estado = 'otro' where id = $1", [id])
      expect(error.code).toBe("23514")
    })
  })
})

describe("guardar_teoria", () => {
  async function conBorrador(c: Cliente): Promise<string> {
    const [a, b] = await dosMateriales(c)
    await asumir(c, comoConi)
    const id = await pedir(c, [a, b])
    await asumir(c, comoServicio)
    await c.query(RESULTADO, [id])
    await asumir(c, comoConi)
    return id
  }

  it("saves the edited fields and moves a borrador to guardada", async () => {
    await como(comoPostgres, async (c) => {
      const id = await conBorrador(c)
      await asumir(c, comoMantenedor)
      await c.query("select public.guardar_teoria($1, 'Nuevo título', 'Nueva tesis', null)", [
        id,
      ])
      const { rows } = await c.query<{ titulo: string; tesis: string; estado: string; editada_en: Date | null }>(
        "select titulo, tesis, estado, editada_en from public.teorias where id = $1",
        [id],
      )
      expect(rows[0]).toMatchObject({ titulo: "Nuevo título", tesis: "Nueva tesis", estado: "guardada" })
      expect(rows[0]?.editada_en).not.toBeNull()
    })
  })

  it("keeps the stored arguments and contradictions, which the caller cannot send", async () => {
    await como(comoPostgres, async (c) => {
      const id = await conBorrador(c)
      await asumir(c, comoServicio)
      await c.query(
        "update public.teorias set argumentos = '[{\"materialId\":\"x\"}]'::jsonb, contradicciones = '[]'::jsonb where id = $1",
        [id],
      )
      await asumir(c, comoConi)
      await c.query("select public.guardar_teoria($1, 'Nuevo', 'Tesis', null)", [id])
      const { rows } = await c.query<{ argumentos: unknown }>("select argumentos from public.teorias where id = $1", [id])
      expect(rows[0]?.argumentos).toEqual([{ materialId: "x" }])
      const vieja = await fallaCon(
        c,
        "select public.guardar_teoria($1, 'T', 'Tesis', '[]'::jsonb, '[]'::jsonb, null)",
        [id],
      )
      expect(vieja.code).toBe("42883")
    })
  })

  it("lets a saved theory be edited again", async () => {
    await como(comoPostgres, async (c) => {
      const id = await conBorrador(c)
      await c.query("select public.guardar_teoria($1, 'Uno', 'Tesis', null)", [id])
      await c.query("select public.guardar_teoria($1, 'Dos', 'Tesis', null)", [id])
      const { rows } = await c.query<{ titulo: string }>("select titulo from public.teorias where id = $1", [id])
      expect(rows[0]?.titulo).toBe("Dos")
    })
  })

  it("refuses a theory that is still sintetizando or fallida with 22023", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      const error = await fallaCon(
        c,
        "select public.guardar_teoria($1, 'T', 'Tesis', null)",
        [id],
      )
      expect(error.code).toBe("22023")
      expect(error.message).toBe("teoria_no_editable")
    })
  })

  it("refuses an empty title or thesis, a stranger and a missing theory", async () => {
    await como(comoPostgres, async (c) => {
      const id = await conBorrador(c)
      expect(
        (await fallaCon(c, "select public.guardar_teoria($1, '  ', 'Tesis', null)", [id]))
          .code,
      ).toBe("22023")
      expect(
        (await fallaCon(c, "select public.guardar_teoria($1, 'T', '', null)", [id])).code,
      ).toBe("22023")
      expect(
        (
          await fallaCon(
            c,
            "select public.guardar_teoria('d0000000-0000-4000-8000-0000000000ff', 'T', 'x', null)",
          )
        ).code,
      ).toBe("P0002")
      await asumir(c, comoOtra)
      expect(
        (await fallaCon(c, "select public.guardar_teoria($1, 'T', 'x', null)", [id])).code,
      ).toBe("42501")
    })
  })
})

describe("fallo y reintento", () => {
  async function fallida(c: Cliente, codigo: string | null): Promise<string> {
    const [a, b] = await dosMateriales(c)
    await asumir(c, comoConi)
    const id = await pedir(c, [a, b])
    await asumir(c, comoServicio)
    await c.query(
      "update public.teorias set estado = 'fallida', motivo_fallo = 'Motivo.', motivo_codigo = $2 where id = $1",
      [id, codigo],
    )
    await asumir(c, comoConi)
    return id
  }

  it("refuses to retry a theory the cards cannot back, with teoria_sin_sustento", async () => {
    await como(comoPostgres, async (c) => {
      const id = await fallida(c, "sin_sustento")
      const error = await fallaCon(c, "select public.reintentar_teoria($1)", [id])
      expect(error.code).toBe("22023")
      expect(error.message).toBe("teoria_sin_sustento")
      expect((await estadoDe(c, id)).estado).toBe("fallida")
    })
  })

  it.each(["tope", "error", null])("lets a theory that failed for %s be retried and forgets the code", async (codigo) => {
    await como(comoPostgres, async (c) => {
      const id = await fallida(c, codigo)
      await c.query("select public.reintentar_teoria($1)", [id])
      const { rows } = await c.query("select estado, motivo_codigo from public.teorias where id = $1", [id])
      expect(rows[0]).toEqual({ estado: "sintetizando", motivo_codigo: null })
    })
  })

  it("marks a failed dispatch with the code error", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      await c.query("select public.marcar_teoria_disparo_fallido($1)", [id])
      const { rows } = await c.query("select motivo_codigo from public.teorias where id = $1", [id])
      expect(rows[0]).toEqual({ motivo_codigo: "error" })
    })
  })

  it("marks a theory whose dispatch failed as fallida, with a reason Coni can read", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      await c.query("select public.marcar_teoria_disparo_fallido($1)", [id])
      expect(await estadoDe(c, id)).toEqual({
        estado: "fallida",
        motivo_fallo: "No pude iniciar la síntesis. Reintenta.",
      })
    })
  })

  it("does not touch a theory that already has a result", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      await asumir(c, comoServicio)
      await c.query(RESULTADO, [id])
      await asumir(c, comoConi)
      await c.query("select public.marcar_teoria_disparo_fallido($1)", [id])
      expect((await estadoDe(c, id)).estado).toBe("borrador")
    })
  })

  it("puts a fallida theory back to sintetizando and refuses any other", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      expect((await fallaCon(c, "select public.reintentar_teoria($1)", [id])).code).toBe("22023")
      await c.query("select public.marcar_teoria_disparo_fallido($1)", [id])
      await c.query("select public.reintentar_teoria($1)", [id])
      expect(await estadoDe(c, id)).toEqual({ estado: "sintetizando", motivo_fallo: null })
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.reintentar_teoria($1)", [id])).code).toBe("42501")
    })
  })

  it("requires a reason for a fallida theory", async () => {
    await como(comoPostgres, async (c) => {
      const [a, b] = await dosMateriales(c)
      await asumir(c, comoConi)
      const id = await pedir(c, [a, b])
      await asumir(c, comoServicio)
      const error = await fallaCon(c, "update public.teorias set estado = 'fallida' where id = $1", [id])
      expect(error.code).toBe("23514")
    })
  })
})
