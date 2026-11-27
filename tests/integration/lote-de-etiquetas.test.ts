import { readFileSync } from "node:fs"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"
import { aislar, base, gancho, idea, LOTE, lote, marca, SEMANA, uno } from "./lote-de-etiquetas-comun"

afterAll(() => pool.end())

/** As postgres: how many batches this week has. */
async function lotesDeLaSemana(c: pg.PoolClient): Promise<number> {
  await asumir(c, comoPostgres)
  const { rows } = await c.query<{ n: number }>(
    `select count(*)::int as n from public.lotes_de_etiquetas where semana = ${SEMANA}`,
  )
  return rows[0]?.n ?? -1
}

describe("lote_de_la_semana", () => {
  it("is built by Coni only: WAV reads it without building it, anyone else is refused", async () => {
    await como(comoPostgres, async (c) => {
      await aislar(c)
      const b = await base(c)
      const a = await idea(c, b, { tipo: "sin_clasificar" })
      await asumir(c, comoMantenedor)
      expect(await lote(c)).toEqual([])
      expect(await lotesDeLaSemana(c)).toBe(0)
      await asumir(c, comoOtra)
      const ajena = await fallaCon(c, LOTE)
      expect([ajena.code, ajena.message]).toEqual(["42501", "solo_coni"])
      await asumir(c, comoConi)
      const deConi = await lote(c)
      expect(deConi).toEqual([
        {
          posicion: 1,
          afirmacion_id: a,
          campo: "tipo",
          red: "todas",
          marca_id: null,
          motivo: "sin_clasificar",
          hecha: false,
        },
      ])
      await asumir(c, comoMantenedor)
      expect(await lote(c)).toEqual(deConi)
    })
  })

  it("takes five tags at most, one per claim: by motivo, then the oldest claim", async () => {
    await como(comoPostgres, async (c) => {
      await aislar(c)
      const b = await base(c)
      const masVieja = await idea(c, b, { minutos: 0 })
      const datoDudoso = await marca(c, masVieja, { marca: "dato", red: "todas", valor: "70 %", certeza: "baja" })
      const conDos = await idea(c, b, { minutos: 2, tipo: "sin_clasificar" })
      await marca(c, conDos, { marca: "problema", red: "linkedin", valor: "otro", porQue: "Soledad" })
      const segunda = await idea(c, b, { minutos: 1 })
      await marca(c, segunda, { marca: "emocion", red: "linkedin", valor: "escepticismo", certeza: "baja" })
      const conGancho = await idea(c, b, { minutos: 3 })
      await gancho(c, conGancho, "media")
      const sinEvidencia = await idea(c, b, { minutos: 4, evidencia: "sin_clasificar" })
      const enOtro = await idea(c, b, { minutos: 5 })
      const publicoOtro = await marca(c, enOtro, {
        marca: "publico",
        red: "instagram",
        valor: "otro",
        porQue: "Estudiantes",
      })
      const ultima = await idea(c, b, { minutos: 6 })
      await marca(c, ultima, { marca: "emocion", red: "instagram", valor: "curiosidad", certeza: "baja" })
      await asumir(c, comoConi)
      expect((await lote(c)).map((f) => [f.posicion, f.afirmacion_id, f.campo, f.red, f.marca_id, f.motivo])).toEqual([
        [1, conDos, "tipo", "todas", null, "sin_clasificar"],
        [2, sinEvidencia, "evidencia", "todas", null, "sin_clasificar"],
        [3, enOtro, "publico", "instagram", publicoOtro, "otro"],
        [4, conGancho, "tipo_de_gancho", "todas", null, "gancho"],
        [5, masVieja, "dato", "todas", datoDudoso, "certeza_baja"],
      ])
    })
  })

  it("leaves out an old claim's marks (not its sin_clasificar tipo), Coni's tags, hidden claims and a mark with no network", async () => {
    await como(comoPostgres, async (c) => {
      await aislar(c)
      const b = await base(c)
      const antiguaConMarca = await idea(c, b, { antigua: true, minutos: 0 })
      await marca(c, antiguaConMarca, { marca: "emocion", red: "linkedin", valor: "escepticismo", certeza: "baja" })
      const antiguaSinClasificar = await idea(c, b, { antigua: true, tipo: "sin_clasificar", minutos: 1 })
      const deConi = await idea(c, b, { minutos: 2 })
      await marca(c, deConi, {
        marca: "emocion",
        red: "linkedin",
        valor: "escepticismo",
        certeza: "baja",
        origen: "coni",
      })
      await gancho(c, deConi, "baja", "coni")
      await idea(c, b, { tipo: "sin_clasificar", excluida: true })
      const borrado = await base(c)
      await c.query("update public.materiales set borrar_desde = now() where id = $1", [borrado.material])
      await idea(c, borrado, { tipo: "sin_clasificar" })
      const sinRed = await idea(c, b, { minutos: 3 })
      await marca(c, sinRed, { marca: "emocion", red: "todas", valor: "escepticismo", certeza: "baja" })
      await asumir(c, comoConi)
      expect((await lote(c)).map((f) => [f.afirmacion_id, f.campo, f.motivo])).toEqual([
        [antiguaSinClasificar, "tipo", "sin_clasificar"],
      ])
    })
  })

  it("says an item is done once Coni confirms or corrects it, the mark is removed, or the tipo leaves sin_clasificar", async () => {
    await como(comoPostgres, async (c) => {
      await aislar(c)
      const b = await base(c)
      const confirmada = await idea(c, b, { minutos: 0 })
      const emocion = await marca(c, confirmada, {
        marca: "emocion",
        red: "linkedin",
        valor: "escepticismo",
        certeza: "baja",
      })
      const quitada = await idea(c, b, { minutos: 1 })
      const problema = await marca(c, quitada, { marca: "problema", red: "linkedin", valor: "otro", porQue: "Soledad" })
      const corregida = await idea(c, b, { minutos: 2, tipo: "sin_clasificar" })
      const conGancho = await idea(c, b, { minutos: 3 })
      await gancho(c, conGancho, "media")
      const pendiente = await idea(c, b, { minutos: 4 })
      await marca(c, pendiente, { marca: "emocion", red: "instagram", valor: "curiosidad", certeza: "baja" })
      await asumir(c, comoConi)
      expect((await lote(c)).map((f) => [f.afirmacion_id, f.hecha])).toEqual([
        [corregida, false],
        [quitada, false],
        [conGancho, false],
        [confirmada, false],
        [pendiente, false],
      ])
      await c.query("select public.confirmar_etiqueta($1::uuid, 'emocion', 'linkedin', $2::uuid)", [
        confirmada,
        emocion,
      ])
      await c.query("select public.quitar_marca($1::uuid, 'problema', 'linkedin', $2::uuid)", [quitada, problema])
      await c.query("select public.corregir_etiqueta($1::uuid, 'tipo', 'todas', 'consejo')", [corregida])
      await c.query("select public.corregir_etiqueta($1::uuid, 'tipo_de_gancho', 'todas', 'escena')", [conGancho])
      const despues = await lote(c)
      expect(despues.map((f) => [f.afirmacion_id, f.hecha])).toEqual([
        [corregida, true],
        [quitada, true],
        [conGancho, true],
        [confirmada, true],
        [pendiente, false],
      ])
      expect(despues[1]?.marca_id).toBeNull()
    })
  })

  it("starts a new week with what the most recent batch left doubtful, in its order, then the rest", async () => {
    await como(comoPostgres, async (c) => {
      await aislar(c)
      const b = await base(c)
      const sigue = await idea(c, b, { minutos: 5 })
      const marcaQueSigue = await marca(c, sigue, {
        marca: "emocion",
        red: "linkedin",
        valor: "escepticismo",
        certeza: "baja",
      })
      const resuelta = await idea(c, b, { minutos: 0 })
      const marcaResuelta = await marca(c, resuelta, {
        marca: "emocion",
        red: "linkedin",
        valor: "escepticismo",
        certeza: "baja",
      })
      const tipoQueSigue = await idea(c, b, { minutos: 6, tipo: "sin_clasificar" })
      const deHaceDos = await idea(c, b, { minutos: 2 })
      const marcaDeHaceDos = await marca(c, deHaceDos, {
        marca: "emocion",
        red: "instagram",
        valor: "curiosidad",
        certeza: "baja",
      })
      const nueva = await idea(c, b, { minutos: 1, evidencia: "sin_clasificar" })
      const anterior = await uno(
        c,
        `insert into public.lotes_de_etiquetas (semana) values (${SEMANA} - 7) returning id`,
      )
      const antes = await uno(c, `insert into public.lotes_de_etiquetas (semana) values (${SEMANA} - 14) returning id`)
      await c.query(
        `insert into public.lote_de_etiquetas_items (lote_id, posicion, afirmacion_id, campo, red, marca_id, motivo)
         values ($1, 1, $2, 'emocion', 'linkedin', $3, 'certeza_baja'),
                ($1, 2, $4, 'emocion', 'linkedin', $5, 'certeza_baja'),
                ($1, 3, $6, 'tipo', 'todas', null, 'sin_clasificar'),
                ($7, 1, $8, 'emocion', 'instagram', $9, 'certeza_baja')`,
        [anterior, sigue, marcaQueSigue, resuelta, marcaResuelta, tipoQueSigue, antes, deHaceDos, marcaDeHaceDos],
      )
      await c.query("update public.afirmacion_marcas set origen = 'coni', certeza = 'alta' where id = $1", [
        marcaResuelta,
      ])
      await asumir(c, comoConi)
      expect((await lote(c)).map((f) => [f.posicion, f.afirmacion_id, f.campo])).toEqual([
        [1, sigue, "emocion"],
        [2, tipoQueSigue, "tipo"],
        [3, nueva, "evidencia"],
        [4, deHaceDos, "emocion"],
      ])
    })
  })

  it("keeps an empty batch for a week that started with nothing doubtful, even when a doubt arrives later", async () => {
    await como(comoPostgres, async (c) => {
      await aislar(c)
      await asumir(c, comoConi)
      expect(await lote(c)).toEqual([])
      expect(await lotesDeLaSemana(c)).toBe(1)
      const b = await base(c)
      await idea(c, b, { tipo: "sin_clasificar" })
      await asumir(c, comoConi)
      expect(await lote(c)).toEqual([])
    })
  })

  // Commits on purpose (a second session cannot see a rolled-back transaction): it starts and ends with no batch this
  // week. It asserts only what holds whatever else the local database holds.
  it("builds one batch when two first reads of the week cross", async () => {
    const semanaLibre = () => pool.query(`delete from public.lotes_de_etiquetas where semana = ${SEMANA}`)
    await semanaLibre()
    const a = await pool.connect()
    const b = await pool.connect()
    try {
      await a.query("begin")
      await b.query("begin")
      await asumir(a, comoConi)
      await asumir(b, comoConi)
      const primera = await a.query(LOTE)
      // Waits on the first session's row until it commits, then reads the batch the first one built.
      const segunda = b.query(LOTE)
      await a.query("commit")
      expect((await segunda).rows).toEqual(primera.rows)
      await b.query("commit")
      const { rows } = await pool.query<{ n: number }>(
        `select count(*)::int as n from public.lotes_de_etiquetas where semana = ${SEMANA}`,
      )
      expect(rows[0]?.n).toBe(1)
    } finally {
      // After a commit, rollback is only a warning; after a failure it ends the open transaction.
      await a.query("rollback")
      await b.query("rollback")
      a.release()
      b.release()
      await semanaLibre()
    }
  })

  it("starts the week on Monday in America/Santiago, not in UTC", async () => {
    // The week expression of lote_de_la_semana() (supabase/migrations/20261114000900_lote_de_etiquetas.sql, v_semana),
    // kept here once: the test checks the migration still uses it, then evaluates it at fixed instants.
    const semanaDe = (instante: string) => `date_trunc('week', ${instante} at time zone 'America/Santiago')::date`
    const migracion = readFileSync("supabase/migrations/20261114000900_lote_de_etiquetas.sql", "utf-8")
    expect(migracion).toContain(`v_semana date := ${semanaDe("now()")};`)
    const { rows } = await pool.query<{ domingo: string; lunes: string }>(
      `select ${semanaDe("$1::timestamptz")}::text as domingo, ${semanaDe("$2::timestamptz")}::text as lunes`,
      // Sunday 29-11-2026 23:30 in Santiago (UTC-3 in summer) is already Monday 02:30 in UTC; Monday 00:30 in Santiago.
      ["2026-11-30T02:30:00Z", "2026-11-30T03:30:00Z"],
    )
    expect(rows[0]).toEqual({ domingo: "2026-11-23", lunes: "2026-11-30" })
  })
})
