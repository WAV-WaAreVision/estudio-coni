import { afterAll, afterEach, describe, expect, it } from "vitest"
import { aplicarRetencion } from "@/lib/mantenimiento/retencion"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { comoConi, pool } from "./db"
import { aplicar, crearPiezaEn } from "./flujo"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const DIA = 86_400_000
const sinAnotar = async () => {}
const piezasCreadas: string[] = []

function dentroDe(dias: number): () => string {
  return () => new Date(Date.now() + dias * DIA).toISOString()
}

type Destino = Parameters<typeof crearPiezaEn>[1]

/** A piece walked to `destino` whose files have the keys the app really gives them (`videos/<id>/...`). */
async function pieza(destino: Destino, terminal?: "descartado"): Promise<{ id: string; audio: string; video: string }> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const id = await crearPiezaEn(c, destino)
    const audio = `voces/${id}/aaa.mp3`
    const video = `videos/${id}/vvv.mp4`
    await c.query("update public.piezas set audio_id = $2, video_id = $3, version = version + 1 where id = $1", [
      id,
      audio,
      video,
    ])
    if (terminal) await aplicar(c, id, comoConi, { tipo: "descartar" })
    await c.query("commit")
    piezasCreadas.push(id)
    return { id, audio, video }
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}

async function conArchivos(almacen: ReturnType<typeof almacenEnMemoria>, ...claves: string[]) {
  for (const clave of claves) await almacen.subir(clave, new Uint8Array([1, 2, 3]), "application/octet-stream")
}

async function borradoEn(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ b: string | null }>(
    "select archivos_borrados_en::text as b from public.piezas where id = $1",
    [id],
  )
  return rows[0]?.b ?? null
}

afterEach(async () => {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  piezasCreadas.length = 0
})

describe("aplicarRetencion", () => {
  it("deletes the final video 30 days after the piece was published, and keeps the voice", async () => {
    const p = await pieza("publicado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)

    const resultado = await aplicarRetencion({
      db: clienteDeServicio(),
      almacen,
      anotarBorrado: sinAnotar,
      ahora: dentroDe(31),
    })

    expect(resultado).toEqual({ piezas: 1, archivos: 1 })
    expect(almacen.claves()).toEqual([p.audio])
    expect(await borradoEn(p.id)).not.toBeNull()
  })

  it("keeps the files of a piece published less than 30 days ago", async () => {
    const p = await pieza("publicado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)

    expect(
      await aplicarRetencion({ db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora: dentroDe(29) }),
    ).toEqual({
      piezas: 0,
      archivos: 0,
    })

    expect(almacen.claves().sort()).toEqual([p.audio, p.video].sort())
    expect(await borradoEn(p.id)).toBeNull()
  })

  it("deletes the voice and the video of a discarded piece 30 days after it was discarded", async () => {
    const p = await pieza("video_por_aprobar", "descartado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)

    expect(
      await aplicarRetencion({ db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora: dentroDe(31) }),
    ).toEqual({
      piezas: 1,
      archivos: 2,
    })

    expect(almacen.claves()).toEqual([])
  })

  it("deletes every take of a discarded piece, not only the one it ends with, and nothing of another piece", async () => {
    const p = await pieza("video_por_aprobar", "descartado")
    const otra = await pieza("publicado")
    const tomas = [`voces/${p.id}/t-${"a".repeat(64)}-0.mp3`, `voces/${p.id}/t-${"b".repeat(64)}-3.mp3`]
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video, ...tomas, otra.audio)

    await aplicarRetencion({ db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora: dentroDe(31) })

    expect(almacen.claves().filter((clave) => clave.includes(p.id))).toEqual([])
    expect(almacen.claves()).toContain(otra.audio)
  })

  it("deletes the final video 30 days after Coni uploaded it by hand", async () => {
    const p = await pieza("publicado_a_mano")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)

    expect(
      await aplicarRetencion({ db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora: dentroDe(31) }),
    ).toEqual({
      piezas: 1,
      archivos: 1,
    })

    expect(almacen.claves()).toEqual([p.audio])
  })

  it("keeps the video of a piece that still waits for Coni to upload it, however old", async () => {
    const p = await pieza("para_subir_a_mano")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)

    expect(
      await aplicarRetencion({ db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora: dentroDe(400) }),
    ).toEqual({
      piezas: 0,
      archivos: 0,
    })

    expect(almacen.claves()).toHaveLength(2)
  })

  it("never touches a piece that is still in the flow, however old", async () => {
    const p = await pieza("video_por_aprobar")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)

    expect(
      await aplicarRetencion({ db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora: dentroDe(400) }),
    ).toEqual({
      piezas: 0,
      archivos: 0,
    })

    expect(almacen.claves()).toHaveLength(2)
  })

  it("does not look at a piece twice", async () => {
    const p = await pieza("publicado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.video)
    const deps = { db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora: dentroDe(31) }

    await aplicarRetencion(deps)
    expect(await aplicarRetencion(deps)).toEqual({ piezas: 0, archivos: 0 })
  })

  it("refuses to delete a key that is not inside the folders of its own piece", async () => {
    const p = await pieza("publicado")
    const otra = "videos/00000000-0000-4000-8000-000000000000/ajeno.mp4"
    await pool.query("update public.piezas set video_id = $2, version = version + 1 where id = $1", [p.id, otra])
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, otra)

    await expect(
      aplicarRetencion({ db: clienteDeServicio(), almacen, anotarBorrado: sinAnotar, ahora: dentroDe(31) }),
    ).rejects.toThrow(/no pertenece/)

    expect(almacen.claves()).toEqual([otra])
  })

  it("writes down how many files it deleted under the videos_de_piezas rule", async () => {
    const p = await pieza("video_por_aprobar", "descartado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)
    const anotados: [string, number][] = []

    await aplicarRetencion({
      db: clienteDeServicio(),
      almacen,
      anotarBorrado: async (regla, cantidad) => {
        anotados.push([regla, cantidad])
      },
      ahora: dentroDe(31),
    })

    expect(anotados).toEqual([["videos_de_piezas", 2]])
  })

  it("writes nothing down on a night with nothing to delete", async () => {
    const p = await pieza("publicado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)
    const anotados: [string, number][] = []

    await aplicarRetencion({
      db: clienteDeServicio(),
      almacen,
      anotarBorrado: async (regla, cantidad) => {
        anotados.push([regla, cantidad])
      },
      ahora: dentroDe(29),
    })

    expect(anotados).toEqual([])
  })

  it("keeps the deleted files and fails the step when the log cannot be written", async () => {
    const p = await pieza("publicado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)

    await expect(
      aplicarRetencion({
        db: clienteDeServicio(),
        almacen,
        anotarBorrado: async () => {
          throw new Error("No pude anotar el borrado de videos_de_piezas: sin conexión")
        },
        ahora: dentroDe(31),
      }),
    ).rejects.toThrow(/sin conexión/)

    expect(almacen.claves()).toEqual([p.audio])
    expect(await borradoEn(p.id)).not.toBeNull()
  })

  it("writes down only the files it really deleted when the store fails halfway through a piece", async () => {
    const p = await pieza("video_por_aprobar", "descartado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, p.audio, p.video)
    let intentos = 0
    const quebradizo = {
      ...almacen,
      async borrar(clave: string) {
        intentos += 1
        if (intentos === 2) throw new Error("R2 no responde")
        await almacen.borrar(clave)
      },
    }
    const anotados: [string, number][] = []

    await expect(
      aplicarRetencion({
        db: clienteDeServicio(),
        almacen: quebradizo,
        anotarBorrado: async (regla, cantidad) => {
          anotados.push([regla, cantidad])
        },
        ahora: dentroDe(31),
      }),
    ).rejects.toThrow(/R2 no responde/)

    expect(anotados).toEqual([["videos_de_piezas", 1]])
    expect(almacen.claves()).toHaveLength(1)
  })

  it("writes down the files of the good piece on a night another piece fails", async () => {
    const mala = await pieza("publicado")
    const ajeno = "videos/00000000-0000-4000-8000-000000000000/ajeno.mp4"
    await pool.query("update public.piezas set video_id = $2, version = version + 1 where id = $1", [mala.id, ajeno])
    const buena = await pieza("publicado")
    const almacen = almacenEnMemoria()
    await conArchivos(almacen, ajeno, buena.audio, buena.video)
    const anotados: [string, number][] = []

    await expect(
      aplicarRetencion({
        db: clienteDeServicio(),
        almacen,
        anotarBorrado: async (regla, cantidad) => {
          anotados.push([regla, cantidad])
        },
        ahora: dentroDe(31),
      }),
    ).rejects.toThrow(/no pertenece/)

    expect(anotados).toEqual([["videos_de_piezas", 1]])
    expect(almacen.claves().sort()).toEqual([ajeno, buena.audio].sort())
  })
})
