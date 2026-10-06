import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { crearPieza } from "./flujo"

afterAll(() => pool.end())

const CLAVE = "clave-borrador"
const REAL_USD = 0.0509
const REVISION = [{ regla: "cierre", tipo: "aviso", mensaje: "Falta la frase de cierre." }]

const GUARDAR = `select id::text as id, version, guion, texto, revision
  from public.guardar_borrador($1, $2, 'Guion nuevo', 'Texto nuevo', $3::jsonb, $4, $5)`

function argumentos(id: string, version = 1, clave = CLAVE): unknown[] {
  return [id, version, JSON.stringify(REVISION), clave, REAL_USD]
}

/** A piece waiting for its script (version 1) and the Claude spend reserved for it, as a task would leave them. */
async function piezaConGastoReservado(c: pg.PoolClient): Promise<string> {
  const id = await crearPieza(c)
  await c.query("update public.piezas set estado = 'guion_en_proceso', version = 1 where id = $1", [id])
  await asumir(c, comoServicio)
  await c.query("select public.reservar_gasto($1, 'anthropic', 'guion', 0.5, $2)", [id, CLAVE])
  return id
}

async function estadoDelGasto(c: pg.PoolClient): Promise<{ estado: string; real: number | null } | undefined> {
  const { rows } = await c.query<{ estado: string; real: number | null }>(
    "select estado, real_usd::float8 as real from public.gastos where clave = $1",
    [CLAVE],
  )
  return rows[0]
}

async function borradorDeLaPieza(c: pg.PoolClient, id: string) {
  const { rows } = await c.query<{ version: number; guion: string | null; texto: string | null; revision: unknown }>(
    "select version, guion, texto, revision from public.piezas where id = $1",
    [id],
  )
  return rows[0]
}

describe("guardar_borrador y el texto para LinkedIn", () => {
  const CON_LINKEDIN = `select texto_linkedin from public.guardar_borrador($1, $2, 'Guion nuevo', 'Texto nuevo', $3::jsonb, $4, $5, null, $6)`

  it("saves the LinkedIn text together with the draft", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)

      const { rows } = await c.query(CON_LINKEDIN, [...argumentos(id), "Para colegas."])

      expect(rows[0]).toEqual({ texto_linkedin: "Para colegas." })
      expect((await c.query("select texto_linkedin from public.piezas where id = $1", [id])).rows[0]).toEqual({
        texto_linkedin: "Para colegas.",
      })
    })
  })

  it("still accepts the arguments of a worker from before LinkedIn and leaves the LinkedIn text empty", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)
      await c.query(
        "update public.piezas set texto_linkedin = 'De un borrador anterior', version = version + 1 where id = $1",
        [id],
      )

      const { rows } = await c.query(GUARDAR, argumentos(id, 2))

      expect(rows[0]?.version).toBe(3)
      expect((await c.query("select texto_linkedin from public.piezas where id = $1", [id])).rows[0]).toEqual({
        texto_linkedin: null,
      })
    })
  })

  it("replaces the LinkedIn text of an earlier draft when a new round writes another one", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)
      await c.query("update public.piezas set texto_linkedin = 'Anterior', version = version + 1 where id = $1", [id])

      await c.query(CON_LINKEDIN, [id, 2, JSON.stringify(REVISION), CLAVE, REAL_USD, "Nuevo"])

      expect((await c.query("select texto_linkedin from public.piezas where id = $1", [id])).rows[0]).toEqual({
        texto_linkedin: "Nuevo",
      })
    })
  })
})

describe("guardar_borrador", () => {
  it("saves the draft, bumps the version and confirms the spend with its real cost, together", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)

      const { rows } = await c.query(GUARDAR, argumentos(id))

      expect(rows[0]).toEqual({
        id,
        version: 2,
        guion: "Guion nuevo",
        texto: "Texto nuevo",
        revision: REVISION,
      })
      expect(await borradorDeLaPieza(c, id)).toMatchObject({ version: 2, guion: "Guion nuevo", revision: REVISION })
      expect(await estadoDelGasto(c)).toEqual({ estado: "confirmado", real: REAL_USD })
    })
  })

  it("fails with version_desfasada and leaves the spend reserved when the piece changed", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)

      const err = await fallaCon(c, GUARDAR, argumentos(id, 0))

      expect(err.code).toBe("PT409")
      expect(err.message).toBe("version_desfasada")
      expect(await estadoDelGasto(c)).toEqual({ estado: "reservado", real: null })
      expect(await borradorDeLaPieza(c, id)).toMatchObject({ version: 1, guion: null, texto: null })
    })
  })

  it("fails with gasto_no_reservado and leaves the piece untouched when the spend was already confirmed", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)
      await c.query("select public.confirmar_gasto($1, 0.01)", [CLAVE])

      const err = await fallaCon(c, GUARDAR, argumentos(id))

      expect(err.code).toBe("P0001")
      expect(err.message).toBe("gasto_no_reservado")
      expect(await estadoDelGasto(c)).toEqual({ estado: "confirmado", real: 0.01 })
      expect(await borradorDeLaPieza(c, id)).toMatchObject({ version: 1, guion: null, texto: null })
    })
  })

  it("fails with gasto_no_reservado and leaves the piece untouched when there is no spend with that key", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)

      const err = await fallaCon(c, GUARDAR, argumentos(id, 1, "otra-clave"))

      expect(err.message).toBe("gasto_no_reservado")
      expect(await estadoDelGasto(c)).toEqual({ estado: "reservado", real: null })
      expect(await borradorDeLaPieza(c, id)).toMatchObject({ version: 1, guion: null, texto: null })
    })
  })

  it("rejects Coni and the maintainer: only the service role can save a draft", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)

      await asumir(c, comoConi)
      expect((await fallaCon(c, GUARDAR, argumentos(id))).code).toBe("42501")
      await asumir(c, comoMantenedor)
      expect((await fallaCon(c, GUARDAR, argumentos(id))).code).toBe("42501")
    })
  })

  it("rejects a caller with no session", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)

      await asumir(c, comoPostgres)
      await c.query("set local role anon")
      expect((await fallaCon(c, GUARDAR, argumentos(id))).code).toBe("42501")
    })
  })
})

const RESPALDO = { teoria: { id: "t", titulo: "T", tesis: "Te", porQue: "P" }, afirmaciones: [] }
const GUARDAR_CON_RESPALDO = `select respaldo
  from public.guardar_borrador($1, $2, 'Guion nuevo', 'Texto nuevo', $3::jsonb, $4, $5, $6::jsonb)`

describe("guardar_borrador con respaldo", () => {
  it("stores the backing with the draft, in the same transaction", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)
      const { rows } = await c.query(GUARDAR_CON_RESPALDO, [...argumentos(id), JSON.stringify(RESPALDO)])
      expect(rows[0]).toEqual({ respaldo: RESPALDO })
    })
  })

  it("leaves the backing empty when the caller sends none, as the worker deployed before C3 does", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)
      await c.query(GUARDAR, argumentos(id))
      const { rows } = await c.query("select respaldo from public.piezas where id = $1", [id])
      expect(rows[0]).toEqual({ respaldo: null })
    })
  })

  it("writes no backing when the spend was not reserved", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)
      await c.query("select public.confirmar_gasto($1, 0.01)", [CLAVE])
      const err = await fallaCon(c, GUARDAR_CON_RESPALDO, [...argumentos(id), JSON.stringify(RESPALDO)])
      expect(err.message).toBe("gasto_no_reservado")
      const { rows } = await c.query("select respaldo from public.piezas where id = $1", [id])
      expect(rows[0]).toEqual({ respaldo: null })
    })
  })
})

describe("piezas.respaldo", () => {
  it("cannot be changed by Coni's session, only by the tasks", async () => {
    await como(comoPostgres, async (c) => {
      const id = await piezaConGastoReservado(c)
      await c.query(GUARDAR_CON_RESPALDO, [...argumentos(id), JSON.stringify(RESPALDO)])
      await asumir(c, comoConi)
      const error = await fallaCon(
        c,
        "update public.piezas set respaldo = '{}'::jsonb, version = version + 1 where id = $1",
        [id],
      )
      expect(error.message).toBe("respaldo_solo_de_tareas")
    })
  })
})
