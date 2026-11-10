import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { decidirFusion, deshacerFusion, unirTemasAMano } from "@/lib/acciones/fusiones"
import { ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { pilaresCambiadosDe, RECHAZOS_DE_FUSION } from "@/lib/dominio/fusiones"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { escenaDeFusion, limpiarFusiones, propuesta } from "./fusiones-comun"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

let coni: SupabaseClient<Database>
let wav: SupabaseClient<Database>
beforeAll(async () => {
  coni = await clienteDeConi()
  wav = await clienteDelMantenedor()
})
beforeEach(limpiarFusiones)
afterEach(limpiarFusiones)
afterAll(() => pool.end())

async function fusionada(ganador: string, perdedor: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("select public.fusionar_par_de_temas($1, $2) as id", [
    ganador,
    perdedor,
  ])
  return rows[0]?.id ?? ""
}

describe("Coni's merge actions", () => {
  it("decides a proposal and answers the note of her verdict; a second decision is refused in her words", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    expect(await decidirFusion({ db: coni }, { id, veredicto: "distintos" })).toEqual({
      ok: true,
      aviso: "fusion-separada",
    })
    expect(await decidirFusion({ db: coni }, { id, veredicto: "mismo" })).toEqual({
      ok: false,
      error: RECHAZOS_DE_FUSION.fusion_ya_decidida,
    })
  })

  it("undoes an applied merge, and says why when it cannot", async () => {
    const e = await escenaDeFusion()
    const id = await fusionada(e.ganador, e.perdedor)
    expect(await deshacerFusion({ db: coni }, { id })).toEqual({ ok: true, aviso: "fusion-deshecha" })
    expect(await deshacerFusion({ db: coni }, { id })).toEqual({
      ok: false,
      error: RECHAZOS_DE_FUSION.fusion_no_aplicada,
    })
  })

  it("refuses an undo after she changed the winner's pillars, naming the topic", async () => {
    const e = await escenaDeFusion()
    const id = await fusionada(e.ganador, e.perdedor)
    await pool.query("delete from public.tema_pilares where tema_id = $1 and es_capa", [e.ganador])
    await pool.query(
      "update public.tema_pilares set fuerza = 'media' where tema_id = $1 and fuerza = 'alta' and not es_capa",
      [e.ganador],
    )
    expect(await deshacerFusion({ db: coni }, { id })).toEqual({ ok: false, error: pilaresCambiadosDe("Ganador") })
  })

  it("joins a rejected pair and refuses one that is not rejected", async () => {
    const e = await escenaDeFusion()
    expect(await unirTemasAMano({ db: coni }, { a: e.ganador, b: e.perdedor })).toEqual({
      ok: false,
      error: RECHAZOS_DE_FUSION.par_no_rechazado,
    })
    await pool.query("insert into public.temas_fusion_rechazada (tema_a, tema_b) values ($1, $2)", [
      ...[e.ganador, e.perdedor].sort(),
    ])
    expect(await unirTemasAMano({ db: coni }, { a: e.ganador, b: e.perdedor })).toEqual({
      ok: true,
      aviso: "fusion-unida",
    })
  })

  it("is only Coni's", async () => {
    const e = await escenaDeFusion()
    const id = await propuesta(e.ganador, e.perdedor)
    expect(await decidirFusion({ db: wav }, { id, veredicto: "mismo" })).toEqual({ ok: false, error: ERROR_SOLO_CONI })
  })
})
