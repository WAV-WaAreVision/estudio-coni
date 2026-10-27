import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { conciliarRenders, type DepsConciliacion } from "@/lib/mantenimiento/conciliar"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { servidor } from "../msw"
import { pool } from "./db"
import { crearCarruselEn, crearPiezaEn } from "./flujo"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const CLAVE_HEYGEN = "hg_llave_de_coni_de_prueba"
const MINUTO = 60_000
const piezasCreadas: string[] = []

function dentroDe(minutos: number): () => string {
  return () => new Date(Date.now() + minutos * MINUTO).toISOString()
}

async function pieza(destino: "en_render" | "subtitulando", renderId: string | null, explicacion?: string) {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const id = await crearPiezaEn(c, destino)
    await c.query("update public.piezas set render_id = $2, explicacion = $3, version = version + 1 where id = $1", [
      id,
      renderId,
      explicacion ?? null,
    ])
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

interface Fila {
  estado: string
  explicacion: string | null
  estado_antes_del_error: string | null
  intento: number
}

async function leer(id: string): Promise<Fila> {
  const { rows } = await pool.query<Fila>(
    "select estado, explicacion, estado_antes_del_error, intento from public.piezas where id = $1",
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`No existe la pieza ${id}`)
  return fila
}

function simularHeygen(respuesta: Record<string, unknown>) {
  const lecturas: string[] = []
  servidor.use(
    http.get("https://api.heygen.com/v3/videos/:id", ({ params, request }) => {
      lecturas.push(`${String(params.id)}|${request.headers.get("x-api-key")}`)
      return HttpResponse.json({ data: { id: String(params.id), ...respuesta } })
    }),
  )
  return lecturas
}

function doble(ahora: () => string, cambios: Partial<DepsConciliacion> = {}) {
  const avisos = notificadorEnMemoria()
  const disparos: { piezaId: string; clave: string; intento: number }[] = []
  const deps: DepsConciliacion = {
    db: clienteDeServicio(),
    avisos,
    ahora,
    dispararGrabacion: async (piezaId, clave, intento) => {
      disparos.push({ piezaId, clave, intento })
    },
    ...cambios,
  }
  return { deps, avisos, disparos }
}

beforeEach(async () => {
  await pool.query("delete from vault.secrets where name = 'heygen'")
  await pool.query("select vault.create_secret($1, 'heygen')", [CLAVE_HEYGEN])
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'heygen'")
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  piezasCreadas.length = 0
})

async function carruselArmando(explicacion?: string) {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const id = await crearCarruselEn(c, "armando_carrusel")
    if (explicacion) {
      await c.query("update public.piezas set explicacion = $2, version = version + 1 where id = $1", [id, explicacion])
    }
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

describe("conciliarRenders", () => {
  it("does not even look at a render that has been going for less than 15 minutes", async () => {
    const id = await pieza("en_render", "v_1")
    const lecturas = simularHeygen({ status: "completed", video_url: "https://x" })
    const { deps, disparos } = doble(dentroDe(10))

    expect(await conciliarRenders(deps)).toEqual([])

    expect(lecturas).toEqual([])
    expect(disparos).toEqual([])
    expect((await leer(id)).estado).toBe("en_render")
  })

  it("resumes grabar-pieza once for a render HeyGen finished whose callback never arrived", async () => {
    const id = await pieza("en_render", "v_1")
    const lecturas = simularHeygen({ status: "completed", video_url: "https://x", subtitle_url: "https://y" })
    const { deps, disparos } = doble(dentroDe(20))

    const resultado = await conciliarRenders(deps)

    expect(resultado).toEqual([{ piezaId: id, resultado: "reanudada" }])
    expect(lecturas).toEqual([`v_1|${CLAVE_HEYGEN}`])
    expect(disparos).toEqual([{ piezaId: id, clave: `conciliar:${id}:0:en_render:v_1`, intento: 0 }])
    expect((await leer(id)).estado).toBe("en_render")
  })

  it("also resumes a render HeyGen reports as failed, so grabar-pieza explains it to Coni", async () => {
    const id = await pieza("en_render", "v_1")
    simularHeygen({ status: "failed", failure_code: "x", failure_message: "y" })
    const { deps, disparos } = doble(dentroDe(20))

    expect(await conciliarRenders(deps)).toEqual([{ piezaId: id, resultado: "reanudada" }])
    expect(disparos).toHaveLength(1)
  })

  it("leaves a render that is still processing alone until it has had an hour", async () => {
    const id = await pieza("en_render", "v_1")
    simularHeygen({ status: "processing" })
    const { deps, disparos, avisos } = doble(dentroDe(40))

    expect(await conciliarRenders(deps)).toEqual([{ piezaId: id, resultado: "esperando" }])

    expect(disparos).toEqual([])
    expect(avisos.aConiEnviados).toEqual([])
    expect((await leer(id)).estado).toBe("en_render")
  })

  it("gives up on a render that is still processing after an hour, tells Coni and WAV", async () => {
    const id = await pieza("en_render", "v_1")
    simularHeygen({ status: "processing" })
    const { deps, avisos, disparos } = doble(dentroDe(61))

    expect(await conciliarRenders(deps)).toEqual([{ piezaId: id, resultado: "falla_produccion" }])

    expect(await leer(id)).toMatchObject({ estado: "error_produccion", estado_antes_del_error: "en_render" })
    expect((await leer(id)).explicacion).toContain("tardó demasiado")
    expect(disparos).toEqual([])
    expect(avisos.aConiEnviados).toHaveLength(1)
    expect(avisos.aConiEnviados[0]).toMatchObject({ urgente: true })
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados[0]?.detalle).toContain("v_1")
  })

  it("gives up on a piece that never got a render after an hour, but not before", async () => {
    const id = await pieza("en_render", null)
    const { deps } = doble(dentroDe(30))
    expect(await conciliarRenders(deps)).toEqual([])
    expect((await leer(id)).estado).toBe("en_render")

    const { deps: tarde } = doble(dentroDe(61))
    expect(await conciliarRenders(tarde)).toEqual([{ piezaId: id, resultado: "falla_produccion" }])
    expect((await leer(id)).estado).toBe("error_produccion")
  })

  it("leaves alone a piece that is waiting for Coni to raise the spending cap", async () => {
    const id = await pieza("en_render", null, "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir.")
    const { deps } = doble(dentroDe(300))

    expect(await conciliarRenders(deps)).toEqual([])

    expect((await leer(id)).estado).toBe("en_render")
  })

  it("resumes a piece stuck in subtitulando once, and gives up on it after an hour", async () => {
    const id = await pieza("subtitulando", "v_1")
    simularHeygen({ status: "completed", video_url: "https://x", subtitle_url: "https://y" })
    const { deps, disparos } = doble(dentroDe(20))

    expect(await conciliarRenders(deps)).toEqual([{ piezaId: id, resultado: "reanudada" }])
    expect(disparos).toEqual([{ piezaId: id, clave: `conciliar:${id}:0:subtitulando:v_1`, intento: 0 }])

    const { deps: tarde, disparos: nuevos } = doble(dentroDe(61))
    expect(await conciliarRenders(tarde)).toEqual([{ piezaId: id, resultado: "falla_produccion" }])
    expect(nuevos).toEqual([])
    expect(await leer(id)).toMatchObject({ estado: "error_produccion", estado_antes_del_error: "subtitulando" })
  })

  it("keeps going when one piece cannot be read and raises the problem at the end", async () => {
    const mala = await pieza("en_render", "v_malo")
    const buena = await pieza("en_render", "v_1")
    servidor.use(
      http.get("https://api.heygen.com/v3/videos/:id", ({ params }) =>
        params.id === "v_malo"
          ? HttpResponse.json({ error: { code: "unauthorized", message: "no" } }, { status: 401 })
          : HttpResponse.json({ data: { id: "v_1", status: "completed", video_url: "https://x" } }),
      ),
    )
    const { deps, disparos } = doble(dentroDe(20))

    await expect(conciliarRenders(deps)).rejects.toThrow(new RegExp(mala))

    expect(disparos.map((d) => d.piezaId)).toEqual([buena])
  })

  it("raises a configuration error when Coni has not saved her HeyGen key", async () => {
    await pieza("en_render", "v_1")
    await pool.query("delete from vault.secrets where name = 'heygen'")
    const { deps } = doble(dentroDe(20))

    await expect(conciliarRenders(deps)).rejects.toThrow(/llave de HeyGen/)
  })
  it("hands a carousel stuck in armando_carrusel for an hour back to Coni, ready for Reintentar", async () => {
    const id = await carruselArmando()
    const temprano = doble(dentroDe(30))
    expect(await conciliarRenders(temprano.deps)).toEqual([])
    expect((await leer(id)).estado).toBe("armando_carrusel")

    const { deps, avisos } = doble(dentroDe(61))
    expect(await conciliarRenders(deps)).toEqual([{ piezaId: id, resultado: "falla_produccion" }])
    expect(await leer(id)).toMatchObject({
      estado: "error_produccion",
      estado_antes_del_error: "armando_carrusel",
      explicacion: "No pude armar el carrusel. WAV ya está revisando.",
    })
    const { rows } = await pool.query(
      "select estado from public.carruseles where pieza_id = $1 order by version desc limit 1",
      [id],
    )
    expect(rows[0].estado).toBe("fallo")
    expect(avisos.aWavEnviados.map((a) => a.asunto)).toEqual(["Un carrusel se quedó sin armar"])
  })

  it("leaves alone a carousel that waits with a reason (the spending cap)", async () => {
    const id = await carruselArmando("Llegaste al tope de gasto del mes.")
    const { deps } = doble(dentroDe(120))
    expect(await conciliarRenders(deps)).toEqual([])
    expect((await leer(id)).estado).toBe("armando_carrusel")
  })
})
