import type pg from "pg"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, fallaCon, pool } from "./db"
import { afirmacion, reiniciarHuellas, tema, texto, vec } from "./huellas-comun"

afterAll(() => pool.end())
beforeEach(reiniciarHuellas)
afterEach(reiniciarHuellas)

/** voyage-4 becomes the vigente model inside the test's transaction, as `aplicar_prueba_de_modelo` does. */
async function vigenteVoyage4(c: pg.PoolClient): Promise<void> {
  await c.query("update public.calibraciones_de_parecido set vigente = false where vigente")
  await c.query(
    `insert into public.calibraciones_de_parecido (version, modelo, tema, grupo, fusion, puente_min, puente_max, vigente, motivo)
     values (2, 'voyage-4', 0.6, 0.6, 0.6, 0.4, 0.6, true, 'prueba')`,
  )
}

async function modeloDe(c: pg.PoolClient | pg.Pool, id: string) {
  const { rows } = await c.query<{ sin: boolean; modelo: string | null }>(
    "select vector is null as sin, modelo_vector as modelo from public.afirmaciones where id = $1",
    [id],
  )
  return rows[0]
}

describe("calibraciones_de_parecido", () => {
  it("starts with version 1: voyage-3.5 at 0.8 / 0.8 / 0.8 / 0.6 / 0.8, vigente", async () => {
    const { rows } = await pool.query(
      `select version, modelo, tema::float8 as tema, grupo::float8 as grupo, fusion::float8 as fusion,
              puente_min::float8 as puente_min, puente_max::float8 as puente_max, vigente, prueba_id
       from public.calibraciones_de_parecido`,
    )
    expect(rows).toEqual([
      {
        version: 1,
        modelo: "voyage-3.5",
        tema: 0.8,
        grupo: 0.8,
        fusion: 0.8,
        puente_min: 0.6,
        puente_max: 0.8,
        vigente: true,
        prueba_id: null,
      },
    ])
  })

  it("never has two vigente rows, nor a bridge band upside down", async () => {
    await como(comoPostgres, async (c) => {
      const doble = await fallaCon(
        c,
        `insert into public.calibraciones_de_parecido (version, modelo, tema, grupo, fusion, puente_min, puente_max, vigente, motivo)
         values (2, 'voyage-4', 0.6, 0.6, 0.6, 0.4, 0.6, true, 'x')`,
      )
      expect(doble.code).toBe("23505")
      const alReves = await fallaCon(
        c,
        `insert into public.calibraciones_de_parecido (version, modelo, tema, grupo, fusion, puente_min, puente_max, motivo)
         values (3, 'voyage-4', 0.6, 0.6, 0.6, 0.7, 0.6, 'x')`,
      )
      expect(alReves.code).toBe("23514")
    })
  })

  it("is not readable from the app, nor are the dry runs and their vectors", async () => {
    await como(comoConi, async (c) => {
      for (const tabla of [
        "calibraciones_de_parecido",
        "pruebas_de_modelo",
        "huellas_candidatas",
        "huellas_anteriores",
      ]) {
        expect((await fallaCon(c, `select * from public.${tabla}`)).code).toBe("42501")
      }
    })
  })
})

describe("the model stamp of a claim's vector", () => {
  it("stamps a vector written without a model with the vigente one, and clears the stamp with the vector", async () => {
    const id = await afirmacion(vec({ 0: 1 }))
    expect(await modeloDe(pool, id)).toEqual({ sin: false, modelo: "voyage-3.5" })
    await pool.query("update public.afirmaciones set vector = null where id = $1", [id])
    expect(await modeloDe(pool, id)).toEqual({ sin: true, modelo: null })
  })

  it("keeps a vector embedded with the vigente model", async () => {
    const id = await afirmacion(vec({ 0: 1 }), { modelo: "voyage-3.5" })
    expect(await modeloDe(pool, id)).toEqual({ sin: false, modelo: "voyage-3.5" })
  })

  it("drops a vector embedded with a model that is no longer vigente, so maintenance embeds it again", async () => {
    const id = await afirmacion(null)
    await como(comoPostgres, async (c) => {
      await vigenteVoyage4(c)
      await c.query(
        "update public.afirmaciones set vector = $2::extensions.vector, modelo_vector = 'voyage-3.5' where id = $1",
        [id, texto(vec({ 0: 1 }))],
      )
      expect(await modeloDe(c, id)).toEqual({ sin: true, modelo: null })
    })
  })
})

describe("the model stamp of a topic's centroid", () => {
  it("stamps an insert and a SQL recomputation with the vigente model", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    await afirmacion(vec({ 1: 1 }), { tema: t })
    await pool.query("select public.recalcular_tema($1)", [t])
    const { rows } = await pool.query("select modelo_centroide from public.temas where id = $1", [t])
    expect(rows).toEqual([{ modelo_centroide: "voyage-3.5" }])
  })

  it("refuses a centroid computed with the model of before the switch", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    await como(comoPostgres, async (c) => {
      await vigenteVoyage4(c)
      await c.query("update public.temas set modelo_centroide = 'voyage-4' where id = $1", [t])
      const error = await fallaCon(
        c,
        "update public.temas set centroide = $2::extensions.vector, modelo_centroide = 'voyage-3.5' where id = $1",
        [t, texto(vec({ 1: 1 }))],
      )
      expect(error.message).toBe("modelo_de_huellas_cambio")
    })
  })
})

describe("decisiones_de_tema", () => {
  it("lets Coni record a decision in her own name; Coni and WAV read it", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    const otro = await tema("Ganas", vec({ 1: 1 }))
    await como(comoConi, async (c) => {
      await c.query(
        "insert into public.decisiones_de_tema (tipo, tema_id, otro_tema_id) values ('fusion_rechazada', $1, $2)",
        [t, otro],
      )
      expect((await c.query("select decidida_por from public.decisiones_de_tema")).rows).toEqual([
        { decidida_por: CONI },
      ])
      await asumir(c, comoMantenedor)
      expect((await c.query("select 1 from public.decisiones_de_tema")).rowCount).toBe(1)
    })
  })

  it("refuses a decision from WAV", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    const otro = await tema("Ganas", vec({ 1: 1 }))
    await como(comoMantenedor, async (c) => {
      const error = await fallaCon(
        c,
        "insert into public.decisiones_de_tema (tipo, tema_id, otro_tema_id) values ('fusion_rechazada', $1, $2)",
        [t, otro],
      )
      expect(error.code).toBe("42501")
    })
  })

  it("needs the other topic for a merge and the claim for a claim decision", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    await como(comoPostgres, async (c) => {
      const sinOtro = await fallaCon(
        c,
        "insert into public.decisiones_de_tema (tipo, tema_id, decidida_por) values ('fusion_aceptada', $1, $2)",
        [t, CONI],
      )
      expect(sinOtro.code).toBe("23514")
      const sinAfirmacion = await fallaCon(
        c,
        "insert into public.decisiones_de_tema (tipo, tema_id, decidida_por) values ('afirmacion_quitada', $1, $2)",
        [t, CONI],
      )
      expect(sinAfirmacion.code).toBe("23514")
    })
  })

  it("keeps the names of both topics, so a decision outlives the topics it was about", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    const otro = await tema("Ganas", vec({ 1: 1 }))
    await pool.query(
      "insert into public.decisiones_de_tema (tipo, tema_id, otro_tema_id, decidida_por) values ('fusion_rechazada', $1, $2, $3)",
      [t, otro, CONI],
    )
    expect((await pool.query("select tema_nombre, otro_tema_nombre from public.decisiones_de_tema")).rows).toEqual([
      { tema_nombre: "Deseo", otro_tema_nombre: "Ganas" },
    ])
    await pool.query("delete from public.temas where id = any($1)", [[t, otro]])
    expect(
      (await pool.query("select tema_id, otro_tema_id, tema_nombre, otro_tema_nombre from public.decisiones_de_tema"))
        .rows,
    ).toEqual([{ tema_id: null, otro_tema_id: null, tema_nombre: "Deseo", otro_tema_nombre: "Ganas" }])
  })

  it("survives the deletion of the claim it was about", async () => {
    const t = await tema("Deseo", vec({ 0: 1 }))
    const a = await afirmacion(vec({ 0: 1 }), { tema: t })
    await pool.query(
      "insert into public.decisiones_de_tema (tipo, tema_id, afirmacion_id, decidida_por) values ('afirmacion_quitada', $1, $2, $3)",
      [t, a, CONI],
    )
    await pool.query("delete from public.afirmaciones where id = $1", [a])
    const { rows } = await pool.query("select tipo, afirmacion_id, tema_nombre from public.decisiones_de_tema")
    expect(rows).toEqual([{ tipo: "afirmacion_quitada", afirmacion_id: null, tema_nombre: "Deseo" }])
  })
})
