import { afterAll, afterEach, describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { alFallarDeTarea, avisarFalla, type DepsFalla } from "@/lib/produccion/fallas"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { crearPiezaEn } from "./flujo"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const piezasCreadas: string[] = []

afterEach(async () => {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  piezasCreadas.length = 0
})

async function piezaEn(
  destino: "guion_en_proceso" | "grabando_voz" | "en_render" | "subtitulando" | "video_por_aprobar",
) {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const id = await crearPiezaEn(c, destino)
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
  version: number
  explicacion: string | null
  estado_antes_del_error: string | null
}

async function pieza(id: string): Promise<Fila> {
  const { rows } = await pool.query<Fila>(
    "select estado, version, explicacion, estado_antes_del_error from public.piezas where id = $1",
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`No existe la pieza ${id}`)
  return fila
}

function doble(cambios: Partial<DepsFalla> = {}) {
  const avisos = notificadorEnMemoria()
  const deps: DepsFalla = { db: clienteDeServicio(), avisos, ...cambios }
  return { deps, avisos }
}

const GENERICO_VIDEO = "Algo falló al preparar tu video. WAV ya está revisando."
const GENERICO_GUION = "Algo falló al preparar tu guion. WAV ya está revisando."

describe("avisarFalla", () => {
  it("returns a piece left in grabando_voz to guion_por_aprobar with a generic text when grabar-voz gives up", async () => {
    const id = await piezaEn("grabando_voz")
    const { deps } = doble()

    await avisarFalla(deps, { tarea: "grabar-voz", corrida: "run_9", piezaId: id, error: new Error("boom") })

    expect(await pieza(id)).toMatchObject({
      estado: "guion_por_aprobar",
      explicacion: "Algo falló al grabar la voz. WAV ya está revisando. Puedes volver a intentarlo.",
      estado_antes_del_error: null,
    })
  })

  it("shows Coni the message of a Falla from grabar-voz", async () => {
    const id = await piezaEn("grabando_voz")
    const { deps } = doble()

    await avisarFalla(deps, {
      tarea: "grabar-voz",
      corrida: "run_10",
      piezaId: id,
      error: new Falla("Sin caracteres."),
    })

    expect((await pieza(id)).explicacion).toBe("Sin caracteres.")
  })
  it("moves a piece left in en_render to error_produccion, tells Coni plainly and gives WAV the technical detail", async () => {
    const id = await piezaEn("en_render")
    const { deps, avisos } = doble()

    await avisarFalla(deps, {
      tarea: "grabar-pieza",
      corrida: "run_123",
      piezaId: id,
      error: new Error("HeyGen sigue procesando el video v_1."),
    })

    expect(await pieza(id)).toMatchObject({
      estado: "error_produccion",
      estado_antes_del_error: "en_render",
      explicacion: GENERICO_VIDEO,
    })
    expect(avisos.aConiEnviados).toEqual([{ mensaje: GENERICO_VIDEO, urgente: true }])
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados[0]?.asunto).toContain("grabar-pieza")
    const detalle = avisos.aWavEnviados[0]?.detalle ?? ""
    expect(detalle).toContain("run_123")
    expect(detalle).toContain(id)
    expect(detalle).toContain("HeyGen sigue procesando el video v_1.")
  })

  it("does the same for a piece left in subtitulando, keeping that as the step to retry from", async () => {
    const id = await piezaEn("subtitulando")
    const { deps } = doble()

    await avisarFalla(deps, { tarea: "grabar-pieza", corrida: "run_1", piezaId: id, error: new Error("ffmpeg falló") })

    expect(await pieza(id)).toMatchObject({ estado: "error_produccion", estado_antes_del_error: "subtitulando" })
  })

  it("leaves the piece where it is and only writes why when the script step failed", async () => {
    const id = await piezaEn("guion_en_proceso")
    const antes = await pieza(id)
    const { deps, avisos } = doble()

    await avisarFalla(deps, {
      tarea: "producir-pieza",
      corrida: "run_2",
      piezaId: id,
      error: new FallaDeConfiguracion("Falta la llave de Anthropic"),
    })

    expect(await pieza(id)).toMatchObject({
      estado: "guion_en_proceso",
      version: antes.version + 1,
      explicacion: GENERICO_GUION,
    })
    expect(avisos.aConiEnviados).toEqual([{ mensaje: GENERICO_GUION, urgente: true }])
    expect(avisos.aWavEnviados[0]?.detalle).toContain("Falta la llave de Anthropic")
    // WAV's message is never what Coni reads.
    expect(avisos.aConiEnviados[0]?.mensaje).not.toContain("Anthropic")
  })

  it("shows Coni the message of an error written for her", async () => {
    const id = await piezaEn("en_render")
    const { deps, avisos } = doble()

    await avisarFalla(deps, {
      tarea: "grabar-pieza",
      corrida: "run_3",
      piezaId: id,
      error: new Falla("Tu cuenta de HeyGen no tiene créditos para este video."),
    })

    expect((await pieza(id)).explicacion).toBe("Tu cuenta de HeyGen no tiene créditos para este video.")
    expect(avisos.aConiEnviados[0]?.mensaje).toBe("Tu cuenta de HeyGen no tiene créditos para este video.")
  })

  it("does not touch a piece that already moved on, and does not alarm Coni, but still tells WAV", async () => {
    const id = await piezaEn("video_por_aprobar")
    const antes = await pieza(id)
    const { deps, avisos } = doble()

    await avisarFalla(deps, { tarea: "grabar-pieza", corrida: "run_4", piezaId: id, error: new Error("tarde") })

    expect(await pieza(id)).toEqual(antes)
    expect(avisos.aConiEnviados).toEqual([])
    expect(avisos.aWavEnviados).toHaveLength(1)
  })

  it("only alerts WAV when the task has no piece, like the publish cron", async () => {
    const { deps, avisos } = doble()

    await avisarFalla(deps, { tarea: "publicar-pendientes", corrida: "run_5", error: new Error("Instagram caído") })

    expect(avisos.aConiEnviados).toEqual([])
    expect(avisos.aWavEnviados).toHaveLength(1)
    expect(avisos.aWavEnviados[0]?.detalle).toContain("Instagram caído")
  })

  it("includes the cause of an error in the detail for WAV", async () => {
    const { deps, avisos } = doble()

    await avisarFalla(deps, {
      tarea: "publicar-pendientes",
      corrida: "run_6",
      error: new Error("No pude conectar con Instagram.", { cause: new Error("ECONNRESET") }),
    })

    expect(avisos.aWavEnviados[0]?.detalle).toContain("ECONNRESET")
  })

  it("still alerts WAV when the notice to Coni cannot be sent, and then raises the error", async () => {
    const id = await piezaEn("en_render")
    const avisos = notificadorEnMemoria()
    const roto = { ...avisos, aConi: async () => Promise.reject(new Error("Resend caído")) }
    const { deps } = doble({ avisos: roto })

    await expect(
      avisarFalla(deps, { tarea: "grabar-pieza", corrida: "run_7", piezaId: id, error: new Error("x") }),
    ).rejects.toThrow(/Resend caído/)

    expect(avisos.aWavEnviados).toHaveLength(1)
    expect((await pieza(id)).estado).toBe("error_produccion")
  })
})

describe("alFallarDeTarea", () => {
  it("builds the onFailure hook of a task: the piece comes from the payload and the run from the context", async () => {
    const id = await piezaEn("en_render")
    const { deps, avisos } = doble()

    await alFallarDeTarea(
      "grabar-pieza",
      () => deps,
    )({
      payload: { piezaId: id },
      error: new Error("x"),
      ctx: { run: { id: "run_9" } },
    })

    expect((await pieza(id)).estado).toBe("error_produccion")
    expect(avisos.aWavEnviados[0]?.detalle).toContain("run_9")
  })

  it("alerts WAV only when the payload has no piece, like the cron of the publish task", async () => {
    const { deps, avisos } = doble()

    await alFallarDeTarea(
      "publicar-pendientes",
      () => deps,
    )({
      payload: { scheduleId: "sched_1", timestamp: new Date() },
      error: new Error("x"),
      ctx: { run: { id: "run_10" } },
    })

    expect(avisos.aConiEnviados).toEqual([])
    expect(avisos.aWavEnviados).toHaveLength(1)
  })
})
