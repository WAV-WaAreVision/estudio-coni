import type pg from "pg"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { parsearVector } from "@/lib/ingesta/agrupar"
import { asumir, como, comoConi, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { afirmacion, candidata, prueba, reiniciarHuellas, tema, texto, vec } from "./huellas-comun"

afterAll(() => pool.end())
beforeEach(reiniciarHuellas)
afterEach(reiniciarHuellas)

type Cambio = { asignaciones_antes: string; asignaciones_despues: string; version: number }
const aplicar = async (c: pg.PoolClient, id: string): Promise<Cambio> =>
  (await c.query("select public.aplicar_prueba_de_modelo($1) as r", [id])).rows[0]?.r
const revertir = async (c: pg.PoolClient, id: string): Promise<Cambio> =>
  (await c.query("select public.revertir_prueba_de_modelo($1) as r", [id])).rows[0]?.r

async function vectores(c: pg.PoolClient) {
  const { rows } = await c.query<{ id: string; v: string | null; modelo: string | null; tema_id: string | null }>(
    "select id, vector::text as v, modelo_vector as modelo, tema_id from public.afirmaciones order by id",
  )
  return rows
}
async function centroides(c: pg.PoolClient) {
  const { rows } = await c.query<{ id: string; v: string; modelo: string }>(
    "select id, centroide::text as v, modelo_centroide as modelo from public.temas order by id",
  )
  return rows
}
async function vigente(c: pg.PoolClient) {
  const { rows } = await c.query(
    "select version, modelo, tema::float8 as tema, puente_max::float8 as puente_max, prueba_id from public.calibraciones_de_parecido where vigente",
  )
  return rows[0]
}

/** A topic with two claims, a pending claim and a claim without a vector; every claim with a vector has a candidate. */
async function escena() {
  // The centroid is the plain mean of the topic's claims, as the application keeps it.
  const v1 = vec({ 0: 1 })
  const v2 = vec({ 0: 0.9, 1: 0.1 })
  const t = await tema(
    "Deseo",
    v1.map((x, i) => (x + (v2[i] ?? 0)) / 2),
  )
  const a1 = await afirmacion(v1, { tema: t })
  const a2 = await afirmacion(v2, { tema: t })
  const suelta = await afirmacion(vec({ 5: 1 }))
  await afirmacion(null)
  const p = await prueba()
  await candidata(p, a1, vec({ 2: 1 }))
  await candidata(p, a2, vec({ 3: 1 }))
  await candidata(p, suelta, vec({ 4: 1 }))
  return { t, a1, a2, suelta, p }
}

describe("aplicar_prueba_de_modelo", () => {
  it("saves what was live, swaps in the candidates and the mean centroids, and makes the dry run's thresholds vigente", async () => {
    const { t, a1, p } = await escena()
    await como(comoServicio, async (c) => {
      const r = await aplicar(c, p)
      expect(r.version).toBe(2)
      expect(r.asignaciones_despues).toBe(r.asignaciones_antes)
      await asumir(c, comoPostgres)
      const afs = await vectores(c)
      expect(afs.filter((a) => a.v !== null).every((a) => a.modelo === "voyage-4")).toBe(true)
      expect(parsearVector(afs.find((a) => a.id === a1)?.v ?? "")[2]).toBeCloseTo(1)
      const [centroide] = await centroides(c)
      expect(centroide?.id).toBe(t)
      expect(centroide?.modelo).toBe("voyage-4")
      const valores = parsearVector(centroide?.v ?? "")
      expect([valores[2], valores[3]].map((x) => Number(x?.toFixed(4)))).toEqual([0.5, 0.5])
      expect(await vigente(c)).toEqual({ version: 2, modelo: "voyage-4", tema: 0.7, puente_max: 0.7, prueba_id: p })
      const guardadas = await c.query(
        "select count(*)::int as n, min(version_calibracion) as v from public.huellas_anteriores where prueba_id = $1",
        [p],
      )
      expect(guardadas.rows[0]).toEqual({ n: 4, v: 1 })
      const estado = await c.query("select estado, version_anterior from public.pruebas_de_modelo where id = $1", [p])
      expect(estado.rows[0]).toEqual({ estado: "aplicada", version_anterior: 1 })
    })
  })

  it("gives a merged topic the centroid of the topic it points at", async () => {
    const { t, p } = await escena()
    const fusionado = await tema("Ganas", vec({ 9: 1 }), { fusionado: t })
    await como(comoServicio, async (c) => {
      await aplicar(c, p)
      await asumir(c, comoPostgres)
      const filas = await centroides(c)
      expect(filas.find((f) => f.id === fusionado)?.v).toBe(filas.find((f) => f.id === t)?.v)
      expect(filas.find((f) => f.id === fusionado)?.modelo).toBe("voyage-4")
    })
  })

  it("refuses, and changes nothing, when a claim with a vector has no candidate", async () => {
    const { p } = await escena()
    await afirmacion(vec({ 6: 1 }))
    await como(comoServicio, async (c) => {
      const antes = await vectores(c)
      const error = await fallaCon(c, "select public.aplicar_prueba_de_modelo($1)", [p])
      expect(error.message).toBe("faltan_candidatas")
      expect(await vectores(c)).toEqual(antes)
      expect((await vigente(c))?.version).toBe(1)
    })
  })

  it("refuses, and changes nothing, when a candidate is stamped with another model than the dry run's", async () => {
    const { p, a1 } = await escena()
    await pool.query(
      "update public.huellas_candidatas set modelo = 'voyage-3.5' where prueba_id = $1 and afirmacion_id = $2",
      [p, a1],
    )
    await como(comoServicio, async (c) => {
      const antes = await vectores(c)
      const error = await fallaCon(c, "select public.aplicar_prueba_de_modelo($1)", [p])
      expect(error.message).toBe("faltan_candidatas")
      expect(await vectores(c)).toEqual(antes)
    })
  })

  it("refuses an active topic whose claims have no vector", async () => {
    const { p } = await escena()
    const vacio = await tema("Celos", vec({ 7: 1 }))
    await afirmacion(null, { tema: vacio })
    await como(comoServicio, async (c) => {
      expect((await fallaCon(c, "select public.aplicar_prueba_de_modelo($1)", [p])).message).toBe("falta_centroide")
    })
  })

  it("refuses a dry run that is not ready, is older than 30 days, or tries the vigente model", async () => {
    const { p } = await escena()
    await pool.query("update public.pruebas_de_modelo set estado = 'descartada' where id = $1", [p])
    const vencida = await prueba({ creada: new Date(Date.now() - 31 * 86_400_000).toISOString() })
    const mismoModelo = await prueba({ modelo: "voyage-3.5" })
    await como(comoServicio, async (c) => {
      expect((await fallaCon(c, "select public.aplicar_prueba_de_modelo($1)", [p])).message).toBe("prueba_no_lista")
      expect((await fallaCon(c, "select public.aplicar_prueba_de_modelo($1)", [vencida])).message).toBe(
        "prueba_vencida",
      )
      expect((await fallaCon(c, "select public.aplicar_prueba_de_modelo($1)", [mismoModelo])).message).toBe(
        "modelo_ya_vigente",
      )
    })
  })
})

describe("revertir_prueba_de_modelo", () => {
  it("restores exactly the vectors, the centroids, the calibration and the model of before", async () => {
    const { p } = await escena()
    await como(comoServicio, async (c) => {
      await asumir(c, comoPostgres)
      const vectoresAntes = await vectores(c)
      const centroidesAntes = await centroides(c)
      await asumir(c, comoServicio)
      await aplicar(c, p)
      const r = await revertir(c, p)
      expect(r.version).toBe(1)
      expect(r.asignaciones_despues).toBe(r.asignaciones_antes)
      await asumir(c, comoPostgres)
      expect(await vectores(c)).toEqual(vectoresAntes)
      expect(await centroides(c)).toEqual(centroidesAntes)
      expect((await vigente(c))?.version).toBe(1)
      const estado = await c.query(
        "select estado, revertida_en is not null as fecha from public.pruebas_de_modelo where id = $1",
        [p],
      )
      expect(estado.rows[0]).toEqual({ estado: "revertida", fecha: true })
    })
  })

  it("needs the old vector of a claim that arrived after the switch, and a new topic takes the mean of its restored claims", async () => {
    const { p } = await escena()
    await como(comoServicio, async (c) => {
      await aplicar(c, p)
      await asumir(c, comoPostgres)
      const nuevo = (
        await c.query(
          "insert into public.temas (nombre, descripcion, centroide) values ('Nuevo', 'd', $1::extensions.vector) returning id",
          [texto(vec({ 8: 1 }))],
        )
      ).rows[0]?.id
      const tarde = (
        await c.query(
          `insert into public.afirmaciones (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, vector)
         select material_id, autor_id, 0, '{"pagina": 1}', 'Tarde', 'cita', 'consejo', 'opinion', $1, $2::extensions.vector
         from public.afirmaciones limit 1 returning id`,
          [nuevo, texto(vec({ 8: 1 }))],
        )
      ).rows[0]?.id
      await asumir(c, comoServicio)
      expect((await fallaCon(c, "select public.revertir_prueba_de_modelo($1)", [p])).message).toBe("faltan_anteriores")
      await asumir(c, comoPostgres)
      await c.query(
        `insert into public.huellas_anteriores (prueba_id, afirmacion_id, modelo, vector, version_calibracion)
         values ($1, $2, 'voyage-3.5', $3::extensions.vector, 1)`,
        [p, tarde, texto(vec({ 9: 1 }))],
      )
      await asumir(c, comoServicio)
      await revertir(c, p)
      await asumir(c, comoPostgres)
      const filas = await centroides(c)
      expect(parsearVector(filas.find((f) => f.id === nuevo)?.v ?? "")[9]).toBeCloseTo(1)
      expect(filas.every((f) => f.modelo === "voyage-3.5")).toBe(true)
    })
  })

  it("recomputes the centroid of a topic that took a claim after the switch, as the plain mean of the restored vectors", async () => {
    const { t, a1, a2, suelta, p } = await escena()
    await como(comoServicio, async (c) => {
      await aplicar(c, p)
      await asumir(c, comoPostgres)
      await c.query("update public.afirmaciones set tema_id = $1 where id = $2", [t, suelta])
      await asumir(c, comoServicio)
      await revertir(c, p)
      await asumir(c, comoPostgres)
      const restaurados = (await vectores(c)).filter((v) => [a1, a2, suelta].includes(v.id))
      const media = Array.from(
        { length: 1024 },
        (_, i) => restaurados.reduce((suma, v) => suma + (parsearVector(v.v ?? "")[i] ?? 0), 0) / restaurados.length,
      )
      const centroide = parsearVector((await centroides(c)).find((f) => f.id === t)?.v ?? "")
      for (const i of [0, 1, 5]) expect(centroide[i]).toBeCloseTo(media[i] ?? Number.NaN, 5)
    })
  })

  it("refuses when a saved vector is stamped with another model than the calibration it goes back to", async () => {
    const { p, a1 } = await escena()
    await como(comoServicio, async (c) => {
      await aplicar(c, p)
      await asumir(c, comoPostgres)
      await c.query(
        "update public.huellas_anteriores set modelo = 'voyage-4' where prueba_id = $1 and afirmacion_id = $2",
        [p, a1],
      )
      const antes = await vectores(c)
      await asumir(c, comoServicio)
      expect((await fallaCon(c, "select public.revertir_prueba_de_modelo($1)", [p])).message).toBe("faltan_anteriores")
      await asumir(c, comoPostgres)
      expect(await vectores(c)).toEqual(antes)
    })
  })

  it("refuses after 30 days and refuses a dry run that was never applied", async () => {
    const { p } = await escena()
    const otra = await prueba()
    await como(comoServicio, async (c) => {
      await aplicar(c, p)
      expect((await fallaCon(c, "select public.revertir_prueba_de_modelo($1)", [otra])).message).toBe(
        "prueba_no_aplicada",
      )
      await asumir(c, comoPostgres)
      await c.query("update public.pruebas_de_modelo set aplicada_en = now() - interval '31 days' where id = $1", [p])
      await asumir(c, comoServicio)
      expect((await fallaCon(c, "select public.revertir_prueba_de_modelo($1)", [p])).message).toBe("plazo_vencido")
    })
  })
})

describe("afirmaciones_sin_huella", () => {
  it("lists the claims with a vector that have no candidate (or no saved vector) for the dry run", async () => {
    const { p } = await escena()
    const nueva = await afirmacion(vec({ 6: 1 }), { texto: "Nueva" })
    await como(comoServicio, async (c) => {
      const candidatas = await c.query("select id, texto from public.afirmaciones_sin_huella($1, 'candidata')", [p])
      expect(candidatas.rows).toEqual([{ id: nueva, texto: "Nueva" }])
      const anteriores = await c.query(
        "select count(*)::int as n from public.afirmaciones_sin_huella($1, 'anterior')",
        [p],
      )
      expect(anteriores.rows[0]?.n).toBe(4)
    })
  })
})

describe("limpiar_huellas_de_prueba", () => {
  it("deletes saved vectors 30 days after a switch and candidates of discarded or old dry runs", async () => {
    const { p } = await escena()
    const descartada = await prueba()
    const s = await afirmacion(vec({ 6: 1 }))
    await candidata(p, s, vec({ 6: 1 }))
    await candidata(descartada, s, vec({ 6: 1 }))
    await pool.query("update public.pruebas_de_modelo set estado = 'descartada' where id = $1", [descartada])
    await como(comoServicio, async (c) => {
      await aplicar(c, p)
      const hoy = await c.query("select public.limpiar_huellas_de_prueba(now()) as r")
      expect(hoy.rows[0]?.r).toEqual({ anteriores: 0, candidatas: 1 })
      const despues = await c.query("select public.limpiar_huellas_de_prueba(now() + interval '31 days') as r")
      expect(despues.rows[0]?.r).toEqual({ anteriores: 5, candidatas: 4 })
    })
  })
})

describe("who can call them", () => {
  it("is the service role only", async () => {
    const { p } = await escena()
    await como(comoConi, async (c) => {
      for (const sql of [
        "select public.aplicar_prueba_de_modelo($1)",
        "select public.revertir_prueba_de_modelo($1)",
        "select * from public.afirmaciones_sin_huella($1, 'candidata')",
      ]) {
        expect((await fallaCon(c, sql, [p])).code).toBe("42501")
      }
      expect((await fallaCon(c, "select public.limpiar_huellas_de_prueba(now())")).code).toBe("42501")
    })
  })
})
