import { afterAll, afterEach, describe, expect, it } from "vitest"
import { barrerGastos } from "@/lib/mantenimiento/gastos"
import { pool } from "./db"
import { crearPiezaEn } from "./flujo"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const HORA = 3_600_000
const piezasCreadas: string[] = []

function dentroDe(horas: number): () => string {
  return () => new Date(Date.now() + horas * HORA).toISOString()
}

type Destino = Parameters<typeof crearPiezaEn>[1]

async function pieza(destino: Destino, renderId?: string): Promise<string> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const id = await crearPiezaEn(c, destino)
    if (renderId)
      await c.query("update public.piezas set render_id = $2, version = version + 1 where id = $1", [id, renderId])
    await c.query("commit")
    piezasCreadas.push(id)
    return id
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}

async function reservar(piezaId: string | null, proveedor: string, paso: string, estimado = 0.25): Promise<string> {
  const clave = `barrido-${proveedor}-${piezaId ?? "sin-pieza"}-${paso}`
  await pool.query("select public.reservar_gasto($1, $2, $3, $4, $5, now())", [
    piezaId,
    proveedor,
    paso,
    estimado,
    clave,
  ])
  return clave
}

interface Gasto {
  estado: string
  real: number | null
}

async function gasto(clave: string): Promise<Gasto> {
  const { rows } = await pool.query<Gasto>(
    "select estado, real_usd::float8 as real from public.gastos where clave = $1",
    [clave],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`No existe el gasto ${clave}`)
  return fila
}

afterEach(async () => {
  await pool.query("delete from public.gastos where clave like 'barrido-%'")
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  piezasCreadas.length = 0
})

const deps = (ahora: () => string) => ({ db: clienteDeServicio(), ahora })

describe("barrerGastos", () => {
  it("leaves a reservation alone during its first hour", async () => {
    const id = await pieza("en_render")
    const clave = await reservar(id, "heygen", "grabar")

    expect(await barrerGastos(deps(dentroDe(0.5)))).toEqual({ confirmados: 0, liberados: 0 })

    expect((await gasto(clave)).estado).toBe("reservado")
  })

  it("confirms at the estimate a HeyGen reservation whose video was created", async () => {
    const id = await pieza("en_render", "v_1")
    const clave = await reservar(id, "heygen", "grabar", 0.1867)

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 1, liberados: 0 })

    expect(await gasto(clave)).toEqual({ estado: "confirmado", real: 0.1867 })
  })

  it("confirms a HeyGen reservation whose piece is already past the render", async () => {
    const id = await pieza("video_por_aprobar")
    const clave = await reservar(id, "heygen", "grabar")

    await barrerGastos(deps(dentroDe(2)))

    expect((await gasto(clave)).estado).toBe("confirmado")
  })

  it("confirms a HeyGen reservation whose piece is waiting to be uploaded by hand or already was", async () => {
    for (const destino of ["para_subir_a_mano", "publicado_a_mano"] as const) {
      const id = await pieza(destino)
      const clave = await reservar(id, "heygen", "grabar")

      await barrerGastos(deps(dentroDe(2)))

      expect((await gasto(clave)).estado, destino).toBe("confirmado")
    }
  })

  it("confirms the Claude reservation of a piece whose script is already waiting for Coni", async () => {
    const id = await pieza("guion_por_aprobar")
    const claude = await reservar(id, "anthropic", "guion")

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 1, liberados: 0 })

    expect((await gasto(claude)).estado).toBe("confirmado")
  })

  it("does not decide about a reservation whose step is not over until it is a day old, then releases it", async () => {
    const id = await pieza("en_render")
    const clave = await reservar(id, "heygen", "grabar")

    expect(await barrerGastos(deps(dentroDe(23)))).toEqual({ confirmados: 0, liberados: 0 })
    expect((await gasto(clave)).estado).toBe("reservado")

    expect(await barrerGastos(deps(dentroDe(25)))).toEqual({ confirmados: 0, liberados: 1 })
    expect((await gasto(clave)).estado).toBe("liberado")
  })

  it("releases, after a day, a reservation of a script step that never got to save a draft", async () => {
    const id = await pieza("guion_en_proceso")
    const clave = await reservar(id, "anthropic", "guion")

    await barrerGastos(deps(dentroDe(25)))

    expect((await gasto(clave)).estado).toBe("liberado")
  })

  it("releases, after a day, a reservation that belongs to no piece", async () => {
    const clave = await reservar(null, "heygen", "grabar")

    await barrerGastos(deps(dentroDe(25)))

    expect((await gasto(clave)).estado).toBe("liberado")
  })

  it("does not touch what was already confirmed or released", async () => {
    const id = await pieza("video_por_aprobar")
    const clave = await reservar(id, "heygen", "grabar", 0.2)
    await pool.query("select public.confirmar_gasto($1, 0.15)", [clave])

    expect(await barrerGastos(deps(dentroDe(48)))).toEqual({ confirmados: 0, liberados: 0 })

    expect(await gasto(clave)).toEqual({ estado: "confirmado", real: 0.15 })
  })
})

describe("barrerGastos con la voz aparte", () => {
  it("keeps a voice reservation open while the piece has no voice, and releases it after a day", async () => {
    const id = await pieza("guion_aprobado")
    const clave = await reservar(id, "elevenlabs", "voz")

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 0, liberados: 0 })
    expect((await gasto(clave)).estado).toBe("reservado")

    expect(await barrerGastos(deps(dentroDe(25)))).toEqual({ confirmados: 0, liberados: 1 })
    expect((await gasto(clave)).estado).toBe("liberado")
  })

  it("confirms a voice reservation once the piece has a voice", async () => {
    const id = await pieza("guion_aprobado")
    await pool.query("update public.piezas set audio_id = 'voces/x.mp3', version = version + 1 where id = $1", [id])
    const clave = await reservar(id, "elevenlabs", "voz")

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 1, liberados: 0 })
    expect(await gasto(clave)).toEqual({ estado: "confirmado", real: 0.25 })
  })
})
