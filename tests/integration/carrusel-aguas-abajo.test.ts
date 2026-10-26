import { afterAll, describe, expect, it } from "vitest"
import {
  leerPiezasAtascadas,
  leerPiezasSinArrancar,
  leerVocesTrabadas,
  tomarParaPublicar,
} from "@/lib/datos/repositorio"
import { type DepsGrabacion, grabarPieza } from "@/lib/produccion/grabar"
import { grabarVoz } from "@/lib/produccion/grabar-voz"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { como, comoConi, fallaCon, pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, leerFila, sembrarCarrusel } from "./siembra"

const sembradas: string[] = []
afterAll(async () => {
  await borrarSembrado(sembradas, [])
  await pool.end()
})

const nunca = (que: string) => async () => {
  throw new Error(`Un carrusel no debe llegar a ${que}`)
}
const MAÑANA = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

async function firmado(): Promise<string> {
  const id = await sembrarCarrusel("armando_carrusel")
  sembradas.push(id)
  return id
}

describe("a signed carousel downstream (plan amendment 2)", () => {
  it("is left alone by the render and the voice tasks, which call no provider", async () => {
    const id = await firmado()
    const antes = await leerFila(id)
    const deps: DepsGrabacion = {
      db: clienteDeServicio(),
      avisos: notificadorEnMemoria(),
      almacen: almacenEnMemoria(),
      quemar: nunca("ffmpeg"),
      sondear: nunca("ffprobe"),
      esperarRender: nunca("HeyGen"),
      esperar: nunca("la espera de la firma"),
      ahora: () => new Date().toISOString(),
    }
    // No HeyGen or ElevenLabs handler is registered: any call would fail the test as an unhandled request.
    expect(await grabarPieza(deps, id)).toEqual({ resultado: "nada_que_hacer" })
    expect(await grabarVoz({ ...deps }, { piezaId: id, nueva: false })).toEqual({ resultado: "nada_que_hacer" })
    expect(await leerFila(id)).toMatchObject({ estado: "armando_carrusel", version: antes.version })
    const { rows } = await pool.query(
      "select proveedor from public.gastos where pieza_id = $1 and proveedor <> 'anthropic'",
      [id],
    )
    expect(rows).toEqual([])
  })

  it("is never taken to publish, nor by the maintenance sweeps", async () => {
    const id = await firmado()
    const servicio = clienteDeServicio()
    const tomada = await tomarParaPublicar(servicio, MAÑANA(), 60)
    expect(tomada?.id).not.toBe(id)
    expect((await leerPiezasAtascadas(servicio, MAÑANA())).map((f) => f.id)).not.toContain(id)
    expect((await leerVocesTrabadas(servicio, MAÑANA())).map((f) => f.id)).not.toContain(id)
    const { aGrabar } = await leerPiezasSinArrancar(servicio, { grabarAntesDe: MAÑANA(), producirAntesDe: MAÑANA() })
    expect(aGrabar.map((f) => f.id)).not.toContain(id)
  })

  it("is restarted by maintenance only as a carousel still being written (producir-pieza handles it)", async () => {
    const id = await sembrarCarrusel("guion_en_proceso")
    sembradas.push(id)
    const { aProducir } = await leerPiezasSinArrancar(clienteDeServicio(), {
      grabarAntesDe: MAÑANA(),
      producirAntesDe: MAÑANA(),
    })
    expect(aProducir.map((f) => f.id)).toContain(id)
  })

  it("cannot be moved into a reel's step even by Coni's own session", async () => {
    const id = await firmado()
    await como(comoConi, async (c) => {
      for (const estado of ["en_render", "subtitulando", "video_por_aprobar", "grabando_voz"]) {
        const error = await fallaCon(c, "update public.piezas set estado = $2, version = version + 1 where id = $1", [
          id,
          estado,
        ])
        expect(error, estado).toMatchObject({ code: "23514", constraint: "estados_del_tipo" })
      }
    })
  })
})
