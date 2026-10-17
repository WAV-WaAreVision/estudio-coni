import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { cambiarPropuesta, type DepsFechas, repartirFechas } from "@/lib/acciones/fechas"
import { huecosLibres, repartir } from "@/lib/calendario/propuestas"
import { leerDatosDeCalendario } from "@/lib/datos/calendario"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { sembrarPieza, vaciarPiezasEIdeas } from "./siembra"

let coni: SupabaseClient<Database>
const deps = (): DepsFechas => ({ db: coni, ahora: () => new Date().toISOString() })

async function propuestas(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ pieza_id: string; publicar_en: Date }>(
    "select pieza_id, publicar_en from public.fechas_propuestas",
  )
  return Object.fromEntries(rows.map((fila) => [fila.pieza_id, fila.publicar_en.getTime()]))
}

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(vaciarPiezasEIdeas)
afterAll(async () => {
  await vaciarPiezasEIdeas()
  await pool.end()
})

describe("repartirFechas", () => {
  it("stores what the Agenda shows for every unsigned piece and never touches a scheduled one", async () => {
    const guion = await sembrarPieza("guion_por_aprobar")
    const video = await sembrarPieza("video_por_aprobar")
    const programada = await sembrarPieza("programado")
    const ahora = Date.now()
    const datos = await leerDatosDeCalendario(coni, ahora)
    const esperado = repartir({ piezas: datos.piezas, horario: datos.horario, ahora })

    expect(await repartirFechas(deps())).toEqual({ ok: true, propuestas: 2 })

    const guardadas = await propuestas()
    expect(Object.keys(guardadas).sort()).toEqual([guion, video].sort())
    for (const lugar of esperado) expect(guardadas[lugar.piezaId]).toBe(Date.parse(lugar.instante))
    expect(guardadas[programada]).toBeUndefined()
  })

  it("leaves a live proposal as it is and stores nothing new the second time", async () => {
    await sembrarPieza("guion_por_aprobar")
    await repartirFechas(deps())
    const antes = await propuestas()

    expect(await repartirFechas(deps())).toEqual({ ok: true, propuestas: 0 })
    expect(await propuestas()).toEqual(antes)
  })
})

describe("cambiarPropuesta", () => {
  it("moves a proposal to a free slot", async () => {
    const id = await sembrarPieza("guion_por_aprobar")
    await repartirFechas(deps())
    const ahora = Date.now()
    const datos = await leerDatosDeCalendario(coni, ahora)
    const [otro] = huecosLibres({ piezas: datos.piezas, horario: datos.horario, ahora, cuantas: 1, contar: "todos" })
    if (!otro) throw new Error("Sin espacio libre en la prueba")

    expect(await cambiarPropuesta(deps(), id, otro)).toEqual({ ok: true })
    expect((await propuestas())[id]).toBe(Date.parse(otro))
  })

  it("refuses a slot another stored proposal holds, and a piece already scheduled", async () => {
    const [a, b] = [await sembrarPieza("guion_por_aprobar"), await sembrarPieza("guion_por_aprobar")]
    const programada = await sembrarPieza("programado")
    await repartirFechas(deps())
    const deB = new Date((await propuestas())[b] ?? 0).toISOString()

    expect(await cambiarPropuesta(deps(), a, deB)).toEqual({
      ok: false,
      error: "Ese espacio ya no está libre. Elige otro.",
    })
    expect(await cambiarPropuesta(deps(), programada, deB)).toEqual({
      ok: false,
      error: "La agenda cambió mientras la mirabas. Vuelve a intentarlo.",
    })
  })
})

describe("signatures", () => {
  it("never touches the piece: version, signature hashes and every other column stay as they were", async () => {
    const guion = await sembrarPieza("guion_por_aprobar")
    const video = await sembrarPieza("video_por_aprobar")
    const piezas = async () =>
      (
        await pool.query<{ fila: Record<string, unknown> }>(
          "select to_jsonb(p) as fila from public.piezas p where id = any($1) order by id",
          [[guion, video]],
        )
      ).rows.map((r) => r.fila)
    const antes = await piezas()
    expect(antes.map((fila) => Object.keys(fila))).toEqual(
      antes.map(() => expect.arrayContaining(["version", "puerta1_hash", "puerta2_hash_texto"])),
    )

    expect(await repartirFechas(deps())).toEqual({ ok: true, propuestas: 2 })
    const ahora = Date.now()
    const datos = await leerDatosDeCalendario(coni, ahora)
    const [otro] = huecosLibres({ piezas: datos.piezas, horario: datos.horario, ahora, cuantas: 1, contar: "todos" })
    if (!otro) throw new Error("Sin espacio libre en la prueba")
    expect(await cambiarPropuesta(deps(), video, otro)).toEqual({ ok: true })

    expect(await piezas()).toEqual(antes)
  })
})
