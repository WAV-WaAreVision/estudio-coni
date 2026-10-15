import { afterAll, afterEach, describe, expect, it } from "vitest"
import { claveDeToma } from "@/lib/dominio/voz"
import { barrerGastos } from "@/lib/mantenimiento/gastos"
import { claveDeGastoDeVoz } from "@/lib/produccion/voz"
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
  await pool.query("delete from public.gastos where pieza_id = any($1::uuid[])", [piezasCreadas])
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
    const id = await pieza("guion_por_aprobar")
    const clave = await reservar(id, "elevenlabs", "voz")

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 0, liberados: 0 })
    expect((await gasto(clave)).estado).toBe("reservado")

    expect(await barrerGastos(deps(dentroDe(25)))).toEqual({ confirmados: 0, liberados: 1 })
    expect((await gasto(clave)).estado).toBe("liberado")
  })

  it("confirms a voice reservation once the piece has a voice", async () => {
    const id = await pieza("guion_por_aprobar")
    await pool.query("update public.piezas set audio_id = 'voces/x.mp3', version = version + 1 where id = $1", [id])
    const clave = await reservar(id, "elevenlabs", "voz")

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 1, liberados: 0 })
    expect(await gasto(clave)).toEqual({ estado: "confirmado", real: 0.25 })
  })
})

describe("barrerGastos con la clave de la voz por texto", () => {
  const HUELLA = "ab".repeat(32)

  async function reservarVoz(piezaId: string, intento: number): Promise<string> {
    const clave = claveDeGastoDeVoz(piezaId, HUELLA, intento)
    await pool.query("select public.reservar_gasto($1, 'elevenlabs', 'voz', 0.25, $2, now())", [piezaId, clave])
    return clave
  }

  async function usadoDelMes(): Promise<number> {
    const { rows } = await pool.query<{ total: number }>(
      "select coalesce(sum(case when estado = 'confirmado' then coalesce(real_usd, estimado_usd) else estimado_usd end), 0)::float8 as total from public.gastos where estado in ('reservado', 'confirmado')",
    )
    return rows[0]?.total ?? 0
  }

  async function conVoz(piezaId: string, audioId: string) {
    await pool.query("update public.piezas set audio_id = $2, version = version + 1 where id = $1", [piezaId, audioId])
  }

  it("releases the reservation of a failed 'record again' even though the piece keeps its earlier voice", async () => {
    const id = await pieza("guion_por_aprobar")
    await conVoz(id, claveDeToma(id, HUELLA, 0))
    const antes = await usadoDelMes()
    const clave = await reservarVoz(id, 1)
    expect(await usadoDelMes()).toBeCloseTo(antes + 0.25, 4)

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 0, liberados: 1 })

    expect((await gasto(clave)).estado).toBe("liberado")
    expect(await usadoDelMes()).toBeCloseTo(antes, 4)
  })

  it("confirms the reservation whose own take is the piece's voice", async () => {
    const id = await pieza("guion_por_aprobar")
    await conVoz(id, claveDeToma(id, HUELLA, 1))
    const clave = await reservarVoz(id, 1)

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 1, liberados: 0 })

    expect(await gasto(clave)).toEqual({ estado: "confirmado", real: 0.25 })
  })

  it("leaves the reservation of a piece still recording its voice until it is a day old", async () => {
    const id = await pieza("grabando_voz")
    const clave = await reservarVoz(id, 1)

    expect(await barrerGastos(deps(dentroDe(2)))).toEqual({ confirmados: 0, liberados: 0 })
    expect((await gasto(clave)).estado).toBe("reservado")

    expect(await barrerGastos(deps(dentroDe(25)))).toEqual({ confirmados: 0, liberados: 1 })
  })
})
