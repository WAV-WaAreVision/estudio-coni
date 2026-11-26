import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`

interface Fila {
  afirmacion_id: string
  frase_exacta: string
  frase_sin_gancho: string | null
  tipo: string
  certeza: string | null
  clasificado: boolean
  material_id: string
  material_titulo: string | null
  autor_id: string | null
  autor_nombre: string | null
  tema_id: string | null
  tema_nombre: string | null
  pilares: { red: string; pilar_id: string; nombre: string }[]
  favorito: boolean
}

interface Escena {
  autor: string
  material: string
  tema: string
  nuevo: string
  viejo: string
  ambos: string
}

async function uno(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó: ${sql.slice(0, 60)}`)
  return id
}

/** As postgres, inside the test's transaction: an author, a material, a topic and claims with and without hooks. */
async function sembrar(c: pg.PoolClient): Promise<Escena> {
  const sufijo = randomUUID().slice(0, 8)
  const autor = await uno(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [
    `Autora ganchos ${sufijo}`,
  ])
  const material = await uno(
    c,
    `insert into public.materiales (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado)
     values ($1, 'documento', $2, 'referente', 'texto', now(), $3, 'listo') returning id`,
    [`Material ganchos ${sufijo}`, autor, CONI],
  )
  const tema = await uno(
    c,
    "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id",
    [`Tema ganchos ${sufijo}`, CENTROIDE],
  )
  const afirmacion = (texto: string, gancho: string | null, extra: { tema?: string | null; excluida?: boolean } = {}) =>
    uno(
      c,
      `insert into public.afirmaciones
         (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, gancho, excluida)
       values ($1, $2, 0, '{"pagina":3}'::jsonb, $3, 'cita', 'dato', 'estudio', $4, $5, $6) returning id`,
      [material, autor, texto, extra.tema === undefined ? tema : extra.tema, gancho, extra.excluida ?? false],
    )
  const nuevo = await afirmacion("Con gancho nuevo", null)
  const viejo = await afirmacion("Con gancho viejo", "¿Y si descansar fuera trabajo?")
  const ambos = await afirmacion("Con los dos", "Texto libre que ya no cuenta")
  await afirmacion("Sin gancho", null)
  await afirmacion("Gancho en blanco", "   ")
  await afirmacion("Oculta", "Un gancho de una idea oculta", { excluida: true })
  const version = await uno(
    c,
    "select id::text as id from public.versiones_de_vocabulario where lista = 'gancho' and estado = 'vigente'",
  )
  const gancho = `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
                  values ($1, $2, $3, $4, 'alta', $5, 'extraccion')`
  await c.query(gancho, [nuevo, "El 70 % no descansa.", "Pocas personas descansan.", "numero_especifico", version])
  await c.query(gancho, [ambos, "Nadie te lo dijo.", "Hay algo que no se dice.", "verdad_incomoda", version])
  return { autor, material, tema, nuevo, viejo, ambos }
}

const filasDe = async (c: pg.PoolClient, material: string) =>
  (
    await c.query<Fila>("select * from public.biblioteca_de_ganchos where material_id = $1 order by frase_exacta", [
      material,
    ])
  ).rows

describe("biblioteca_de_ganchos", () => {
  it("merges new and old hooks once per claim, the classified one winning", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      const filas = await filasDe(c, e.material)
      expect(filas.map((f) => f.afirmacion_id).sort()).toEqual([e.nuevo, e.viejo, e.ambos].sort())
      expect(filas.find((f) => f.afirmacion_id === e.ambos)).toMatchObject({
        frase_exacta: "Nadie te lo dijo.",
        frase_sin_gancho: "Hay algo que no se dice.",
        tipo: "verdad_incomoda",
        certeza: "alta",
        clasificado: true,
      })
      expect(filas.find((f) => f.afirmacion_id === e.viejo)).toMatchObject({
        frase_exacta: "¿Y si descansar fuera trabajo?",
        frase_sin_gancho: null,
        tipo: "sin_clasificar",
        certeza: null,
        clasificado: false,
        autor_id: e.autor,
        tema_id: e.tema,
        favorito: false,
      })
    })
  })

  it("hides the hooks of a material marked for deletion, and the name of a marked author", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query("update public.autores set borrar_desde = now() where id = $1", [e.autor])
      await asumir(c, comoConi)
      const filas = await filasDe(c, e.material)
      expect(filas).toHaveLength(3)
      for (const fila of filas) expect(fila).toMatchObject({ autor_id: null, autor_nombre: null })
      await asumir(c, comoPostgres)
      await c.query("update public.materiales set borrar_desde = now() where id = $1", [e.material])
      await asumir(c, comoConi)
      expect(await filasDe(c, e.material)).toEqual([])
    })
  })

  it("derives the pillars per network from the topic, leaving the layers out", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query(
        `insert into public.tema_pilares (tema_id, pilar_id, red, es_capa, fuerza, origen)
         select $1, c.id, c.red, c.es_capa, f.fuerza, 'coni'
           from public.categorias c
           join (values ('diagnostico-doble', 'alta'), ('mi-nueva-partida', 'alta'), ('capa-tdah', null))
             as f (slug, fuerza) on f.slug = c.slug`,
        [e.tema],
      )
      const sinTema = await uno(
        c,
        `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, gancho)
         values ($1, $2, 0, '{"pagina":1}'::jsonb, 'Sin tema', 'cita', 'dato', 'estudio', 'Un gancho sin tema') returning id`,
        [e.material, e.autor],
      )
      await asumir(c, comoConi)
      const filas = await filasDe(c, e.material)
      expect(filas.find((f) => f.afirmacion_id === e.nuevo)?.pilares.map((p) => [p.red, p.nombre])).toEqual([
        ["instagram", "Mi nueva partida"],
        ["linkedin", "Diagnóstico doble"],
      ])
      expect(filas.find((f) => f.afirmacion_id === sinTema)?.pilares).toEqual([])
    })
  })

  it("shows nothing to someone who is not Coni or WAV", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query("insert into public.ganchos_favoritos (afirmacion_id) values ($1)", [e.nuevo])
      await asumir(c, comoOtra)
      expect(await filasDe(c, e.material)).toEqual([])
      expect((await c.query("select 1 from public.ganchos_favoritos")).rowCount).toBe(0)
    })
  })
})

describe("ganchos_favoritos", () => {
  it("lets Coni mark and unmark, once per claim, and the view says it", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      await c.query("insert into public.ganchos_favoritos (afirmacion_id) values ($1)", [e.viejo])
      expect((await filasDe(c, e.material)).find((f) => f.afirmacion_id === e.viejo)?.favorito).toBe(true)
      const repetido = await fallaCon(c, "insert into public.ganchos_favoritos (afirmacion_id) values ($1)", [e.viejo])
      expect(repetido.code).toBe("23505")
      await c.query("delete from public.ganchos_favoritos where afirmacion_id = $1", [e.viejo])
      expect((await filasDe(c, e.material)).find((f) => f.afirmacion_id === e.viejo)?.favorito).toBe(false)
    })
  })

  it("lets the maintainer read the favorites and the view, not change the favorites", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query("insert into public.ganchos_favoritos (afirmacion_id) values ($1)", [e.nuevo])
      await asumir(c, comoMantenedor)
      expect(await filasDe(c, e.material)).toHaveLength(3)
      const leidos = await c.query("select 1 from public.ganchos_favoritos where afirmacion_id = $1", [e.nuevo])
      expect(leidos.rowCount).toBe(1)
      const insertar = await fallaCon(c, "insert into public.ganchos_favoritos (afirmacion_id) values ($1)", [e.viejo])
      expect(insertar.message).toContain("row-level security")
      const borrar = await c.query("delete from public.ganchos_favoritos where afirmacion_id = $1", [e.nuevo])
      expect(borrar.rowCount).toBe(0)
    })
  })

  it("goes away with its claim", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query("insert into public.ganchos_favoritos (afirmacion_id) values ($1)", [e.nuevo])
      await c.query("delete from public.afirmaciones where id = $1", [e.nuevo])
      const quedan = await c.query("select 1 from public.ganchos_favoritos where afirmacion_id = $1", [e.nuevo])
      expect(quedan.rowCount).toBe(0)
    })
  })
})

describe("ajustes.tipos_de_gancho_preferidos", () => {
  it("is an empty list by default, and only Coni changes it", async () => {
    await como(comoPostgres, async (c) => {
      const { rows } = await c.query<{ column_default: string; is_nullable: string }>(
        `select column_default, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'ajustes' and column_name = 'tipos_de_gancho_preferidos'`,
      )
      expect(rows[0]).toEqual({ column_default: "'{}'::text[]", is_nullable: "NO" })
      await asumir(c, comoMantenedor)
      const deWav = await c.query("update public.ajustes set tipos_de_gancho_preferidos = '{escena}' where id")
      expect(deWav.rowCount).toBe(0)
      await asumir(c, comoConi)
      const deConi = await c.query<{ t: string[] }>(
        "update public.ajustes set tipos_de_gancho_preferidos = '{escena}' where id returning tipos_de_gancho_preferidos as t",
      )
      expect(deConi.rows[0]?.t).toEqual(["escena"])
    })
  })
})
