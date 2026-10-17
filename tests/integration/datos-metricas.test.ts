import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerDatosDeMetricas, leerReelsPublicados } from "@/lib/datos/metricas"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeServicio as clienteDeServicioParaMetricas } from "./servicio"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { marcarPublicacion, quitarPublicacion, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

type Db = SupabaseClient<Database>

let coni: Db
let mantenedor: Db
const AHORA = Date.parse("2026-10-15T15:00:00.000Z")

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

async function limpiar() {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.consultas")
  await pool.query("delete from public.clics_enlace_dia")
  await pool.query("delete from public.metricas_linkedin_cuenta")
}

beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

describe("leerDatosDeMetricas", () => {
  it("reads each network a piece went out on, once per network, with her own uploads marked", async () => {
    const ambas = await sembrarPieza("publicado", { titulo: "En las dos", media_id: "media_1" })
    await marcarPublicacion(ambas, "linkedin")
    const soloLinkedin = await sembrarPieza("publicado", { titulo: "Solo LinkedIn" })
    await quitarPublicacion(soloLinkedin, "instagram")
    await marcarPublicacion(soloLinkedin, "linkedin")
    await sembrarPieza("publicado_a_mano", { titulo: "A mano" })
    await sembrarPieza("para_subir_a_mano", { titulo: "Sin subir" })

    const datos = await leerDatosDeMetricas(coni, AHORA)

    expect(
      datos.publicaciones.map((p) => [p.titulo, p.red, p.aMano]).sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["A mano", "instagram", true],
      ["En las dos", "instagram", false],
      ["En las dos", "linkedin", false],
      ["Solo LinkedIn", "linkedin", false],
    ])
    expect(datos.publicaciones.every((p) => !Number.isNaN(Date.parse(p.publicadoEn)))).toBe(true)
  })

  it("reads the newest LinkedIn reading of each post", async () => {
    const post = await sembrarPieza("publicado", { titulo: "Post" })
    await marcarPublicacion(post, "linkedin")
    await pool.query(
      `insert into public.metricas_linkedin (pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen)
       values ($1, '2026-10-05', 300, 2, 0, 0, 'manual'), ($1, '2026-10-12', 1200, 14, 3, 1, 'manual')`,
      [post],
    )

    const datos = await leerDatosDeMetricas(coni, AHORA)

    expect(datos.lecturasLinkedin).toEqual([
      { piezaId: post, medidoEn: "2026-10-12", impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 },
    ])
  })

  it("reads published reels with their theme, their readings, the consultations and the clicks summed by day", async () => {
    const idea = await sembrarIdea({ pilar: "etica-regulacion" })
    const publicada = await sembrarPieza("publicado", {
      titulo: "Ser tu propia diosa",
      idea_id: idea,
      media_id: "media_1",
    })
    await sembrarPieza("programado", { titulo: "Todavía no sale" })
    await pool.query(
      "insert into public.metricas_reel (pieza_id, dia, alcance, guardados, tiempo_promedio) values ($1, '2026-10-14', 900, 20, 24400.5), ($1, '2026-10-15', 1000, 30, 25000)",
      [publicada],
    )
    await pool.query("insert into public.consultas (anotada_en) values ('2026-10-10T15:00:00Z')")
    await pool.query(
      "insert into public.clics_enlace_dia (dia, enlace, clics) values ('2026-10-14', 'agenda', 3), ('2026-10-14', 'libros', 2), ('2026-10-15', 'agenda', 1)",
    )

    const datos = await leerDatosDeMetricas(coni, AHORA)

    expect(datos.zona).toBe("America/Santiago")
    expect(datos.publicaciones).toHaveLength(1)
    expect(datos.publicaciones[0]).toMatchObject({
      piezaId: publicada,
      red: "instagram",
      titulo: "Ser tu propia diosa",
      pilar: "etica-regulacion",
    })
    // Only the newest reading of the reel comes back.
    expect(datos.lecturas.map((l) => [l.dia, l.alcance, l.guardados, l.tiempoPromedio])).toEqual([
      ["2026-10-15", 1000, 30, 25000],
    ])
    expect(datos.consultas).toEqual(["2026-10-10T15:00:00+00:00"])
    expect([...datos.clics].sort((a, b) => a.dia.localeCompare(b.dia))).toEqual([
      { dia: "2026-10-14", clics: 5 },
      { dia: "2026-10-15", clics: 1 },
    ])
  })

  it("has a reel with no theme listed with a null theme instead of dropping it", async () => {
    await sembrarPieza("publicado", { titulo: "Sin idea", media_id: "media_2" })

    const datos = await leerDatosDeMetricas(coni, AHORA)

    expect(datos.publicaciones[0]).toMatchObject({ titulo: "Sin idea", pilar: null })
  })

  it("lets the maintainer read the same numbers, however old the newest reading of a reel is", async () => {
    const publicada = await sembrarPieza("publicado", { titulo: "Reel", media_id: "media_3" })
    await pool.query("insert into public.metricas_reel (pieza_id, dia, alcance) values ($1, '2026-08-01', 5)", [
      publicada,
    ])

    const datos = await leerDatosDeMetricas(mantenedor, AHORA)

    expect(datos.lecturas.map((l) => [l.piezaId, l.dia, l.alcance])).toEqual([[publicada, "2026-08-01", 5]])
  })
})

describe("reels subidos a mano", () => {
  it("reach the screen marked as hers, while the daily Instagram reading asks only for the platform's", async () => {
    await sembrarPieza("publicado_a_mano", { titulo: "Sin enlace" })
    await sembrarPieza("publicado_a_mano", {
      titulo: "Con enlace",
      permalink: "https://www.instagram.com/reel/DAbc123/",
    })
    await sembrarPieza("para_subir_a_mano", { titulo: "Todavía sin subir" })
    const publicada = await sembrarPieza("publicado", { titulo: "Publicada por la plataforma", media_id: "media_1" })

    const datos = await leerDatosDeMetricas(coni, AHORA)
    const paraLeer = await leerReelsPublicados(clienteDeServicioParaMetricas())

    expect(datos.publicaciones.map((p) => [p.titulo, p.aMano]).sort()).toEqual([
      ["Con enlace", true],
      ["Publicada por la plataforma", false],
      ["Sin enlace", true],
    ])
    expect(paraLeer).toEqual([{ piezaId: publicada, mediaId: "media_1" }])
  })
})
