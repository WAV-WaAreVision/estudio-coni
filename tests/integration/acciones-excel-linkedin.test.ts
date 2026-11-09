import { readFileSync } from "node:fs"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { guardarDudososDeLinkedin, importarExcelDeLinkedin } from "@/lib/acciones/excel-linkedin"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { EXCEL_DE_PRUEBA, POST_COMPARTIDO, POST_UGC } from "../fixtures/excel-linkedin"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { marcarPublicacion, moverHoraAprobada, quitarPublicacion, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

let coni: SupabaseClient<Database>
const avisos = notificadorEnMemoria()
const deps = () => ({ db: coni, ahora: () => "2026-11-09T15:00:00.000Z", avisos: () => avisos })
const archivo = () => new Blob([new Uint8Array(readFileSync(EXCEL_DE_PRUEBA))])

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.metricas_linkedin_cuenta")
}

async function enLinkedin(titulo: string, instante: string, urn: string | null): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin", urn ? "publicado" : "subido_a_mano")
  if (urn) {
    await pool.query("update public.publicaciones set post_urn = $2 where pieza_id = $1 and destino = 'linkedin'", [
      id,
      urn,
    ])
  }
  await moverHoraAprobada(id, instante)
  return id
}

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

describe("importarExcelDeLinkedin", () => {
  it("saves the safe posts and the followers, and returns the summary and the doubtful hand uploads", async () => {
    const porApi = await enLinkedin(
      "Lo que firma un modelo",
      "2026-10-03T15:00:00.000Z",
      `urn:li:share:${POST_COMPARTIDO}`,
    )
    const primera = await enLinkedin("Qué pasa cuando te dicen", "2026-10-07T15:00:00.000Z", null)
    const segunda = await enLinkedin("Otra del mismo día", "2026-10-07T18:00:00.000Z", null)

    const resultado = await importarExcelDeLinkedin(deps(), archivo())

    const opcion = { clave: `ugcPost:${POST_UGC}`, fecha: "2026-10-07", impresiones: 2300, interacciones: 40 }
    expect(resultado).toEqual({
      ok: true,
      medidoEn: "2026-10-30",
      resumen: [
        "Listo: 1 publicación con números.",
        "También guardé tus seguidores: 830.",
        "Ignoré 1 publicación del Excel que no salió de Conidolly.",
        "Falta que elijas a qué post del Excel corresponden 2 publicaciones subidas a mano.",
      ],
      dudosos: expect.arrayContaining([
        { piezaId: primera, titulo: "Qué pasa cuando te dicen", fecha: "2026-10-07", opciones: [opcion] },
        { piezaId: segunda, titulo: "Otra del mismo día", fecha: "2026-10-07", opciones: [opcion] },
      ]),
    })
    const { rows } = await pool.query(
      "select pieza_id, medido_en::text, impresiones, interacciones, origen from public.metricas_linkedin",
    )
    expect(rows).toEqual([
      { pieza_id: porApi, medido_en: "2026-10-30", impresiones: 1200, interacciones: 12, origen: "excel" },
    ])
    const cuenta = await pool.query("select semana::text, seguidores from public.metricas_linkedin_cuenta")
    expect(cuenta.rows).toEqual([{ semana: "2026-10-26", seguidores: 830 }])
    expect(avisos.aWavEnviados).toEqual([])
  })
})

describe("guardarDudososDeLinkedin", () => {
  it("saves the Excel post she picked for a hand upload on the import's day", async () => {
    const aMano = await enLinkedin("Qué pasa cuando te dicen", "2026-10-07T15:00:00.000Z", null)

    const resultado = await guardarDudososDeLinkedin(deps(), {
      medidoEn: "2026-10-30",
      elegidos: [{ piezaId: aMano, clave: `ugcPost:${POST_UGC}`, impresiones: 2300, interacciones: 40 }],
    })

    expect(resultado).toEqual({ ok: true, resumen: ["Listo: 1 publicación más con números."] })
    const { rows } = await pool.query(
      "select medido_en::text, impresiones, interacciones, origen from public.metricas_linkedin where pieza_id = $1",
      [aMano],
    )
    expect(rows).toEqual([{ medido_en: "2026-10-30", impresiones: 2300, interacciones: 40, origen: "excel" }])
  })
})
