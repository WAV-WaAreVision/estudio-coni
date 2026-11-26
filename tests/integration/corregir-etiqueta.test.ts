import { randomUUID } from "node:crypto"
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"

afterAll(() => pool.end())

interface Escena {
  nueva: string
  antigua: string
  vacia: string
  emocionLinkedin: string
  emocionInstagram: string
  problema: string
  dato: string
}

interface Registro {
  campo: string
  red: string
  accion: string
  antes: string | null
  despues: string | null
  frase_antes: string | null
  frase_despues: string | null
  por_que: string | null
  certeza_antes: string | null
  version_id: number | null
}

interface Marca {
  valor: string
  frase: string | null
  certeza: string
  por_que: string | null
  origen: string
  version_id: number | null
}

async function uno(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó: ${sql.slice(0, 60)}`)
  return id
}

/**
 * As postgres, inside the test's transaction: a new claim (marks and a hook, as 6a's extraction leaves them), an old one
 * (no marks, only the free text from before 6a, marked as the migration's backfill marks it) and one extracted after
 * the migration with zero marks.
 */
async function sembrar(c: pg.PoolClient): Promise<Escena> {
  const sufijo = randomUUID().slice(0, 8)
  const autor = await uno(c, "insert into public.autores (nombre, tipo) values ($1, 'persona') returning id", [
    `Autora etiquetas ${sufijo}`,
  ])
  const material = await uno(
    c,
    `insert into public.materiales (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado)
     values ($1, 'documento', $2, 'referente', 'texto', now(), $3, 'listo') returning id`,
    [`Material etiquetas ${sufijo}`, autor, CONI],
  )
  const afirmacion = (texto: string) =>
    uno(
      c,
      `insert into public.afirmaciones
         (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, publico, dolor, emocion)
       values ($1, $2, 0, '{"pagina":2}'::jsonb, $3, 'cita', 'dato', 'estudio', 'líderes', 'sobrecarga', 'alivio')
       returning id`,
      [material, autor, texto],
    )
  const nueva = await afirmacion("Nueva")
  const antigua = await afirmacion("Antigua")
  const vacia = await afirmacion("Sin marcas, extraída después")
  await c.query("update public.afirmaciones set etiquetas_antiguas = true where id = $1", [antigua])
  const marca = (
    marca: string,
    red: string,
    valor: string,
    frase: string | null,
    certeza: string,
    lista: string | null,
  ) =>
    uno(
      c,
      `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, frase, certeza, version_id, origen)
       values ($1, $2, $3, $4, $5, $6,
               (select v.id from public.versiones_de_vocabulario v
                 where v.lista = $7 and v.estado = 'vigente'
                   and v.red = case when $7 in ('publico', 'dolor') then $3 else 'todas' end),
               'extraccion')
       returning id`,
      [nueva, marca, red, valor, frase, certeza, lista],
    )
  const emocionLinkedin = await marca("emocion", "linkedin", "escepticismo", "No me lo creo", "baja", "emocion")
  const emocionInstagram = await marca("emocion", "instagram", "curiosidad", "Abre la pregunta", "media", "emocion")
  const problema = await marca("problema", "linkedin", "rrhh_tarde", null, "media", "dolor")
  const dato = await marca("dato", "todas", "70 %", "El 70 % trabaja solo", "alta", null)
  await c.query(
    `insert into public.ganchos (afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, version_id, origen)
     select $1, 'Nadie te lo dijo.', 'Hay algo que no se dice.', 'verdad_incomoda', 'media', id, 'extraccion'
       from public.versiones_de_vocabulario where lista = 'gancho' and estado = 'vigente'`,
    [nueva],
  )
  return { nueva, antigua, vacia, emocionLinkedin, emocionInstagram, problema, dato }
}

const version = async (c: pg.PoolClient, lista: string, red = "todas") =>
  Number(
    await uno(
      c,
      "select id::text as id from public.versiones_de_vocabulario where lista = $1 and red = $2 and estado = 'vigente'",
      [lista, red],
    ),
  )

const CORREGIR = "select public.corregir_etiqueta($1::uuid, $2, $3, $4, $5, $6, $7::uuid)"
const CONFIRMAR = "select public.confirmar_etiqueta($1::uuid, $2, $3, $4::uuid)"
const QUITAR = "select public.quitar_marca($1::uuid, $2, $3, $4::uuid)"

interface Extra {
  frase?: string | null
  porQue?: string | null
  marca?: string | null
}
const argumentos = (afirmacion: string, campo: string, red: string, valor: string | null, extra: Extra = {}) => [
  afirmacion,
  campo,
  red,
  valor,
  extra.frase ?? null,
  extra.porQue ?? null,
  extra.marca ?? null,
]

const corregir = (c: pg.PoolClient, ...a: Parameters<typeof argumentos>) => c.query(CORREGIR, argumentos(...a))
const corregirFalla = (c: pg.PoolClient, ...a: Parameters<typeof argumentos>) => fallaCon(c, CORREGIR, argumentos(...a))

const registro = async (c: pg.PoolClient, afirmacion: string, campo: string) =>
  (
    await c.query<Registro>(
      `select campo, red, accion, antes, despues, frase_antes, frase_despues, por_que, certeza_antes, version_id
         from public.correcciones_de_etiqueta where afirmacion_id = $1 and campo = $2`,
      [afirmacion, campo],
    )
  ).rows

const marcaDe = async (c: pg.PoolClient, id: string) =>
  (
    await c.query<Marca>(
      "select valor, frase, certeza, por_que, origen, version_id from public.afirmacion_marcas where id = $1",
      [id],
    )
  ).rows[0]

const AUSENTE = "00000000-0000-4000-8000-000000000000"

const HELPERS = [
  "public.etiqueta_lista_de_campo(text)",
  "public.etiqueta_version_vigente(text, text)",
  "public.etiqueta_en_lista(integer, text)",
  "public.etiqueta_exigir(text, text)",
  "public.etiqueta_afirmacion(uuid)",
  "public.etiqueta_marca(uuid, text, text, uuid, boolean)",
]
const FUNCIONES = [
  "public.corregir_etiqueta(uuid, text, text, text, text, text, uuid)",
  "public.confirmar_etiqueta(uuid, text, text, uuid)",
  "public.quitar_marca(uuid, text, text, uuid)",
]

describe("who can correct", () => {
  it("lets sessions run only the three functions, and an anonymous visitor none", async () => {
    const puede = async (rol: string, funcion: string) =>
      (
        await pool.query<{ puede: boolean }>("select has_function_privilege($1, $2, 'execute') as puede", [
          rol,
          funcion,
        ])
      ).rows[0]?.puede
    for (const funcion of HELPERS) {
      expect(await puede("authenticated", funcion), funcion).toBe(false)
      expect(await puede("anon", funcion), funcion).toBe(false)
    }
    for (const funcion of FUNCIONES) {
      expect(await puede("authenticated", funcion), funcion).toBe(true)
      expect(await puede("anon", funcion), funcion).toBe(false)
    }
  })

  it("lets only Coni correct, confirm or remove: WAV and anyone else get solo_coni_corrige, and nothing changes", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      for (const sesion of [comoMantenedor, comoOtra]) {
        await asumir(c, sesion)
        const llamadas = [
          await corregirFalla(c, e.nueva, "tipo", "todas", "consejo"),
          await fallaCon(c, CONFIRMAR, [e.nueva, "tipo", "todas", null]),
          await fallaCon(c, QUITAR, [e.nueva, "problema", "linkedin", null]),
          // The role is checked before any read: a claim that does not exist says the same.
          await corregirFalla(c, AUSENTE, "tipo", "todas", "consejo"),
          await fallaCon(c, CONFIRMAR, [AUSENTE, "tipo", "todas", null]),
          await fallaCon(c, QUITAR, [AUSENTE, "problema", "linkedin", null]),
        ]
        for (const error of llamadas)
          expect({ code: error.code, message: error.message }).toEqual({
            code: "42501",
            message: "solo_coni_corrige",
          })
      }
      await asumir(c, comoPostgres)
      expect((await c.query("select tipo from public.afirmaciones where id = $1", [e.nueva])).rows[0]).toEqual({
        tipo: "dato",
      })
      expect(await marcaDe(c, e.problema)).toMatchObject({ valor: "rrhh_tarde" })
      const registros = await c.query("select id from public.correcciones_de_etiqueta where afirmacion_id = $1", [
        e.nueva,
      ])
      expect(registros.rowCount).toBe(0)
    })
  })

  it("refuses an anonymous visitor before the function runs", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })])
      await c.query("set local role anon")
      for (const error of [
        await corregirFalla(c, e.nueva, "tipo", "todas", "consejo"),
        await fallaCon(c, CONFIRMAR, [e.nueva, "tipo", "todas", null]),
        await fallaCon(c, QUITAR, [e.nueva, "problema", "linkedin", null]),
      ])
        expect(error.code).toBe("42501")
    })
  })

  it("refuses an unknown field, a network that does not fit the field, and a hidden claim", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query("update public.afirmaciones set excluida = true where id = $1", [e.antigua])
      await asumir(c, comoConi)
      expect((await corregirFalla(c, e.nueva, "titulo", "todas", "x")).message).toBe("campo_desconocido")
      expect((await corregirFalla(c, e.nueva, "emocion", "todas", "calma")).message).toBe("red_invalida")
      expect((await corregirFalla(c, e.nueva, "tipo", "linkedin", "mito")).message).toBe("red_invalida")
      expect((await corregirFalla(c, e.nueva, "dato", "instagram", null, { frase: "x" })).message).toBe("red_invalida")
      const oculta = await corregirFalla(c, e.antigua, "tipo", "todas", "mito")
      expect({ code: oculta.code, message: oculta.message }).toEqual({
        code: "P0002",
        message: "afirmacion_inexistente",
      })
    })
  })
})

describe("corregir_etiqueta", () => {
  it("corrects tipo and evidencia of an old claim and logs before, after and the list version", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      await corregir(c, e.antigua, "tipo", "todas", "consejo")
      await corregir(c, e.antigua, "evidencia", "todas", "guia_consenso")
      const fila = (await c.query("select tipo, evidencia from public.afirmaciones where id = $1", [e.antigua])).rows[0]
      expect(fila).toEqual({ tipo: "consejo", evidencia: "guia_consenso" })
      expect(await registro(c, e.antigua, "tipo")).toEqual([
        {
          campo: "tipo",
          red: "todas",
          accion: "corrige",
          antes: "dato",
          despues: "consejo",
          frase_antes: null,
          frase_despues: null,
          por_que: null,
          certeza_antes: null,
          version_id: await version(c, "tipo"),
        },
      ])
      expect(await registro(c, e.antigua, "evidencia")).toMatchObject([
        { accion: "corrige", antes: "estudio", despues: "guia_consenso", version_id: await version(c, "evidencia") },
      ])
    })
  })

  it("rejects a value outside the vigente list, sin_clasificar and another network's value included", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      for (const error of [
        await corregirFalla(c, e.nueva, "tipo", "todas", "sin_clasificar"),
        await corregirFalla(c, e.nueva, "evidencia", "todas", "corazonada"),
        await corregirFalla(c, e.nueva, "emocion", "linkedin", "nostalgia", { marca: e.emocionLinkedin }),
        await corregirFalla(c, e.nueva, "problema", "linkedin", "techo_profesional", { marca: e.problema }),
        await corregirFalla(c, e.nueva, "tipo_de_gancho", "todas", "rima"),
        await corregirFalla(c, e.nueva, "tipo", "todas", null),
      ])
        expect({ code: error.code, message: error.message }).toEqual({ code: "22023", message: "valor_fuera_de_lista" })
    })
  })

  it("asks a reason for otro and otra, and keeps it on the mark and in the log", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      const sinMotivo = await corregirFalla(c, e.nueva, "emocion", "instagram", "otra", {
        marca: e.emocionInstagram,
        porQue: "   ",
      })
      expect(sinMotivo.message).toBe("falta_por_que")
      await corregir(c, e.nueva, "emocion", "instagram", "otra", {
        marca: e.emocionInstagram,
        frase: "Abre la pregunta",
        porQue: "Es ternura, no está en la lista",
      })
      expect(await marcaDe(c, e.emocionInstagram)).toMatchObject({
        valor: "otra",
        por_que: "Es ternura, no está en la lista",
      })
      await corregir(c, e.nueva, "problema", "linkedin", "otro", { marca: e.problema, porQue: "Habla de soledad" })
      expect(await marcaDe(c, e.problema)).toMatchObject({ valor: "otro", por_que: "Habla de soledad" })
      expect(await registro(c, e.nueva, "problema")).toMatchObject([{ despues: "otro", por_que: "Habla de soledad" }])
    })
  })

  it("corrects a mark: value and phrase, certainty alta, origin coni, and logs what it was", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      await corregir(c, e.nueva, "emocion", "instagram", "sorpresa", {
        marca: e.emocionInstagram,
        frase: "Rompe la creencia",
      })
      expect(await marcaDe(c, e.emocionInstagram)).toEqual({
        valor: "sorpresa",
        frase: "Rompe la creencia",
        certeza: "alta",
        por_que: null,
        origen: "coni",
        version_id: await version(c, "emocion"),
      })
      expect(await registro(c, e.nueva, "emocion")).toEqual([
        {
          campo: "emocion",
          red: "instagram",
          accion: "corrige",
          antes: "curiosidad",
          despues: "sorpresa",
          frase_antes: "Abre la pregunta",
          frase_despues: "Rompe la creencia",
          por_que: null,
          certeza_antes: "media",
          version_id: await version(c, "emocion"),
        },
      ])
    })
  })

  it("logs a correction to the same value as confirma, and still raises the certainty", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      await corregir(c, e.nueva, "tipo", "todas", "dato")
      expect(await registro(c, e.nueva, "tipo")).toMatchObject([{ accion: "confirma", antes: "dato", despues: "dato" }])
      await corregir(c, e.nueva, "emocion", "linkedin", "escepticismo", {
        marca: e.emocionLinkedin,
        frase: "No me lo creo",
      })
      expect(await registro(c, e.nueva, "emocion")).toMatchObject([
        {
          accion: "confirma",
          antes: "escepticismo",
          despues: "escepticismo",
          frase_antes: null,
          certeza_antes: "baja",
        },
      ])
      expect(await marcaDe(c, e.emocionLinkedin)).toMatchObject({ certeza: "alta", origen: "coni" })
    })
  })

  it("adds a missing mark with the network's list version and logs agrega", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      await corregir(c, e.nueva, "publico", "instagram", "se_reinventa", { frase: "Cambia de rubro a los 40" })
      const { rows } = await c.query<Marca>(
        `select valor, frase, certeza, por_que, origen, version_id from public.afirmacion_marcas
          where afirmacion_id = $1 and marca = 'publico' and red = 'instagram'`,
        [e.nueva],
      )
      expect(rows).toEqual([
        {
          valor: "se_reinventa",
          frase: "Cambia de rubro a los 40",
          certeza: "alta",
          por_que: null,
          origen: "coni",
          version_id: await version(c, "publico", "instagram"),
        },
      ])
      expect(await registro(c, e.nueva, "publico")).toMatchObject([
        { accion: "agrega", antes: null, despues: "se_reinventa", frase_despues: "Cambia de rubro a los 40" },
      ])
    })
  })

  it("changes only the phrase of a dato, and asks for one", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      expect((await corregirFalla(c, e.nueva, "dato", "todas", null, { marca: e.dato, frase: " " })).message).toBe(
        "falta_frase",
      )
      await corregir(c, e.nueva, "dato", "todas", "otra cosa", { marca: e.dato, frase: "El 68 % trabaja solo" })
      expect(await marcaDe(c, e.dato)).toMatchObject({ valor: "70 %", frase: "El 68 % trabaja solo", version_id: null })
      expect(await registro(c, e.nueva, "dato")).toMatchObject([
        {
          accion: "corrige",
          antes: "70 %",
          despues: "70 %",
          frase_antes: "El 70 % trabaja solo",
          frase_despues: "El 68 % trabaja solo",
          version_id: null,
        },
      ])
      await corregir(c, e.nueva, "caso", "todas", null, { frase: "Una gerenta que dejó de ir a la oficina" })
      expect(await registro(c, e.nueva, "caso")).toMatchObject([
        { accion: "agrega", despues: "Una gerenta que dejó de ir a la oficina" },
      ])
    })
  })

  it("lets Coni add a mark to a claim extracted after this change with zero marks: it is new", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      const fila = await c.query("select etiquetas_antiguas from public.afirmaciones where id = $1", [e.vacia])
      expect(fila.rows).toEqual([{ etiquetas_antiguas: false }])
      await asumir(c, comoConi)
      await corregir(c, e.vacia, "emocion", "linkedin", "calma", { frase: "Respira" })
      expect(await registro(c, e.vacia, "emocion")).toMatchObject([{ accion: "agrega", despues: "calma" }])
      const marcas = await c.query("select valor, origen from public.afirmacion_marcas where afirmacion_id = $1", [
        e.vacia,
      ])
      expect(marcas.rows).toEqual([{ valor: "calma", origen: "coni" }])
    })
  })

  it("rejects marks on an old claim, in the three functions", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      for (const error of [
        await corregirFalla(c, e.antigua, "emocion", "linkedin", "calma"),
        await fallaCon(c, CONFIRMAR, [e.antigua, "emocion", "linkedin", null]),
        await fallaCon(c, QUITAR, [e.antigua, "emocion", "linkedin", null]),
      ])
        expect({ code: error.code, message: error.message }).toEqual({ code: "22023", message: "afirmacion_antigua" })
    })
  })

  it("corrects the hook type, and the hooks library shows it at once", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      await corregir(c, e.nueva, "tipo_de_gancho", "todas", "escena")
      const vista = await c.query("select tipo, certeza from public.biblioteca_de_ganchos where afirmacion_id = $1", [
        e.nueva,
      ])
      expect(vista.rows).toEqual([{ tipo: "escena", certeza: "alta" }])
      expect(await registro(c, e.nueva, "tipo_de_gancho")).toMatchObject([
        { accion: "corrige", antes: "verdad_incomoda", despues: "escena", certeza_antes: "media" },
      ])
      await corregir(c, e.nueva, "tipo_de_gancho", "todas", "ninguno")
      const origen = await c.query("select tipo, origen from public.ganchos where afirmacion_id = $1", [e.nueva])
      expect(origen.rows).toEqual([{ tipo: "ninguno", origen: "coni" }])
      const sinGancho = await corregirFalla(c, e.antigua, "tipo_de_gancho", "todas", "escena")
      expect({ code: sinGancho.code, message: sinGancho.message }).toEqual({ code: "P0002", message: "sin_gancho" })
    })
  })

  it("asks which mark when a network has two, and refuses another claim's mark", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      const segundo = await uno(
        c,
        `insert into public.afirmacion_marcas (afirmacion_id, marca, red, valor, frase, certeza, origen)
         values ($1, 'dato', 'todas', '3 de 4', 'Tres de cada cuatro', 'media', 'extraccion') returning id`,
        [e.nueva],
      )
      await asumir(c, comoConi)
      expect((await corregirFalla(c, e.nueva, "dato", "todas", null, { frase: "x" })).message).toBe("marca_ambigua")
      await corregir(c, e.nueva, "dato", "todas", null, { marca: segundo, frase: "Tres de cada cinco" })
      expect(await marcaDe(c, segundo)).toMatchObject({ frase: "Tres de cada cinco" })
      expect(await marcaDe(c, e.dato)).toMatchObject({ frase: "El 70 % trabaja solo" })
      // tipo, evidencia and the hook have no mark rows: a stray id is ignored there.
      await corregir(c, e.antigua, "tipo", "todas", "mito", { marca: e.dato })
      expect((await c.query("select tipo from public.afirmaciones where id = $1", [e.antigua])).rows[0]).toEqual({
        tipo: "mito",
      })
      const deOtra = await corregirFalla(c, e.nueva, "emocion", "linkedin", "calma", { marca: e.emocionInstagram })
      expect({ code: deOtra.code, message: deOtra.message }).toEqual({ code: "P0002", message: "sin_marca" })
    })
  })
})

describe("confirmar_etiqueta", () => {
  it("confirms a mark and a hook: certainty alta, origin coni, a confirma row with the certainty it had", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      await c.query(CONFIRMAR, [e.nueva, "emocion", "linkedin", e.emocionLinkedin])
      expect(await marcaDe(c, e.emocionLinkedin)).toMatchObject({
        valor: "escepticismo",
        certeza: "alta",
        origen: "coni",
      })
      expect(await registro(c, e.nueva, "emocion")).toEqual([
        {
          campo: "emocion",
          red: "linkedin",
          accion: "confirma",
          antes: "escepticismo",
          despues: "escepticismo",
          frase_antes: null,
          frase_despues: null,
          por_que: null,
          certeza_antes: "baja",
          version_id: await version(c, "emocion"),
        },
      ])
      await c.query(CONFIRMAR, [e.nueva, "tipo_de_gancho", "todas", null])
      const gancho = await c.query("select tipo, certeza, origen from public.ganchos where afirmacion_id = $1", [
        e.nueva,
      ])
      expect(gancho.rows).toEqual([{ tipo: "verdad_incomoda", certeza: "alta", origen: "coni" }])
      expect(await registro(c, e.nueva, "tipo_de_gancho")).toMatchObject([
        { accion: "confirma", certeza_antes: "media" },
      ])
    })
  })

  it("confirms tipo without changing it, and refuses what is sin_clasificar, a missing mark and a missing hook", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await c.query("update public.afirmaciones set evidencia = 'sin_clasificar' where id = $1", [e.antigua])
      await asumir(c, comoConi)
      await c.query(CONFIRMAR, [e.antigua, "tipo", "todas", null])
      expect(await registro(c, e.antigua, "tipo")).toMatchObject([
        { accion: "confirma", antes: "dato", despues: "dato", version_id: await version(c, "tipo") },
      ])
      expect((await fallaCon(c, CONFIRMAR, [e.antigua, "evidencia", "todas", null])).message).toBe(
        "valor_fuera_de_lista",
      )
      expect((await fallaCon(c, CONFIRMAR, [e.nueva, "publico", "instagram", null])).message).toBe("sin_marca")
      expect((await fallaCon(c, CONFIRMAR, [e.antigua, "tipo_de_gancho", "todas", null])).message).toBe("sin_gancho")
    })
  })
})

describe("quitar_marca", () => {
  it("removes a mark and logs quita; the claim stays new, so marks can be added after the last one", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      await c.query(QUITAR, [e.nueva, "problema", "linkedin", e.problema])
      expect(await marcaDe(c, e.problema)).toBeUndefined()
      expect(await registro(c, e.nueva, "problema")).toEqual([
        {
          campo: "problema",
          red: "linkedin",
          accion: "quita",
          antes: "rrhh_tarde",
          despues: null,
          frase_antes: null,
          frase_despues: null,
          por_que: null,
          certeza_antes: "media",
          version_id: await version(c, "dolor", "linkedin"),
        },
      ])
      for (const [marca, red, id] of [
        ["emocion", "linkedin", e.emocionLinkedin],
        ["emocion", "instagram", e.emocionInstagram],
        ["dato", "todas", e.dato],
      ] as const)
        await c.query(QUITAR, [e.nueva, marca, red, id])
      await corregir(c, e.nueva, "emocion", "linkedin", "calma")
      expect(await registro(c, e.nueva, "emocion")).toContainEqual(expect.objectContaining({ accion: "agrega" }))
    })
  })

  it("refuses a mark that is not there and a field that is not a mark", async () => {
    await como(comoPostgres, async (c) => {
      const e = await sembrar(c)
      await asumir(c, comoConi)
      const ausente = await fallaCon(c, QUITAR, [e.nueva, "caso", "todas", null])
      expect({ code: ausente.code, message: ausente.message }).toEqual({ code: "P0002", message: "sin_marca" })
      expect((await fallaCon(c, QUITAR, [e.nueva, "tipo", "todas", null])).message).toBe("campo_desconocido")
    })
  })
})
