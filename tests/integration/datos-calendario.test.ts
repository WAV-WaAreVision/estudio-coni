import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerDatosDeCalendario } from "@/lib/datos/calendario"
import { leerDatosDeInicio } from "@/lib/datos/inicio"
import { leerContextoDeFechas } from "@/lib/datos/pantallas"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { marcarPublicacion, proponerFecha, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

let coni: SupabaseClient<Database>

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(vaciarPiezasEIdeas)
afterAll(async () => {
  await vaciarPiezasEIdeas()
  await pool.end()
})

describe("destinos de las piezas en Inicio y Calendario", () => {
  it("reads where a piece goes and what still waits for her, in both screens", async () => {
    const id = await sembrarPieza(
      "para_subir_a_mano",
      { titulo: "Para los dos" },
      { destinos: ["instagram", "linkedin"], textoLinkedin: "Para colegas." },
    )
    await pool.query(
      "update public.publicaciones set estado = 'subido_a_mano' where pieza_id = $1 and destino = 'instagram'",
      [id],
    )

    const calendario = await leerDatosDeCalendario(coni, Date.now())
    const inicio = await leerDatosDeInicio(coni, Date.now())

    for (const pieza of [calendario.piezas, inicio.piezas].map((piezas) => piezas.find((p) => p.id === id))) {
      expect(pieza?.destinos).toEqual(["instagram", "linkedin"])
      expect(pieza?.pendientes).toEqual(["linkedin"])
    }
  })

  it("reads a piece from before LinkedIn as Instagram only", async () => {
    const id = await sembrarPieza("programado", { titulo: "De antes" })

    const { piezas } = await leerDatosDeInicio(coni, Date.now())

    expect(piezas.find((p) => p.id === id)).toMatchObject({ destinos: ["instagram"], pendientes: ["instagram"] })
  })
})

describe("leerDatosDeCalendario", () => {
  it("reads the live pieces with their theme, the schedule, and leaves out ideas and discarded ones", async () => {
    const idea = await sembrarIdea({ pilar: "acceso-salud-publica" })
    await sembrarPieza("programado", { titulo: "Programada", idea_id: idea })
    await sembrarPieza("guion_en_proceso", { titulo: "En proceso" })
    await sembrarPieza("guion_en_proceso", { titulo: "Descartada", estado: "descartado" })

    const datos = await leerDatosDeCalendario(coni, Date.now())

    expect(datos.piezas.map((p) => [p.titulo, p.estado, p.pilar]).sort()).toEqual([
      ["En proceso", "guion_en_proceso", null],
      ["Programada", "programado", "acceso-salud-publica"],
    ])
    expect(datos.horario).toEqual({ dias: [2, 4, 6], hora: "19:00:00", zona: "America/Santiago" })
  })

  it("tells the first approved or scheduled time even when it is older than the window of pieces", async () => {
    const vieja = await sembrarPieza("publicado", { titulo: "La primera" })
    await sembrarPieza("programado", { titulo: "La de ahora" })
    const cliente = await pool.connect()
    try {
      await cliente.query("begin")
      await cliente.query("set local session_replication_role = replica")
      await cliente.query("update public.piezas set puerta2_publicar_en = now() - interval '200 days' where id = $1", [
        vieja,
      ])
      await cliente.query("commit")
    } finally {
      cliente.release()
    }

    const datos = await leerDatosDeCalendario(coni, Date.now())

    expect(datos.piezas.map((p) => p.titulo)).not.toContain("La primera")
    expect(Date.now() - Date.parse(datos.primeraPublicacion ?? "")).toBeGreaterThan(199 * 86_400_000)
  })

  it("reads the pieces Coni uploads by hand, and counts them for when she started", async () => {
    await sembrarPieza("para_subir_a_mano", { titulo: "Por subir" })
    await sembrarPieza("publicado_a_mano", { titulo: "Ya subida" })

    const datos = await leerDatosDeCalendario(coni, Date.now())

    expect(datos.piezas.map((p) => [p.titulo, p.estado]).sort()).toEqual([
      ["Por subir", "para_subir_a_mano"],
      ["Ya subida", "publicado_a_mano"],
    ])
    expect(datos.primeraPublicacion).not.toBeNull()
  })
})

describe("primera publicación", () => {
  it("knows she has published only once a network row went out or was uploaded by her", async () => {
    await sembrarPieza("programado", { titulo: "Programada" })
    expect((await leerDatosDeCalendario(coni, Date.now())).yaPublico).toBe(false)

    const subida = await sembrarPieza("para_subir_a_mano", { titulo: "Subida" })
    await marcarPublicacion(subida, "instagram", "subido_a_mano")
    expect((await leerDatosDeCalendario(coni, Date.now())).yaPublico).toBe(true)
  })
})

describe("fechas propuestas", () => {
  const EN_UN_MES = new Date(Date.now() + 30 * 86_400_000).toISOString()

  it("reads each piece's stored proposal in the calendar, null without one", async () => {
    const [con, sin] = [await sembrarPieza("guion_por_aprobar"), await sembrarPieza("guion_por_aprobar")]
    await proponerFecha(con, EN_UN_MES)

    const { piezas } = await leerDatosDeCalendario(coni, Date.now())

    expect(Date.parse(piezas.find((p) => p.id === con)?.fechaPropuesta ?? "")).toBe(Date.parse(EN_UN_MES))
    expect(piezas.find((p) => p.id === sin)?.fechaPropuesta).toBeNull()
  })

  it("gives the gates the piece's own proposal, and null to a piece without one", async () => {
    const [con, sin] = [await sembrarPieza("video_por_aprobar"), await sembrarPieza("video_por_aprobar")]
    await proponerFecha(con, EN_UN_MES)

    expect(Date.parse((await leerContextoDeFechas(coni, con)).propuesta ?? "")).toBe(Date.parse(EN_UN_MES))
    expect((await leerContextoDeFechas(coni, sin)).propuesta).toBeNull()
  })

  it("gives the gates the other pieces' proposals, only of pieces before gate 2", async () => {
    const [propia, otra, firmada] = [
      await sembrarPieza("video_por_aprobar"),
      await sembrarPieza("guion_por_aprobar"),
      await sembrarPieza("programado"),
    ]
    const EN_DOS_MESES = new Date(Date.now() + 60 * 86_400_000).toISOString()
    const EN_TRES_MESES = new Date(Date.now() + 90 * 86_400_000).toISOString()
    await proponerFecha(propia, EN_UN_MES)
    await proponerFecha(otra, EN_DOS_MESES)
    // Left from before gate 2: a signed piece holds its signed time, not this one.
    await proponerFecha(firmada, EN_TRES_MESES)

    const { otrasPropuestas } = await leerContextoDeFechas(coni, propia)

    expect(otrasPropuestas.map((iso) => Date.parse(iso))).toEqual([Date.parse(EN_DOS_MESES)])
  })
})
