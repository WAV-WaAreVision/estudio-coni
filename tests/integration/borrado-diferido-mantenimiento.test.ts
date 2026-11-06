import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { afterAll, describe, expect, it, vi } from "vitest"
import { borrarLoMarcado, MARGEN_DE_BORRADO_MS } from "@/lib/mantenimiento/borrado-diferido"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeServicio, credencialesDeServicio } from "./servicio"
import { borrarSembrado, sembrarAutor, sembrarMaterial } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)
const materiales: string[] = []
const autores: string[] = []

afterAll(async () => {
  await borrarSembrado(materiales, [], autores)
  await pool.end()
})

async function marcado(hace: string): Promise<string> {
  const autor = await sembrarAutor(`Autora del barrido ${SUFIJO} ${randomUUID().slice(0, 4)}`)
  autores.push(autor)
  const id = await sembrarMaterial({ titulo: `Barrido ${SUFIJO}`, autorId: autor })
  materiales.push(id)
  await pool.query("update public.materiales set borrar_desde = now() - $2::interval where id = $1", [id, hace])
  return id
}

const existe = async (id: string) =>
  ((await pool.query("select 1 from public.materiales where id = $1", [id])).rowCount ?? 0) > 0

describe("borrarLoMarcado", () => {
  it("waits one minute after the mark", () => {
    expect(MARGEN_DE_BORRADO_MS).toBe(60_000)
  })

  it("deletes what was marked over a minute ago and its R2 folder, and leaves what was marked seconds ago", async () => {
    const viejo = await marcado("5 minutes")
    const reciente = await marcado("20 seconds")
    const almacen = almacenEnMemoria()
    for (const id of [viejo, reciente]) {
      await almacen.subir(`materiales/${id}/texto-original.txt`, new TextEncoder().encode("hola"), "text/plain")
    }

    const resultado = await borrarLoMarcado({ db: clienteDeServicio(), almacen, ahora: () => new Date().toISOString() })

    expect(resultado.materiales).toBeGreaterThanOrEqual(1)
    expect(resultado.carpetasPendientes).toEqual([])
    expect(await existe(viejo)).toBe(false)
    expect(await existe(reciente)).toBe(true)
    expect(await almacen.listar(`materiales/${viejo}/`)).toEqual([])
    expect(await almacen.listar(`materiales/${reciente}/`)).toHaveLength(1)
  })

  it("keeps going when R2 fails: the rows are gone, the folder is logged as pending", async () => {
    const id = await marcado("5 minutes")
    const almacen = {
      borrarCarpeta: async (): Promise<number> => {
        throw new Error("R2 caído")
      },
    }
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await borrarLoMarcado({ db: clienteDeServicio(), almacen, ahora: () => new Date().toISOString() })

    expect(resultado.carpetasPendientes).toContain(id)
    expect(await existe(id)).toBe(false)
    expect(registro).toHaveBeenCalledWith(expect.stringContaining(id), expect.any(Error))
    registro.mockRestore()
  })

  it("deletes the other folders when one fails, and names only the failing one", async () => {
    const [falla, sana, otraSana] = [await marcado("5 minutes"), await marcado("5 minutes"), await marcado("5 minutes")]
    const borradas: string[] = []
    const almacen = {
      borrarCarpeta: async (materialId: string): Promise<number> => {
        if (materialId === falla) throw new Error("R2 caído")
        borradas.push(materialId)
        return 1
      },
    }
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const resultado = await borrarLoMarcado({ db: clienteDeServicio(), almacen, ahora: () => new Date().toISOString() })

    expect(resultado.carpetasPendientes).toEqual([falla])
    expect(borradas).toEqual(expect.arrayContaining([sana, otraSana]))
    expect(registro).toHaveBeenCalledTimes(1)
    expect(registro).toHaveBeenCalledWith(expect.stringContaining(falla), expect.any(Error))
    registro.mockRestore()
  })

  it("raises the database's error instead of reporting nothing deleted", async () => {
    const id = await marcado("5 minutes")
    const sinPermiso = createClient<Database>(credencialesDeServicio().url, "clave-que-no-existe", {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const almacen = { borrarCarpeta: vi.fn(async (): Promise<number> => 0) }

    await expect(borrarLoMarcado({ db: sinPermiso, almacen, ahora: () => new Date().toISOString() })).rejects.toThrow(
      /No pude borrar lo marcado/,
    )
    expect(almacen.borrarCarpeta).not.toHaveBeenCalled()
    expect(await existe(id)).toBe(true)
  })
})
