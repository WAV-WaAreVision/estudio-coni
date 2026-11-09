import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { guardarExcelDeLinkedin, leerPublicacionesDeLinkedin } from "@/lib/datos/excel-linkedin"
import { leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { sinNumerosEstaSemana } from "@/lib/metricas/linkedin"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { marcarPublicacion, moverHoraAprobada, quitarPublicacion, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

let coni: SupabaseClient<Database>
const LUNES = Date.parse("2026-10-19T15:00:00.000Z") // Monday 19 Oct, 12:00 in Santiago

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.metricas_linkedin_cuenta")
}

async function enLinkedin(titulo: string, instante: string, estado: "publicado" | "subido_a_mano"): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin", estado)
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

describe("leerPublicacionesDeLinkedin", () => {
  it("gives every LinkedIn row that went out, with its URN or none for a hand upload", async () => {
    const api = await enLinkedin("Por la API", "2026-10-14T22:00:00.000Z", "publicado")
    const aMano = await enLinkedin("A mano", "2026-10-13T22:00:00.000Z", "subido_a_mano")
    const soloInstagram = await sembrarPieza("publicado", { titulo: "Solo Instagram", media_id: "m" })
    await moverHoraAprobada(soloInstagram, "2026-10-14T22:00:00.000Z")

    const publicaciones = await leerPublicacionesDeLinkedin(coni)

    expect(publicaciones.sort((a, b) => a.titulo.localeCompare(b.titulo))).toEqual([
      { piezaId: aMano, titulo: "A mano", postUrn: null, publicadoEn: expect.stringMatching(/^2026-10-13T22:00:00/) },
      {
        piezaId: api,
        titulo: "Por la API",
        postUrn: expect.stringMatching(/^urn:li:share:\d+$/),
        publicadoEn: expect.stringMatching(/^2026-10-14T22:00:00/),
      },
    ])
  })
})

describe("guardarExcelDeLinkedin", () => {
  it("writes the posts and the followers as Coni and clears this week's Inicio reminder", async () => {
    const post = await enLinkedin("Reciente", "2026-10-14T22:00:00.000Z", "publicado")
    expect(sinNumerosEstaSemana((await leerLinkedinParaAnotar(coni, LUNES)).posts)).toHaveLength(1)

    const escritas = await guardarExcelDeLinkedin(coni, {
      medidoEn: "2026-10-19",
      semana: "2026-10-19",
      posts: [{ piezaId: post, impresiones: 1200, interacciones: 12 }],
      seguidores: 830,
    })

    expect(escritas).toBe(1)
    const { rows } = await pool.query(
      "select impresiones, interacciones, origen, anotado_por from public.metricas_linkedin where pieza_id = $1",
      [post],
    )
    expect(rows).toEqual([{ impresiones: 1200, interacciones: 12, origen: "excel", anotado_por: CONI }])
    const cuenta = await pool.query("select seguidores, origen from public.metricas_linkedin_cuenta")
    expect(cuenta.rows).toEqual([{ seguidores: 830, origen: "excel" }])
    expect(sinNumerosEstaSemana((await leerLinkedinParaAnotar(coni, LUNES)).posts)).toEqual([])
  })
})
