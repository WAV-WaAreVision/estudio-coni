import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { parsearVector } from "@/lib/ingesta/agrupar"
import { aplicarModeloDeHuellas, revertirModeloDeHuellas } from "@/lib/modelo/aplicar"
import { type DepsModelo, OMITIDA_POR_PAUSA, probarModeloDeHuellas } from "@/lib/modelo/probar"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"
import { pool, sinLimiteFijado } from "./db"
import { afirmacion, reiniciarHuellas, tema, vec } from "./huellas-comun"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())
beforeEach(reiniciarHuellas)
afterEach(reiniciarHuellas)

const db = clienteDeServicio()

function deps(llave: string | null = "pa-de-prueba"): DepsModelo {
  return {
    db,
    almacen: almacenEnMemoria(),
    avisos: notificadorEnMemoria(),
    ahora: () => new Date().toISOString(),
    llaveVoyage: () => llave ?? undefined,
  }
}

type Pedido = { input: string[]; model: string; output_dimension: number }

/** Voyage answers each text with `nuevo(texto)`, or with `estado`; every request is kept. */
function simularVoyage(nuevo: (texto: string) => number[], estado = 200): Pedido[] {
  const pedidos: Pedido[] = []
  servidor.use(
    http.post("https://api.voyageai.com/v1/embeddings", async ({ request }) => {
      const cuerpo = (await request.json()) as Pedido
      pedidos.push(cuerpo)
      if (estado !== 200) return HttpResponse.json({ detail: "no" }, { status: estado })
      return HttpResponse.json({
        data: cuerpo.input.map((t, index) => ({ embedding: nuevo(t), index })),
        usage: { total_tokens: 10 * cuerpo.input.length },
      })
    }),
  )
  return pedidos
}

/** "A3": old vector near e0, new near e2; "B3": old near e1, new near e3. A small own component keeps them apart. */
const desplazamiento = (t: string) => Number(t.slice(1)) + (t.startsWith("A") ? 0 : 20)
const viejo = (t: string) => vec({ [t.startsWith("A") ? 0 : 1]: 1, [10 + desplazamiento(t)]: 0.3 })
const nuevoDe = (t: string) => vec({ [t.startsWith("A") ? 2 : 3]: 1, [50 + desplazamiento(t)]: 0.5 })

/** One topic of four claims and four pending claims: 28 claim pairs, enough to calibrate. */
async function sembrar(): Promise<string> {
  const temaA = await tema("Deseo", vec({ 0: 1 }))
  for (const n of [1, 2, 3, 4]) await afirmacion(viejo(`A${n}`), { texto: `A${n}`, tema: temaA })
  for (const n of [1, 2, 3, 4]) await afirmacion(viejo(`B${n}`), { texto: `B${n}` })
  return temaA
}

describe("probarModeloDeHuellas", () => {
  it("embeds every claim with the new model, saves a ready dry run with its candidates and returns the report", async () => {
    await sinLimiteFijado()
    await sembrar()
    const pedidos = simularVoyage(nuevoDe)
    const r = await probarModeloDeHuellas(deps(), { modelo: "voyage-4" })
    if ("omitida" in r) throw new Error("No debía omitirse.")
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]).toMatchObject({ model: "voyage-4", output_dimension: 1024 })
    expect(pedidos[0]?.input).toHaveLength(8)
    const prueba = await pool.query("select estado, modelo, umbrales from public.pruebas_de_modelo where id = $1", [
      r.prueba,
    ])
    expect(prueba.rows[0]).toMatchObject({ estado: "lista", modelo: "voyage-4" })
    expect(Object.keys(prueba.rows[0]?.umbrales ?? {}).sort()).toEqual([
      "fusion",
      "grupo",
      "puente_max",
      "puente_min",
      "tema",
    ])
    const candidatas = await pool.query(
      "select distinct modelo, count(*) over ()::int as n from public.huellas_candidatas where prueba_id = $1",
      [r.prueba],
    )
    expect(candidatas.rows).toEqual([{ modelo: "voyage-4", n: 8 }])
    expect(r.informe.afirmaciones).toBe(8)
    expect(r.informe.umbrales.tema.fuente).toBe("afirmacion_afirmacion")
    expect(r.texto).toContain("Prueba de voyage-4 sobre 8 afirmaciones y 1 temas")
    const gastos = await pool.query("select proveedor, estado from public.gastos where clave like 'modelo:probar:%'")
    expect(gastos.rows).toEqual([{ proveedor: "voyage", estado: "confirmado" }])
  })

  it("does nothing while Voyage is paused", async () => {
    await sembrar()
    await pool.query(
      "insert into public.pausas_de_proveedor (proveedor, motivo, detalle) values ('voyage', 'pago', 'x')",
    )
    const pedidos = simularVoyage(nuevoDe)
    expect(await probarModeloDeHuellas(deps(), { modelo: "voyage-4" })).toEqual(OMITIDA_POR_PAUSA)
    expect(pedidos).toHaveLength(0)
  })

  it("writes no dry run when Voyage fails", async () => {
    await sinLimiteFijado()
    await sembrar()
    simularVoyage(nuevoDe, 500)
    await expect(probarModeloDeHuellas(deps(), { modelo: "voyage-4" })).rejects.toThrow()
    expect((await pool.query("select count(*)::int as n from public.pruebas_de_modelo")).rows[0]?.n).toBe(0)
  })

  it("refuses to try the vigente model, and needs the Voyage key", async () => {
    await sembrar()
    await expect(probarModeloDeHuellas(deps(), { modelo: "voyage-3.5" })).rejects.toThrow(/ya es el modelo vigente/)
    await expect(probarModeloDeHuellas(deps(null), { modelo: "voyage-4" })).rejects.toThrow(/VOYAGE_API_KEY/)
  })

  it("refuses to calibrate fewer than 7 claims", async () => {
    await sinLimiteFijado()
    for (const n of [1, 2, 3]) await afirmacion(viejo(`B${n}`), { texto: `B${n}` })
    simularVoyage(nuevoDe)
    await expect(probarModeloDeHuellas(deps(), { modelo: "voyage-4" })).rejects.toThrow(/hacen falta 20/)
  })
})

async function probar(): Promise<string> {
  const r = await probarModeloDeHuellas(deps(), { modelo: "voyage-4" })
  if ("omitida" in r) throw new Error("No debía omitirse.")
  return r.prueba
}

async function vectoresGuardados() {
  const { rows } = await pool.query<{ id: string; v: string }>(
    "select id, vector::text as v from public.afirmaciones where vector is not null order by id",
  )
  return rows
}

describe("aplicarModeloDeHuellas", () => {
  it("embeds the claims that arrived after the dry run, swaps every vector and keeps every assignment", async () => {
    await sinLimiteFijado()
    const temaA = await sembrar()
    const pedidos = simularVoyage(nuevoDe)
    const prueba = await probar()
    await afirmacion(viejo("B9"), { texto: "B9" })
    const hecho = await aplicarModeloDeHuellas(deps(), { prueba })
    expect(hecho).toMatchObject({ prueba, modelo: "voyage-4", version: 2, embebidas: 1, asignacionesIntactas: true })
    expect(pedidos.at(-1)).toMatchObject({ model: "voyage-4", input: ["B9"] })
    const modelos = await pool.query("select modelo_vector, count(*)::int as n from public.afirmaciones group by 1")
    expect(modelos.rows).toEqual([{ modelo_vector: "voyage-4", n: 9 }])
    const centroide = await pool.query(
      "select centroide::text as c, modelo_centroide as m from public.temas where id = $1",
      [temaA],
    )
    expect(centroide.rows[0]?.m).toBe("voyage-4")
    expect(parsearVector(centroide.rows[0]?.c ?? "")[2]).toBeCloseTo(nuevoDe("A1")[2] ?? 0, 4)
    const vigente = await pool.query("select version, modelo from public.calibraciones_de_parecido where vigente")
    expect(vigente.rows).toEqual([{ version: 2, modelo: "voyage-4" }])
  })

  it("re-embeds a candidate stamped with another model than the dry run's before the switch", async () => {
    await sinLimiteFijado()
    await sembrar()
    const pedidos = simularVoyage(nuevoDe)
    const prueba = await probar()
    await pool.query(
      `update public.huellas_candidatas set modelo = 'voyage-3.5'
       where prueba_id = $1 and afirmacion_id = (select id from public.afirmaciones where texto = 'B1')`,
      [prueba],
    )
    const hecho = await aplicarModeloDeHuellas(deps(), { prueba })
    expect(hecho).toMatchObject({ embebidas: 1, version: 2 })
    expect(pedidos.at(-1)).toMatchObject({ model: "voyage-4", input: ["B1"] })
  })

  it("refuses a dry run that is not ready, and does nothing while Voyage is paused", async () => {
    await sinLimiteFijado()
    await sembrar()
    simularVoyage(nuevoDe)
    const prueba = await probar()
    await pool.query(
      "insert into public.pausas_de_proveedor (proveedor, motivo, detalle) values ('voyage', 'llave', 'x')",
    )
    expect(await aplicarModeloDeHuellas(deps(), { prueba })).toEqual(OMITIDA_POR_PAUSA)
    await pool.query("delete from public.pausas_de_proveedor")
    await pool.query("update public.pruebas_de_modelo set estado = 'descartada' where id = $1", [prueba])
    await expect(aplicarModeloDeHuellas(deps(), { prueba })).rejects.toThrow(/descartada/)
  })
})

describe("revertirModeloDeHuellas", () => {
  it("embeds with the old model what arrived after the switch and restores the rest exactly", async () => {
    await sinLimiteFijado()
    await sembrar()
    const pedidos = simularVoyage(nuevoDe)
    const prueba = await probar()
    const antes = await vectoresGuardados()
    await aplicarModeloDeHuellas(deps(), { prueba })
    await afirmacion(nuevoDe("B8"), { texto: "B8", modelo: "voyage-4" })
    const vuelta = await revertirModeloDeHuellas(deps(), { prueba })
    expect(vuelta).toMatchObject({ prueba, modelo: "voyage-3.5", version: 1, embebidas: 1, asignacionesIntactas: true })
    expect(pedidos.at(-1)).toMatchObject({ model: "voyage-3.5", input: ["B8"] })
    const despues = await vectoresGuardados()
    expect(despues.filter((f) => antes.some((a) => a.id === f.id))).toEqual(antes)
    const vigente = await pool.query("select version from public.calibraciones_de_parecido where vigente")
    expect(vigente.rows).toEqual([{ version: 1 }])
  })

  it("refuses a dry run that was never applied", async () => {
    await sinLimiteFijado()
    await sembrar()
    simularVoyage(nuevoDe)
    const prueba = await probar()
    await expect(revertirModeloDeHuellas(deps(), { prueba })).rejects.toThrow(/lista/)
  })
})
