import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { contarPropuestasDeFusion, leerFusiones, leerOrigenDeTema } from "@/lib/datos/fusiones"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { afirmacion, escenaDeFusion, limpiarFusiones, propuesta, tema, vec } from "./fusiones-comun"
import { clienteDeConi } from "./sesion-coni"

let coni: SupabaseClient<Database>
beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(limpiarFusiones)
afterEach(limpiarFusiones)
afterAll(() => pool.end())

describe("leerFusiones", () => {
  it("lists proposals oldest first, applied merges of the last 30 days newest first and live rejected pairs", async () => {
    const e = await escenaDeFusion()
    const otro = await tema("Otro", vec({ 5: 1 }))
    const viejo = await tema("Viejo", vec({ 6: 1 }))
    const gone = await tema("Se fue", vec({ 7: 1 }))
    for (const t of [otro, viejo, gone]) await afirmacion(vec({ 0: 1 }), { tema: t })
    const id = await propuesta(e.ganador, e.perdedor)
    const aplicada = (
      await pool.query<{ id: string }>("select public.fusionar_par_de_temas($1, $2) as id", [viejo, gone])
    ).rows[0]?.id
    await pool.query("update public.fusiones set razon = 'Lo mismo.' where id = $1", [aplicada])
    await pool.query(
      "insert into public.temas_fusion_rechazada (tema_a, tema_b, origen, razon) values ($1, $2, 'claude', 'Distintos.')",
      [...[e.ganador, otro].sort()],
    )
    await pool.query("insert into public.temas_fusion_rechazada (tema_a, tema_b, origen) values ($1, $2, 'coni')", [
      ...[otro, gone].sort(),
    ])
    const ahora = Date.now()
    const leidas = await leerFusiones(coni, ahora)
    expect(leidas.propuestas).toEqual([
      {
        id,
        ganador: "Ganador",
        perdedor: "Perdedor",
        razon: "Hablan de lo mismo.",
        motivo: "Claude no está seguro de que sean el mismo tema.",
      },
    ])
    expect(leidas.recientes).toEqual([
      { id: aplicada, ganador: "Viejo", perdedor: "Se fue", razon: "Lo mismo.", aplicadaEn: expect.any(String) },
    ])
    // The pair with «Se fue» is gone: that topic is merged away.
    expect(leidas.rechazadas.map((p) => [p.nombreA, p.nombreB].sort())).toEqual([["Ganador", "Otro"]])
    await pool.query("update public.fusiones set aplicada_en = now() - interval '31 days' where id = $1", [aplicada])
    expect((await leerFusiones(coni, ahora)).recientes).toEqual([])
  })
})

describe("counts and the topic's origin", () => {
  it("counts open proposals only", async () => {
    const e = await escenaDeFusion()
    expect(await contarPropuestasDeFusion(coni)).toBe(0)
    const id = await propuesta(e.ganador, e.perdedor)
    expect(await contarPropuestasDeFusion(coni)).toBe(1)
    await pool.query("update public.fusiones set estado = 'rechazada' where id = $1", [id])
    expect(await contarPropuestasDeFusion(coni)).toBe(0)
  })

  it("reads a topic's aliases and its live parent", async () => {
    const e = await escenaDeFusion()
    expect(await leerOrigenDeTema(coni, e.ganador)).toEqual({ alias: ["Ya conocido"], subtemaDe: null })
    await pool.query("insert into public.temas_subtemas (tema_id, padre_id, origen) values ($1, $2, 'coni')", [
      e.perdedor,
      e.ganador,
    ])
    expect(await leerOrigenDeTema(coni, e.perdedor)).toEqual({
      alias: ["Ya conocido", "Otro nombre"],
      subtemaDe: { id: e.ganador, nombre: "Ganador" },
    })
  })
})
