import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerDatosDeMetricas, leerReelsPublicados } from "@/lib/datos/metricas"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeServicio as clienteDeServicioParaMetricas } from "./servicio"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

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
}

beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

describe("leerDatosDeMetricas", () => {
  it("leaves out a piece that went out only on LinkedIn: it has no Instagram reel to measure", async () => {
    await sembrarPieza("publicado", { titulo: "Solo LinkedIn" })
    const conReel = await sembrarPieza("publicado", { titulo: "Con reel", media_id: "media_9" })

    const datos = await leerDatosDeMetricas(coni, AHORA)

    expect(datos.publicadas.map((p) => p.id)).toEqual([conReel])
  })

  it("reads published reels with their theme, their readings, the consultations and the clicks summed by day", async () => {
    const idea = await sembrarIdea({ pilar: "autoestima" })
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
    expect(datos.publicadas).toHaveLength(1)
    expect(datos.publicadas[0]).toMatchObject({ id: publicada, titulo: "Ser tu propia diosa", pilar: "autoestima" })
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

    expect(datos.publicadas[0]).toMatchObject({ titulo: "Sin idea", pilar: null })
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
  it("never reaches the screen or the daily Instagram reading, with or without the link she pasted", async () => {
    await sembrarPieza("publicado_a_mano", { titulo: "Sin enlace" })
    await sembrarPieza("publicado_a_mano", {
      titulo: "Con enlace",
      permalink: "https://www.instagram.com/reel/DAbc123/",
    })
    await sembrarPieza("para_subir_a_mano", { titulo: "Todavía sin subir" })
    const publicada = await sembrarPieza("publicado", { titulo: "Publicada por la plataforma", media_id: "media_1" })

    const datos = await leerDatosDeMetricas(coni, AHORA)
    const paraLeer = await leerReelsPublicados(clienteDeServicioParaMetricas())

    expect(datos.publicadas.map((p) => p.titulo)).toEqual(["Publicada por la plataforma"])
    expect(paraLeer).toEqual([{ piezaId: publicada, mediaId: "media_1" }])
  })
})
