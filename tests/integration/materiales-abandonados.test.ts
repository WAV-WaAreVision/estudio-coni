import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it, vi } from "vitest"
import { barrerMaterialesAbandonados, EDAD_DE_ABANDONO_MS } from "@/lib/mantenimiento/materiales-abandonados"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const materiales: string[] = []
const autores: string[] = []

afterAll(async () => {
  await borrarSembrado(materiales, [], autores)
  await pool.end()
})

const HACE_UN_DIA = new Date(Date.now() - 86_400_000).toISOString()

async function enProcesando(extra: { creadoEn?: string; motivo?: string; costo?: number } = {}): Promise<string> {
  const autor = await sembrarAutor(`Autora abandonada ${SUFIJO} ${randomUUID().slice(0, 4)}`)
  autores.push(autor)
  const id = await sembrarMaterial({
    titulo: `Abandonado ${SUFIJO}`,
    autorId: autor,
    estado: "procesando",
    creadoEn: extra.creadoEn ?? HACE_UN_DIA,
    motivo: extra.motivo,
    costo: extra.costo,
  })
  materiales.push(id)
  return id
}

const existe = async (id: string) =>
  ((await pool.query("select 1 from public.materiales where id = $1", [id])).rowCount ?? 0) > 0

const ahora = () => new Date().toISOString()

describe("barrerMaterialesAbandonados", () => {
  it("waits six hours: past the hour of the upload link and any realistic queue of procesar-material", () => {
    expect(EDAD_DE_ABANDONO_MS).toBe(6 * 60 * 60 * 1000)
  })

  it("deletes only an upload never confirmed past six hours, row and R2 folder", async () => {
    const abandonado = await enProcesando()
    const reciente = await enProcesando({ creadoEn: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
    const tomado = await enProcesando()
    await pool.query("update public.materiales set corrida_id = 'run_x', corrida_desde = now() where id = $1", [tomado])
    const conMotivo = await enProcesando({ motivo: "No pude iniciar el procesamiento." })
    const conCosto = await enProcesando({ costo: 0.5 })
    const marcado = await enProcesando()
    await pool.query("update public.materiales set borrar_desde = now() where id = $1", [marcado])
    const listo = await sembrarMaterial({ titulo: `Listo ${SUFIJO}`, autorId: autores[0] ?? "", creadoEn: HACE_UN_DIA })
    materiales.push(listo)
    const almacen = almacenEnMemoria()
    for (const id of [abandonado, reciente]) {
      await almacen.subir(`materiales/${id}/original.pdf`, new TextEncoder().encode("pdf"), "application/pdf")
    }

    const resultado = await barrerMaterialesAbandonados({ db: clienteDeServicio(), almacen, ahora })

    expect(resultado.materiales).toContain(abandonado)
    expect(resultado.carpetasPendientes).toEqual([])
    expect(await existe(abandonado)).toBe(false)
    expect(await almacen.listar(`materiales/${abandonado}/`)).toEqual([])
    for (const id of [reciente, tomado, conMotivo, conCosto, marcado, listo]) {
      expect(resultado.materiales).not.toContain(id)
      expect(await existe(id)).toBe(true)
    }
    expect(await almacen.listar(`materiales/${reciente}/`)).toHaveLength(1)
  })

  it("keeps going when R2 fails: the row is gone and the folder is named as pending", async () => {
    const id = await enProcesando()
    const almacen = {
      borrarCarpeta: async (): Promise<number> => {
        throw new Error("R2 caído")
      },
    }
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await barrerMaterialesAbandonados({ db: clienteDeServicio(), almacen, ahora })

    expect(resultado.carpetasPendientes).toContain(id)
    expect(await existe(id)).toBe(false)
    expect(registro).toHaveBeenCalledWith(expect.stringContaining(id), expect.any(Error))
    registro.mockRestore()
  })
})
