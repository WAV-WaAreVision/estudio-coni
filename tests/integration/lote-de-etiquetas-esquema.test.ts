import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"
import { aislar, base, idea, marca, SEMANA, uno } from "./lote-de-etiquetas-comun"

afterAll(() => pool.end())

const ITEM = `insert into public.lote_de_etiquetas_items (lote_id, posicion, afirmacion_id, campo, red, marca_id, motivo)
              values ($1, $2, $3, $4, $5, $6, $7)`

/** As postgres: last week's batch with one item, a tipo still sin_clasificar. */
async function sembrar(c: pg.PoolClient): Promise<{ lote: string; afirmacion: string }> {
  await aislar(c)
  const b = await base(c)
  const afirmacion = await idea(c, b, { tipo: "sin_clasificar" })
  const lote = await uno(c, `insert into public.lotes_de_etiquetas (semana) values (${SEMANA} - 7) returning id`)
  await c.query(ITEM, [lote, 1, afirmacion, "tipo", "todas", null, "sin_clasificar"])
  return { lote, afirmacion }
}

describe("lotes_de_etiquetas and lote_de_etiquetas_items", () => {
  it("let Coni and WAV read a batch, and nobody else", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      const filas = async () => [
        (await c.query("select id from public.lotes_de_etiquetas where id = $1", [e.lote])).rowCount,
        (await c.query("select posicion from public.lote_de_etiquetas_items where lote_id = $1", [e.lote])).rowCount,
      ]
      await asumir(c, comoConi)
      expect(await filas()).toEqual([1, 1])
      await asumir(c, comoMantenedor)
      expect(await filas()).toEqual([1, 1])
      await asumir(c, comoOtra)
      expect(await filas()).toEqual([0, 0])
    })
  })

  it("take no direct write from a session, not even Coni's, and keep the helpers private", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      const nuevo = await fallaCon(c, `insert into public.lotes_de_etiquetas (semana) values (${SEMANA} - 21)`)
      expect(nuevo.code).toBe("42501")
      const item = await fallaCon(c, ITEM, [e.lote, 2, e.afirmacion, "evidencia", "todas", null, "sin_clasificar"])
      expect(item.code).toBe("42501")
      const borrar = await fallaCon(c, "delete from public.lotes_de_etiquetas where id = $1", [e.lote])
      expect(borrar.code).toBe("42501")
      expect((await fallaCon(c, "select * from public.etiquetas_dudosas()")).code).toBe("42501")
      const llenar = await fallaCon(c, `select public.llenar_lote_de_etiquetas($1::uuid, ${SEMANA})`, [e.lote])
      expect(llenar.code).toBe("42501")
    })
  })

  it("refuses a sixth position and a second item of the same claim in one batch", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      const b = await base(c)
      const otra = await idea(c, b, { evidencia: "sin_clasificar" })
      expect((await fallaCon(c, ITEM, [e.lote, 6, otra, "evidencia", "todas", null, "sin_clasificar"])).code).toBe(
        "23514",
      )
      expect(
        (await fallaCon(c, ITEM, [e.lote, 2, e.afirmacion, "evidencia", "todas", null, "sin_clasificar"])).code,
      ).toBe("23505")
    })
  })

  it("loses an item with its claim, and keeps a removed mark's item with no mark", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      const b = await base(c)
      const conMarca = await idea(c, b)
      const emocion = await marca(c, conMarca, {
        marca: "emocion",
        red: "linkedin",
        valor: "escepticismo",
        certeza: "baja",
      })
      await c.query(ITEM, [e.lote, 2, conMarca, "emocion", "linkedin", emocion, "certeza_baja"])
      await c.query("delete from public.afirmacion_marcas where id = $1", [emocion])
      const quedan = await c.query<{ posicion: number; marca_id: string | null }>(
        "select posicion, marca_id from public.lote_de_etiquetas_items where lote_id = $1 order by posicion",
        [e.lote],
      )
      expect(quedan.rows).toEqual([
        { posicion: 1, marca_id: null },
        { posicion: 2, marca_id: null },
      ])
      await c.query("delete from public.afirmaciones where id = $1", [e.afirmacion])
      const despues = await c.query("select posicion from public.lote_de_etiquetas_items where lote_id = $1", [e.lote])
      expect(despues.rows).toEqual([{ posicion: 2 }])
    })
  })
})

describe("marca_id in correcciones_de_etiqueta", () => {
  it("is the mark's row for the three functions (kept after a removal) and null for tipo", async () => {
    await como(comoPostgres, async (c) => {
      const b = await base(c)
      const a = await idea(c, b)
      const emocion = await marca(c, a, { marca: "emocion", red: "linkedin", valor: "escepticismo", certeza: "baja" })
      const problema = await marca(c, a, { marca: "problema", red: "linkedin", valor: "otro", porQue: "Soledad" })
      await asumir(c, comoConi)
      await c.query("select public.confirmar_etiqueta($1::uuid, 'emocion', 'linkedin', $2::uuid)", [a, emocion])
      await c.query(
        "select public.corregir_etiqueta($1::uuid, 'emocion', 'linkedin', 'curiosidad', null, null, $2::uuid)",
        [a, emocion],
      )
      await c.query("select public.corregir_etiqueta($1::uuid, 'emocion', 'instagram', 'curiosidad')", [a])
      await c.query("select public.quitar_marca($1::uuid, 'problema', 'linkedin', $2::uuid)", [a, problema])
      await c.query("select public.corregir_etiqueta($1::uuid, 'tipo', 'todas', 'mito')", [a])
      await asumir(c, comoPostgres)
      const agregada = await uno(
        c,
        "select id from public.afirmacion_marcas where afirmacion_id = $1 and marca = 'emocion' and red = 'instagram'",
        [a],
      )
      const { rows } = await c.query(
        `select campo, red, accion, marca_id from public.correcciones_de_etiqueta
          where afirmacion_id = $1 order by campo, red, accion`,
        [a],
      )
      expect(rows).toEqual([
        { campo: "emocion", red: "instagram", accion: "agrega", marca_id: agregada },
        { campo: "emocion", red: "linkedin", accion: "confirma", marca_id: emocion },
        { campo: "emocion", red: "linkedin", accion: "corrige", marca_id: emocion },
        { campo: "problema", red: "linkedin", accion: "quita", marca_id: problema },
        { campo: "tipo", red: "todas", accion: "corrige", marca_id: null },
      ])
    })
  })
})
