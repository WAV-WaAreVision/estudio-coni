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

describe("a vector that arrives without a model stamp", () => {
  it("is treated as voyage-3.5 (old Trigger code): dropped once voyage-4 is vigente, on insert and on update", async () => {
    const id = await afirmacion(null)
    await como(comoPostgres, async (c) => {
      await vigenteVoyage4(c)
      await c.query("update public.afirmaciones set vector = $2::extensions.vector where id = $1", [
        id,
        texto(vec({ 0: 1 })),
      ])
      expect(await modeloDe(c, id)).toEqual({ sin: true, modelo: null })
      const insertada = await c.query<{ id: string }>(
        `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, vector)
         select material_id, autor_id, 1, ubicacion, 'Otra idea.', cita, tipo, evidencia, $1::extensions.vector
         from public.afirmaciones where id = $2 returning id`,
        [texto(vec({ 1: 1 })), id],
      )
      expect(await modeloDe(c, insertada.rows[0]?.id ?? "")).toEqual({ sin: true, modelo: null })
    })
  })

  it("is kept and stamped voyage-3.5 while voyage-3.5 is vigente", async () => {
    const id = await afirmacion(null)
    await pool.query("update public.afirmaciones set vector = $2::extensions.vector where id = $1", [
      id,
      texto(vec({ 0: 1 })),
    ])
    expect(await modeloDe(pool, id)).toEqual({ sin: false, modelo: "voyage-3.5" })
  })
})

describe("a vector replaced on a claim stamped with the model of before a switch", () => {
  it("is dropped too: the stamp stays voyage-3.5, which is no longer vigente, so maintenance embeds the claim again", async () => {
    const id = await afirmacion(vec({ 0: 1 }))
    await como(comoPostgres, async (c) => {
      await vigenteVoyage4(c)
      await c.query("update public.afirmaciones set vector = $2::extensions.vector where id = $1", [
        id,
        texto(vec({ 1: 1 })),
      ])
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

describe("who can reach the model tables and functions", () => {
  const tablas = [
    "pruebas_de_modelo",
    "calibraciones_de_parecido",
    "huellas_candidatas",
    "huellas_anteriores",
    "decisiones_de_tema",
  ]
  const funciones = [
    "modelo_de_huellas_vigente()",
    "sellar_modelo_de_vector()",
    "sellar_modelo_de_centroide()",
    "completar_decision_de_tema()",
    "huella_de_asignaciones()",
    "afirmaciones_sin_huella(uuid, text)",
    "aplicar_prueba_de_modelo(uuid)",
    "revertir_prueba_de_modelo(uuid)",
    "limpiar_huellas_de_prueba(timestamptz)",
  ]

  it("gives anon no privilege on any of the tables nor on any of the functions", async () => {
    for (const tabla of tablas) {
      const { rows } = await pool.query<{ sin: boolean }>(
        `select not (has_table_privilege('anon', $1, 'select') or has_table_privilege('anon', $1, 'insert')
                  or has_table_privilege('anon', $1, 'update') or has_table_privilege('anon', $1, 'delete')) as sin`,
        [`public.${tabla}`],
      )
      expect({ tabla, sin: rows[0]?.sin }).toEqual({ tabla, sin: true })
    }
    for (const funcion of funciones) {
      const { rows } = await pool.query<{ puede: boolean }>(
        "select has_function_privilege('anon', $1, 'execute') as puede",
        [`public.${funcion}`],
      )
      expect({ funcion, puede: rows[0]?.puede }).toEqual({ funcion, puede: false })
    }
  })

  it("lets Coni neither insert nor update the calibrations and the dry runs, nor change a decision", async () => {
    await como(comoConi, async (c) => {
      for (const sql of [
        `insert into public.calibraciones_de_parecido (version, modelo, tema, grupo, fusion, puente_min, puente_max, motivo)
         values (9, 'voyage-4', 0.6, 0.6, 0.6, 0.4, 0.6, 'x')`,
        "update public.calibraciones_de_parecido set tema = 0.1",
        `insert into public.pruebas_de_modelo (modelo, umbrales, informe)
         values ('voyage-4', '{"tema":1,"grupo":1,"fusion":1,"puente_min":1,"puente_max":1}', '{}')`,
        "update public.pruebas_de_modelo set estado = 'aplicada'",
        "update public.decisiones_de_tema set tipo = 'fusion_aceptada'",
        "delete from public.decisiones_de_tema",
      ]) {
        expect((await fallaCon(c, sql)).code).toBe("42501")
      }
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
