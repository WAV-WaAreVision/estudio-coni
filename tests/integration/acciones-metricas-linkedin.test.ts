import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { anotarNumerosDeLinkedin } from "@/lib/acciones/metricas-linkedin"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { marcarPublicacion, moverHoraAprobada, quitarPublicacion, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

let coni: SupabaseClient<Database>
const deps = () => ({ db: coni, ahora: () => "2026-10-19T15:00:00.000Z" })

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.metricas_linkedin_cuenta")
}

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

async function postPendiente(): Promise<string> {
  const id = await sembrarPieza("publicado", { titulo: "Post" })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
  await moverHoraAprobada(id, "2026-10-14T22:00:00.000Z")
  return id
}

const numeros = (piezaId: string) => ({ piezaId, impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 })

describe("anotarNumerosDeLinkedin", () => {
  it("saves the numbers of a pending post and the week's followers", async () => {
    const post = await postPendiente()

    const resultado = await anotarNumerosDeLinkedin(deps(), { posts: [numeros(post)], seguidores: 830 })

    expect(resultado).toEqual({ ok: true, anotados: 1 })
    const { rows } = await pool.query("select medido_en::text from public.metricas_linkedin where pieza_id = $1", [
      post,
    ])
    expect(rows).toEqual([{ medido_en: "2026-10-19" }])
  })

  it("lets WAV correct this week's numbers: a second save of the day replaces the first", async () => {
    const post = await postPendiente()
    await anotarNumerosDeLinkedin(deps(), { posts: [numeros(post)], seguidores: null })

    const correccion = await anotarNumerosDeLinkedin(deps(), {
      posts: [{ ...numeros(post), impresiones: 1300 }],
      seguidores: null,
    })

    expect(correccion).toEqual({ ok: true, anotados: 1 })
    const { rows } = await pool.query("select impresiones from public.metricas_linkedin where pieza_id = $1", [post])
    expect(rows).toEqual([{ impresiones: 1300 }])
  })

  it("refuses a post that left the list, in her words, and writes nothing", async () => {
    const viejo = await sembrarPieza("publicado", { titulo: "Viejo" })
    await quitarPublicacion(viejo, "instagram")
    await marcarPublicacion(viejo, "linkedin")
    await moverHoraAprobada(viejo, "2026-09-01T22:00:00.000Z")

    const resultado = await anotarNumerosDeLinkedin(deps(), { posts: [numeros(viejo)], seguidores: 900 })

    expect(resultado).toEqual({
      ok: false,
      error: "Uno de esos posts ya no está entre los de las últimas 4 semanas. Vuelve a abrir Métricas.",
    })
    expect((await pool.query("select * from public.metricas_linkedin_cuenta")).rowCount).toBe(0)
  })

  it("refuses an empty save", async () => {
    expect(await anotarNumerosDeLinkedin(deps(), { posts: [], seguidores: null })).toEqual({
      ok: false,
      error: "Anota al menos un post o los seguidores.",
    })
  })
})
