import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

type Cliente = pg.PoolClient

const vector = (valor: number, posicion = 0) =>
  `[${Array.from({ length: 1024 }, (_, i) => (i === posicion ? valor : 0)).join(",")}]`

async function id(c: Cliente, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const valor = rows[0]?.id
  if (!valor) throw new Error(`Sin id para: ${sql}`)
  return valor
}

const crearAutor = (c: Cliente, nombre: string) =>
  id(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [nombre])

const crearMaterial = (c: Cliente, autor: string, rol = "referente") =>
  id(
    c,
    `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('documento', $1, $2, 'hola', now(), $3) returning id`,
    [autor, rol, CONI],
  )

const crearTema = (c: Cliente, nombre: string, posicion = 0) =>
  id(
    c,
    "insert into public.temas (nombre, descripcion, centroide) values ($1, 'd', $2::extensions.vector) returning id",
    [nombre, vector(1, posicion)],
  )

interface Extra {
  texto?: string
  evidencia?: string
  tipo?: string
  tema?: string | null
  vec?: string | null
  excluida?: boolean
}

const crearAfirmacion = (c: Cliente, material: string, autor: string, extra: Extra = {}) =>
  id(
    c,
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, vector, excluida)
     values ($1, $2, 0, '{"pagina": 1}', $3, 'cita', $4, $5, $6, $7::extensions.vector, $8) returning id`,
    [
      material,
      autor,
      extra.texto ?? "La culpa no sirve.",
      extra.tipo ?? "consejo",
      extra.evidencia ?? "opinion",
      extra.tema ?? null,
      extra.vec ?? null,
      extra.excluida ?? false,
    ],
  )

describe("temas", () => {
  it("normalizes the name and keeps it unique among topics", async () => {
    await como(comoPostgres, async (c) => {
      const t = await crearTema(c, "  Deseo ESPONTÁNEO ")
      const { rows } = await c.query("select nombre_normalizado as n from public.temas where id = $1", [t])
      expect(rows[0]).toEqual({ n: "deseo espontaneo" })
      const error = await fallaCon(
        c,
        "insert into public.temas (nombre, centroide) values ('deseo espontáneo', $1::extensions.vector)",
        [vector(1)],
      )
      expect(error.code).toBe("23505")
    })
  })

  it("requires a centroid", async () => {
    await como(comoPostgres, async (c) => {
      const error = await fallaCon(c, "insert into public.temas (nombre) values ('Sin centroide')")
      expect(error.code).toBe("23502")
    })
  })

  it("lets members read and refuses everyone else", async () => {
    await como(comoPostgres, async (c) => {
      await crearTema(c, "Visible")
      await asumir(c, comoConi)
      expect((await c.query("select 1 from public.temas where nombre = 'Visible'")).rowCount).toBe(1)
      await asumir(c, comoOtra)
      expect((await c.query("select 1 from public.temas where nombre = 'Visible'")).rowCount).toBe(0)
    })
  })

  it("does not let members write directly", async () => {
    await como(comoConi, async (c) => {
      const insertar = await fallaCon(
        c,
        "insert into public.temas (nombre, centroide) values ('X', $1::extensions.vector)",
        [vector(1)],
      )
      expect(insertar.code).toBe("42501")
      expect((await fallaCon(c, "update public.temas set nombre = 'X'")).code).toBe("42501")
      expect((await fallaCon(c, "delete from public.temas")).code).toBe("42501")
    })
  })

  it("is audited", async () => {
    await como(comoServicio, async (c) => {
      const t = await crearTema(c, "Auditado")
      await asumir(c, comoPostgres)
      const { rows } = await c.query("select 1 from public.eventos where tabla = 'temas' and datos ->> 'id' = $1", [t])
      expect(rows.length).toBe(1)
    })
  })

  it("has an HNSW cosine index on the centroid", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'temas' and indexdef ilike '%hnsw%'",
    )
    expect(rows[0]?.indexdef).toMatch(/vector_cosine_ops/)
  })
})

describe("afirmaciones", () => {
  it("rejects texts over 280 characters, unknown types and unknown evidence levels", async () => {
    await como(comoPostgres, async (c) => {
      const autor = await crearAutor(c, "A")
      const material = await crearMaterial(c, autor)
      expect(
        (
          await fallaCon(
            c,
            `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
         values ($1, $2, 0, '{}', $3, 'c', 'consejo', 'opinion')`,
            [material, autor, "x".repeat(281)],
          )
        ).code,
      ).toBe("23514")
      await expect(crearAfirmacion(c, material, autor, { texto: "x".repeat(280) })).resolves.toBeTruthy()
      const tipo = await fallaCon(
        c,
        `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
         values ($1, $2, 0, '{}', 't', 'c', 'otro', 'opinion')`,
        [material, autor],
      )
      expect(tipo.code).toBe("23514")
    })
  })

  it("rejects an unknown evidence level", async () => {
    await como(comoPostgres, async (c) => {
      const autor = await crearAutor(c, "A")
      const material = await crearMaterial(c, autor)
      const error = await fallaCon(
        c,
        `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia)
         values ($1, $2, 0, '{}', 't', 'c', 'consejo', 'rumor')`,
        [material, autor],
      )
      expect(error.code).toBe("23514")
    })
  })

  it("cascades with the material and nulls the topic when the topic is deleted", async () => {
    await como(comoPostgres, async (c) => {
      const autor = await crearAutor(c, "A")
      const material = await crearMaterial(c, autor)
      const tema = await crearTema(c, "T")
      const a = await crearAfirmacion(c, material, autor, { tema })
      await c.query("delete from public.temas where id = $1", [tema])
      expect((await c.query("select tema_id from public.afirmaciones where id = $1", [a])).rows[0]).toEqual({
        tema_id: null,
      })
      await c.query("delete from public.materiales where id = $1", [material])
      expect((await c.query("select 1 from public.afirmaciones where id = $1", [a])).rowCount).toBe(0)
    })
  })

  it("lets members read, refuses outsiders and blocks direct member writes", async () => {
    await como(comoPostgres, async (c) => {
      const autor = await crearAutor(c, "A")
      const material = await crearMaterial(c, autor)
      await crearAfirmacion(c, material, autor)
      await asumir(c, comoConi)
      expect((await c.query("select 1 from public.afirmaciones")).rowCount).toBe(1)
      expect((await fallaCon(c, "update public.afirmaciones set excluida = true")).code).toBe("42501")
      expect((await fallaCon(c, "delete from public.afirmaciones")).code).toBe("42501")
      await asumir(c, comoOtra)
      expect((await c.query("select 1 from public.afirmaciones")).rowCount).toBe(0)
    })
  })

  it("has the indexes the plan asks for", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'afirmaciones'",
    )
    const defs = rows.map((r) => r.indexdef).join("\n")
    expect(defs).toMatch(/hnsw[\s\S]*vector_cosine_ops/)
    for (const columna of ["tema_id", "autor_id", "material_id"]) expect(defs).toContain(`(${columna})`)
  })
})

describe("excluir_afirmacion", () => {
  it("excludes the claim and detaches it from its topic, and can undo", async () => {
    await como(comoPostgres, async (c) => {
      const autor = await crearAutor(c, "A")
      const material = await crearMaterial(c, autor)
      const tema = await crearTema(c, "T")
      const a = await crearAfirmacion(c, material, autor, { tema })
      await asumir(c, comoConi)
      await c.query("select public.excluir_afirmacion($1, true)", [a])
      expect((await c.query("select excluida, tema_id from public.afirmaciones where id = $1", [a])).rows[0]).toEqual({
        excluida: true,
        tema_id: null,
      })
      await c.query("select public.excluir_afirmacion($1, false)", [a])
      expect((await c.query("select excluida from public.afirmaciones where id = $1", [a])).rows[0]).toEqual({
        excluida: false,
      })
    })
  })

  it("refuses outsiders with 42501 and a missing claim with P0002", async () => {
    await como(comoOtra, async (c) => {
      expect((await fallaCon(c, "select public.excluir_afirmacion(gen_random_uuid(), true)")).code).toBe("42501")
    })
    await como(comoConi, async (c) => {
      expect((await fallaCon(c, "select public.excluir_afirmacion(gen_random_uuid(), true)")).code).toBe("P0002")
    })
  })
})

describe("temas_resumen", () => {
  it("summarizes active topics from non-excluded claims", async () => {
    await como(comoPostgres, async (c) => {
      const a1 = await crearAutor(c, "Uno")
      const a2 = await crearAutor(c, "Dos")
      const referente = await crearMaterial(c, a1)
      const propio = await crearMaterial(c, a2, "voz_propia")
      const tema = await crearTema(c, "Resumen")
      const viejo = await crearTema(c, "Viejo", 1)
      await c.query("update public.temas set fusionado_en = $1 where id = $2", [tema, viejo])
      await crearAfirmacion(c, referente, a1, { tema, evidencia: "estudio" })
      await crearAfirmacion(c, referente, a1, { tema, evidencia: "opinion" })
      await crearAfirmacion(c, referente, a2, { tema, evidencia: "opinion", excluida: true })
      const filas = async () =>
        (await c.query("select * from public.temas_resumen where id in ($1, $2)", [tema, viejo])).rows
      let rows = await filas()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        id: tema,
        afirmaciones: 2,
        autores: 1,
        evidencia: { estudio: 1, opinion: 1 },
        cubierto_por_coni: false,
      })
      expect(rows[0].ultima_afirmacion).not.toBeNull()
      await crearAfirmacion(c, propio, a2, { tema, evidencia: "clinica" })
      rows = await filas()
      expect(rows[0]).toMatchObject({ afirmaciones: 3, autores: 2, cubierto_por_coni: true })
    })
  })

  it("is a security invoker view that hides everything from outsiders", async () => {
    const { rows } = await pool.query("select reloptions from pg_class where relname = 'temas_resumen'")
    expect(rows[0]?.reloptions).toContain("security_invoker=true")
  })
})

describe("tema_mas_cercano", () => {
  it("returns the nearest active topic above the threshold and nothing below it", async () => {
    await como(comoServicio, async (c) => {
      const cerca = await crearTema(c, "Cerca", 0)
      await crearTema(c, "Lejos", 1)
      const fusionado = await crearTema(c, "Fusionado", 2)
      await c.query("update public.temas set fusionado_en = $1 where id = $2", [cerca, fusionado])
      const hit = await c.query("select * from public.tema_mas_cercano($1::extensions.vector, 0.8)", [vector(1, 0)])
      expect(hit.rows).toHaveLength(1)
      expect(hit.rows[0].tema_id).toBe(cerca)
      expect(Number(hit.rows[0].similitud)).toBeCloseTo(1, 5)
      const sobreFusionado = await c.query("select * from public.tema_mas_cercano($1::extensions.vector, 0.8)", [
        vector(1, 2),
      ])
      expect(sobreFusionado.rows).toHaveLength(0)
      const nada = await c.query("select * from public.tema_mas_cercano($1::extensions.vector, 0.8)", [vector(1, 5)])
      expect(nada.rows).toHaveLength(0)
    })
  })

  it("is callable only by the service role", async () => {
    await como(comoConi, async (c) => {
      expect(
        (await fallaCon(c, "select * from public.tema_mas_cercano($1::extensions.vector, 0.5)", [vector(1)])).code,
      ).toBe("42501")
    })
  })
})

describe("fusionar_autores moves claims", () => {
  it("repoints afirmaciones.autor_id to the destination", async () => {
    await como(comoPostgres, async (c) => {
      const origen = await crearAutor(c, "E. Perel")
      const destino = await crearAutor(c, "Esther Perel")
      const material = await crearMaterial(c, origen)
      const a = await crearAfirmacion(c, material, origen)
      await asumir(c, comoConi)
      await c.query("select public.fusionar_autores($1, $2)", [origen, destino])
      expect((await c.query("select autor_id from public.afirmaciones where id = $1", [a])).rows[0]).toEqual({
        autor_id: destino,
      })
    })
  })
})
