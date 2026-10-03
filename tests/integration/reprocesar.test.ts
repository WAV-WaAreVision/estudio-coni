import type pg from "pg"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { procesarMaterial } from "@/lib/ingesta/procesar"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, fallaCon, pool } from "./db"
import {
  almacenEnMemoria,
  crearMaterial,
  deps,
  ficha,
  limpiar,
  material,
  simularClaude,
  simularVoyage,
  TEXTO_CHILENO,
  texto,
} from "./procesar-comun"

const temas: string[] = []

afterEach(async () => {
  await limpiar()
  for (const id of temas.splice(0)) await pool.query("delete from public.temas where id = $1", [id])
})
afterAll(() => pool.end())

const vector = (valor: number, posicion = 0) =>
  `[${Array.from({ length: 1024 }, (_, i) => (i === posicion ? valor : 0)).join(",")}]`

async function id(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params)
  const valor = rows[0]?.id
  if (!valor) throw new Error(`Sin id para: ${sql}`)
  return valor
}

async function materialEn(c: pg.PoolClient, estado: string, rol = "referente"): Promise<string> {
  await asumir(c, comoPostgres)
  return id(
    c,
    `insert into public.materiales (tipo, autor_id, categoria_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por,
       estado, motivo_fallo, costo_estimado_usd, costo_confirmado_en)
     select 'documento', (select id from public.autores where tipo = 'coni'), id, $2, 'x', now(), $3, $1, 'viejo', 0.8, now()
     from public.categorias limit 1 returning id`,
    [estado, rol, CONI],
  )
}

const afirmacionEn = (c: pg.PoolClient, materialId: string, tema: string | null, vec: string) =>
  id(
    c,
    `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, vector)
     values ($1, (select id from public.autores where tipo = 'coni'), 1, '{"pagina": 1}', 'Una idea.', 'cita', 'dato', 'opinion', $2, $3::extensions.vector)
     returning id`,
    [materialId, tema, vec],
  )

const temaEn = (c: pg.PoolClient, nombre: string, vec: string) =>
  id(
    c,
    "insert into public.temas (nombre, descripcion, centroide) values ($1, 'd', $2::extensions.vector) returning id",
    [nombre, vec],
  )

describe("reprocesar_material", () => {
  it.each([
    ["Coni", comoConi],
    ["the maintainer", comoMantenedor],
  ])("lets %s reprocess a ready material: back to processing, cost gate and reason cleared", async (_n, sesion) => {
    await como(comoPostgres, async (c) => {
      const materialId = await materialEn(c, "listo")
      await asumir(c, sesion)
      await c.query("select public.reprocesar_material($1)", [materialId])
      const { rows } = await c.query(
        `select estado, motivo_fallo, costo_estimado_usd, costo_confirmado_en from public.materiales where id = $1`,
        [materialId],
      )
      expect(rows[0]).toEqual({
        estado: "procesando",
        motivo_fallo: null,
        costo_estimado_usd: null,
        costo_confirmado_en: null,
      })
    })
  })

  it.each([
    ["processing", "procesando"],
    ["failed", "fallido"],
  ])("rejects a %s material with 22023 no_reprocesable", async (_n, estado) => {
    await como(comoPostgres, async (c) => {
      const materialId = await materialEn(c, estado)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.reprocesar_material($1)", [materialId])
      expect(error.code).toBe("22023")
      expect(error.message).toBe("no_reprocesable")
    })
  })

  it("rejects a material that does not exist with 22023 no_reprocesable", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "select public.reprocesar_material(gen_random_uuid())")
      expect(error.message).toBe("no_reprocesable")
    })
  })

  it("refuses non-members with 42501", async () => {
    await como(comoPostgres, async (c) => {
      const materialId = await materialEn(c, "listo")
      await asumir(c, comoOtra)
      expect((await fallaCon(c, "select public.reprocesar_material($1)", [materialId])).code).toBe("42501")
    })
  })

  it("deletes the claims of the material and leaves other materials' claims alone", async () => {
    await como(comoPostgres, async (c) => {
      const mio = await materialEn(c, "listo")
      const otro = await materialEn(c, "listo")
      await afirmacionEn(c, mio, null, vector(1))
      const ajena = await afirmacionEn(c, otro, null, vector(1))
      await asumir(c, comoConi)
      await c.query("select public.reprocesar_material($1)", [mio])
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ id: string }>(
        "select id from public.afirmaciones where material_id in ($1, $2)",
        [mio, otro],
      )
      expect(rows.map((r) => r.id)).toEqual([ajena])
    })
  })

  it("deletes the topics left without claims, with the names merged into them, and keeps the others", async () => {
    await como(comoPostgres, async (c) => {
      const mio = await materialEn(c, "listo")
      const otro = await materialEn(c, "listo")
      const vacio = await temaEn(c, "Se queda vacío", vector(1))
      const absorbido = await id(
        c,
        "insert into public.temas (nombre, descripcion, centroide, fusionado_en) values ('Absorbido', 'd', $1::extensions.vector, $2) returning id",
        [vector(1), vacio],
      )
      const compartido = await temaEn(c, "Se queda con una", vector(1, 1))
      await afirmacionEn(c, mio, vacio, vector(1))
      await afirmacionEn(c, mio, compartido, vector(1, 1))
      await afirmacionEn(c, otro, compartido, vector(1, 1))
      await asumir(c, comoConi)
      await c.query("select public.reprocesar_material($1)", [mio])
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ id: string }>("select id from public.temas where id = any($1)", [
        [vacio, absorbido, compartido],
      ])
      expect(rows.map((r) => r.id)).toEqual([compartido])
    })
  })

  it("recomputes the centroid of a topic that keeps claims from other materials", async () => {
    await como(comoPostgres, async (c) => {
      const mio = await materialEn(c, "listo")
      const otro = await materialEn(c, "listo")
      const tema = await temaEn(c, "Mezclado", vector(1))
      await afirmacionEn(c, mio, tema, vector(1, 0))
      await afirmacionEn(c, otro, tema, vector(1, 1))
      await asumir(c, comoConi)
      await c.query("select public.reprocesar_material($1)", [mio])
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ v: string }>("select centroide::text as v from public.temas where id = $1", [
        tema,
      ])
      const componentes = (rows[0]?.v ?? "").slice(1, -1).split(",").map(Number)
      expect(componentes[0]).toBeCloseTo(0, 5)
      expect(componentes[1]).toBeCloseTo(1, 5)
    })
  })

  it("deletes the card of a material whose role is not estrategia, and keeps it when it is", async () => {
    await como(comoPostgres, async (c) => {
      const cambiado = await materialEn(c, "listo", "referente")
      const estrategia = await materialEn(c, "listo", "estrategia")
      for (const m of [cambiado, estrategia])
        await c.query(
          "insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente) values ($1, 'r', '{}', '[]', '{}')",
          [m],
        )
      await asumir(c, comoConi)
      await c.query("select public.reprocesar_material($1)", [cambiado])
      await c.query("select public.reprocesar_material($1)", [estrategia])
      await asumir(c, comoPostgres)
      const { rows } = await c.query<{ material_id: string }>(
        "select material_id from public.fichas where material_id = any($1)",
        [[cambiado, estrategia]],
      )
      expect(rows.map((r) => r.material_id)).toEqual([estrategia])
    })
  })
})

/** Commits the RPC as Coni, like PostgREST would: the processing tests read what the pool sees. */
async function reprocesarComoConi(materialId: string): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await asumir(c, comoConi)
    await c.query("select public.reprocesar_material($1)", [materialId])
    await c.query("commit")
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    await c.query("reset role")
    c.release()
  }
}

const conLlave = { llaveVoyage: () => "pa-de-prueba" }

async function cuenta(sql: string, materialId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(sql, [materialId])
  return Number(rows[0]?.n)
}

describe("procesar un material reprocesado", () => {
  it("reuses the stored extraction: the source is not read again, and the claims come from the stored text", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    simularVoyage()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await procesarMaterial(await deps(almacen, conLlave), id)
    await pool.query("update public.materiales set texto_pegado = 'Otro texto distinto del primero.' where id = $1", [
      id,
    ])

    await reprocesarComoConi(id)
    const resultado = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(texto(almacen, id, "partes-original.json")).toContain("deseo sexual")
    expect(texto(almacen, id, "partes-original.json")).not.toContain("Otro texto")
    expect(claude.afirmaciones.some((t) => t.includes("Otro texto"))).toBe(false)
    expect(await cuenta("select count(*) as n from public.afirmaciones where material_id = $1", id)).toBe(1)
  })

  it("asks for the cost confirmation again, as a long material does", async () => {
    const almacen = almacenEnMemoria()
    simularClaude()
    const id = await crearMaterial(almacen, {
      tipo: "documento",
      texto_pegado: "Hablar de lo que se necesita. ".repeat(20_000),
    })
    await pool.query("update public.materiales set costo_confirmado_en = now() where id = $1", [id])
    await procesarMaterial(await deps(almacen), id)
    expect((await material(id)).estado).toBe("listo")

    await reprocesarComoConi(id)
    const resultado = await procesarMaterial(await deps(almacen), id)

    expect(resultado).toEqual({ resultado: "esperando_confirmacion" })
    expect((await material(id)).estado).toBe("procesando")
  })

  it("turns an estrategia material into claims and drops its card when the role changes to referente", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    simularVoyage()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO, rol: "estrategia" })
    await procesarMaterial(await deps(almacen, conLlave), id)
    expect(await ficha(id)).toBeDefined()

    await pool.query("update public.materiales set rol = 'referente' where id = $1", [id])
    await reprocesarComoConi(id)
    const resultado = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(claude.afirmaciones).toHaveLength(1)
    expect(await ficha(id)).toBeUndefined()
    expect(await cuenta("select count(*) as n from public.afirmaciones where material_id = $1", id)).toBe(1)
  })

  it("writes a card and leaves no claims or empty topics when the role changes to estrategia", async () => {
    const almacen = almacenEnMemoria()
    const claude = simularClaude()
    simularVoyage()
    const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
    await procesarMaterial(await deps(almacen, conLlave), id)
    const tema = await pool.query<{ id: string }>(
      "insert into public.temas (nombre, descripcion, centroide) values ('Del material', 'd', $1::extensions.vector) returning id",
      [vector(1)],
    )
    const temaId = tema.rows[0]?.id ?? ""
    temas.push(temaId)
    await pool.query("update public.afirmaciones set tema_id = $2 where material_id = $1", [id, temaId])

    await pool.query("update public.materiales set rol = 'estrategia' where id = $1", [id])
    await reprocesarComoConi(id)
    const resultado = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(resultado).toEqual({ resultado: "listo" })
    expect(claude.fichas).toHaveLength(1)
    expect((await ficha(id))?.resumen).toBe("Un resumen de la fuente.")
    expect(await cuenta("select count(*) as n from public.afirmaciones where material_id = $1", id)).toBe(0)
    const { rows } = await pool.query("select 1 from public.temas where id = $1", [temaId])
    expect(rows).toEqual([])
  })
})
