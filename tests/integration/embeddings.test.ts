import { HttpResponse, http } from "msw"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { procesarMaterial } from "@/lib/ingesta/procesar"
import { servidor } from "../msw"
import { CONI, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import {
  almacenEnMemoria,
  crearMaterial,
  deps,
  gastos,
  limpiar,
  material,
  simularClaude,
  TEXTO_CHILENO,
} from "./procesar-comun"

afterEach(limpiar)
afterAll(() => pool.end())

const URL_VOYAGE = "https://api.voyageai.com/v1/embeddings"
const vector = (valor: number) => Array.from({ length: 1024 }, () => valor)

interface LlamadasVoyage {
  n: number
  entradas: string[][]
  tipos: string[]
}

function simularVoyage(estado = 200): LlamadasVoyage {
  const llamadas: LlamadasVoyage = { n: 0, entradas: [], tipos: [] }
  servidor.use(
    http.post(URL_VOYAGE, async ({ request }) => {
      llamadas.n += 1
      const cuerpo = (await request.json()) as { input: string[]; input_type: string }
      llamadas.entradas.push(cuerpo.input)
      llamadas.tipos.push(cuerpo.input_type)
      if (estado !== 200) return HttpResponse.json({ detail: "no" }, { status: estado })
      return HttpResponse.json({
        data: cuerpo.input.map((_, index) => ({ embedding: vector(0.5), index })),
        usage: { total_tokens: 1_000_000 },
      })
    }),
  )
  return llamadas
}

const conLlave = { llaveVoyage: () => "pa-de-prueba" }

async function embedding(id: string) {
  const { rows } = await pool.query<{ modelo: string }>(
    "select modelo from public.embeddings_ficha where material_id = $1",
    [id],
  )
  return rows[0]
}

async function pendientes(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ v: boolean }>(
    "select vinculos_pendientes as v from public.materiales where id = $1",
    [id],
  )
  return rows[0]?.v ?? false
}

async function nuevo() {
  const almacen = almacenEnMemoria()
  const id = await crearMaterial(almacen, { tipo: "documento", texto_pegado: TEXTO_CHILENO })
  return { almacen, id }
}

describe("esquema de embeddings", () => {
  it("lets Coni and the maintainer read but not write, and the service write", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    simularVoyage()
    await procesarMaterial(await deps(almacen, conLlave), id)

    for (const sesion of [comoConi, comoMantenedor]) {
      await como(sesion, async (c) => {
        const { rows } = await c.query("select material_id from public.embeddings_ficha where material_id = $1", [id])
        expect(rows).toHaveLength(1)
        const e = await fallaCon(c, "delete from public.embeddings_ficha where material_id = $1", [id])
        expect(e.code).toBe("42501")
      })
    }
    await como(comoServicio, async (c) => {
      const r = await c.query("update public.embeddings_ficha set modelo = 'x' where material_id = $1", [id])
      expect(r.rowCount).toBe(1)
    })
  })

  it("does not let Coni set vinculos_pendientes", async () => {
    const { almacen, id } = await nuevo()
    await como(comoConi, async (c) => {
      const e = await fallaCon(c, "update public.materiales set vinculos_pendientes = true where id = $1", [id])
      expect(e.code).toBe("42501")
    })
    expect(almacen).toBeDefined()
  })

  it("has an HNSW cosine index on the vector", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'embeddings_ficha'",
    )
    expect(rows.some((r) => /hnsw/i.test(r.indexdef) && /vector_cosine_ops/.test(r.indexdef))).toBe(true)
  })

  it("deletes the embedding with its material", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    simularVoyage()
    await procesarMaterial(await deps(almacen, conLlave), id)
    await como(comoPostgres, async (c) => {
      await c.query("delete from public.materiales where id = $1", [id])
      const { rows } = await c.query("select 1 from public.embeddings_ficha where material_id = $1", [id])
      expect(rows).toHaveLength(0)
    })
    expect(CONI).toBeDefined()
  })
})

describe("embedding de la ficha", () => {
  it("embeds the summary and key ideas as a document, pays Voyage with the real cost and stores the vector", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    const voyage = simularVoyage()

    const r = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(r).toEqual({ resultado: "listo" })
    expect(voyage.n).toBe(1)
    expect(voyage.tipos).toEqual(["document"])
    expect(voyage.entradas[0]).toHaveLength(1)
    expect(voyage.entradas[0]?.[0]).toContain("Un resumen de la fuente.")
    expect(voyage.entradas[0]?.[0]).toContain("Idea cuatro.")
    expect((await embedding(id))?.modelo).toBe("voyage-3.5")
    expect(await pendientes(id)).toBe(false)
    const g = (await gastos(id)).filter((f) => f.proveedor === "voyage")
    expect(g).toEqual([{ proveedor: "voyage", paso: "embedding", estado: "confirmado", real: 0.06 }])
  })

  it("skips the call when the material already has an embedding of the same model", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    const voyage = simularVoyage()
    await procesarMaterial(await deps(almacen, conLlave), id)
    await pool.query("update public.materiales set estado = 'procesando' where id = $1", [id])

    await procesarMaterial(await deps(almacen, conLlave), id)

    expect(voyage.n).toBe(1)
    expect((await gastos(id)).filter((f) => f.proveedor === "voyage")).toHaveLength(1)
  })

  it("leaves the material ready with vinculos_pendientes when Voyage fails, and releases the reservation", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    const voyage = simularVoyage(500)

    const r = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(r).toEqual({ resultado: "listo" })
    expect(voyage.n).toBe(1)
    expect((await material(id)).estado).toBe("listo")
    expect(await embedding(id)).toBeUndefined()
    expect(await pendientes(id)).toBe(true)
    expect((await gastos(id)).filter((f) => f.proveedor === "voyage").map((f) => f.estado)).toEqual(["liberado"])
  })

  it("leaves the material ready with vinculos_pendientes when the key is rejected", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    simularVoyage(401)

    const r = await procesarMaterial(await deps(almacen, conLlave), id)

    expect(r).toEqual({ resultado: "listo" })
    expect(await pendientes(id)).toBe(true)
  })

  it("leaves the material ready with vinculos_pendientes, calling nothing, when there is no key", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    const voyage = simularVoyage()

    const r = await procesarMaterial(await deps(almacen, { llaveVoyage: () => undefined }), id)

    expect(r).toEqual({ resultado: "listo" })
    expect(voyage.n).toBe(0)
    expect(await pendientes(id)).toBe(true)
    expect(await gastos(id).then((g) => g.filter((f) => f.proveedor === "voyage"))).toEqual([])
  })

  it("clears vinculos_pendientes when a later run embeds the card", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    simularVoyage(500)
    await procesarMaterial(await deps(almacen, conLlave), id)
    expect(await pendientes(id)).toBe(true)
    await pool.query("update public.materiales set estado = 'procesando' where id = $1", [id])
    simularVoyage()

    await procesarMaterial(await deps(almacen, conLlave), id)

    expect(await embedding(id)).toBeDefined()
    expect(await pendientes(id)).toBe(false)
  })

  it("treats the cap on the Voyage reservation like a failure, not like the material-level stop", async () => {
    const { almacen, id } = await nuevo()
    simularClaude()
    const voyage = simularVoyage()
    // First run without a key pays the card; the second one only has the embedding left to reserve.
    await procesarMaterial(await deps(almacen, { llaveVoyage: () => undefined }), id)
    await pool.query("update public.materiales set estado = 'procesando' where id = $1", [id])
    const anterior = await pool.query<{ tope: string }>("select tope_mensual_usd::text as tope from public.ajustes")
    // The cap has cent precision: a filler spend leaves nothing for the embedding under a cap of 0.01.
    await pool.query("update public.ajustes set tope_mensual_usd = 0.01")
    await pool.query(
      `insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave)
       select 'anthropic', 'relleno', mes_actual, relleno, relleno, 'confirmado', $1
       from (
         select date_trunc('month', now() at time zone 'America/Santiago')::date as mes_actual,
           greatest(0.01 - (select coalesce(sum(coalesce(real_usd, estimado_usd)), 0) from public.gastos
             where mes = date_trunc('month', now() at time zone 'America/Santiago')::date
               and estado in ('reservado', 'confirmado')), 0) as relleno
       ) t`,
      [`material:${id}:relleno:${crypto.randomUUID()}`],
    )
    try {
      const r = await procesarMaterial(await deps(almacen, conLlave), id)

      expect(r).toEqual({ resultado: "listo" })
      expect(voyage.n).toBe(0)
      expect((await material(id)).estado).toBe("listo")
      expect(await pendientes(id)).toBe(true)
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [anterior.rows[0]?.tope])
    }
  })
})
