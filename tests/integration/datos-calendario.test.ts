import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerDatosDeCalendario } from "@/lib/datos/calendario"
import { leerDatosDeInicio } from "@/lib/datos/inicio"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

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
    const idea = await sembrarIdea({ pilar: "limites" })
    await sembrarPieza("programado", { titulo: "Programada", idea_id: idea })
    await sembrarPieza("guion_en_proceso", { titulo: "En proceso" })
    await sembrarPieza("guion_en_proceso", { titulo: "Descartada", estado: "descartado" })

    const datos = await leerDatosDeCalendario(coni, Date.now())

    expect(datos.piezas.map((p) => [p.titulo, p.estado, p.pilar]).sort()).toEqual([
      ["En proceso", "guion_en_proceso", null],
      ["Programada", "programado", "limites"],
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
