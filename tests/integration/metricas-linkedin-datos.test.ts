import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { guardarNumerosDeLinkedin, leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
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

async function postEnLinkedin(titulo: string, instante: string): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
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

describe("leerLinkedinParaAnotar", () => {
  it("lists the LinkedIn posts of the last four weeks without a row this week, and this week's followers", async () => {
    const reciente = await postEnLinkedin("Reciente", "2026-10-14T22:00:00.000Z")
    const anotado = await postEnLinkedin("Anotado", "2026-10-13T22:00:00.000Z")
    await postEnLinkedin("Viejo", "2026-09-01T22:00:00.000Z")
    const soloInstagram = await sembrarPieza("publicado", { titulo: "Solo Instagram", media_id: "m" })
    await moverHoraAprobada(soloInstagram, "2026-10-14T22:00:00.000Z")
    await pool.query(
      "insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, origen) values ($1, '2026-10-19', 10, 'manual')",
      [anotado],
    )
    await pool.query(
      "insert into public.metricas_linkedin_cuenta (semana, seguidores, origen) values ('2026-10-19', 830, 'manual')",
    )

    const lista = await leerLinkedinParaAnotar(coni, LUNES)

    expect(lista.semana).toBe("2026-10-19")
    expect(lista.medidoEn).toBe("2026-10-19")
    expect(lista.pendientes.map((p) => [p.piezaId, p.titulo])).toEqual([[reciente, "Reciente"]])
    expect(lista.seguidores).toBe(830)
  })
})

describe("guardarNumerosDeLinkedin", () => {
  it("writes manual rows sealed with Coni's id, and a second save of the day replaces the first", async () => {
    const post = await postEnLinkedin("Post", "2026-10-14T22:00:00.000Z")
    const fila = { piezaId: post, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }

    await guardarNumerosDeLinkedin(coni, {
      medidoEn: "2026-10-19",
      semana: "2026-10-19",
      posts: [fila],
      seguidores: 830,
    })
    await guardarNumerosDeLinkedin(coni, {
      medidoEn: "2026-10-19",
      semana: "2026-10-19",
      posts: [{ ...fila, impresiones: 1300 }],
      seguidores: null,
    })

    const { rows } = await pool.query(
      "select impresiones, origen, anotado_por from public.metricas_linkedin where pieza_id = $1",
      [post],
    )
    expect(rows).toEqual([{ impresiones: 1300, origen: "manual", anotado_por: CONI }])
    const cuenta = await pool.query("select seguidores, anotado_por from public.metricas_linkedin_cuenta")
    expect(cuenta.rows).toEqual([{ seguidores: 830, anotado_por: CONI }])
  })
})
