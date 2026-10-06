import { HttpResponse } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { hashTexto } from "@/lib/dominio/puertas"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { EXPLICACION_RECONECTAR } from "@/lib/proveedores/instagram"
import { type DepsPublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
import { type OpcionesInstagram, simularInstagram } from "../instagram-msw"
import { comoConi, pool } from "./db"
import { aplicar, crearPiezaEn, TEXTO, VIDEO } from "./flujo"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const TOKEN = "IGAA_token_de_coni_de_prueba"
const CUENTA = "17841400000000001"
const MINUTO = 60_000
// Far from any real piece in the database: the approved time is a fixed instant and "now" moves around it.
const PUBLICAR_EN = "2031-03-14T22:00:00.000Z"
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])

function despues(minutos: number): string {
  return new Date(Date.parse(PUBLICAR_EN) + minutos * MINUTO).toISOString()
}

const piezasCreadas: string[] = []

/** A piece walked through the real flow to `programado`: Coni approved the video, the caption and PUBLICAR_EN. */
async function crearProgramada(publicarEn = PUBLICAR_EN): Promise<string> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const id = await crearPiezaEn(c, "video_por_aprobar")
    await aplicar(c, id, comoConi, {
      tipo: "aprobar_video",
      actor: "coni",
      videoVisto: VIDEO,
      hashTextoVisto: hashTexto(TEXTO),
      hashTextoActual: hashTexto(TEXTO),
      formula: 1,
      publicarEn,
      en: new Date().toISOString(),
    })
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

interface FilaPieza {
  estado: string
  version: number
  intento: number
  explicacion: string | null
  contenedor_id: string | null
  contenedor_clave: string | null
  publicacion_enviada_en: string | null
  publicacion_reclamada_hasta: string | null
  media_id: string | null
  permalink: string | null
  puerta2_hash_texto: string | null
  estado_antes_del_error: string | null
}

async function pieza(id: string): Promise<FilaPieza> {
  const { rows } = await pool.query<FilaPieza>(
    `select estado, version, intento, explicacion, contenedor_id, contenedor_clave, publicacion_enviada_en,
            publicacion_reclamada_hasta, media_id, permalink, puerta2_hash_texto, estado_antes_del_error
       from public.piezas where id = $1`,
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`No existe la pieza ${id}`)
  return fila
}

interface Doble {
  deps: DepsPublicacion
  almacen: ReturnType<typeof almacenEnMemoria>
  avisos: ReturnType<typeof notificadorEnMemoria>
  pausas: number[]
}

function doble(ahora: () => string, cambios: Partial<DepsPublicacion> = {}): Doble {
  const almacen = almacenEnMemoria()
  const avisos = notificadorEnMemoria()
  const pausas: number[] = []
  const deps: DepsPublicacion = {
    db: clienteDeServicio(),
    almacen,
    avisos,
    ahora,
    dormir: async (ms) => {
      pausas.push(ms)
    },
    sondeo: { cadaMs: 60_000, veces: 5 },
    ...cambios,
  }
  return { deps, almacen, avisos, pausas }
}

async function conVideoEnAlmacen(almacen: Doble["almacen"]): Promise<void> {
  await almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
}

function simular(opciones: Partial<OpcionesInstagram> = {}) {
  return simularInstagram({ cuenta: CUENTA, ...opciones })
}

beforeEach(async () => {
  await pool.query("update public.ajustes set meta_cuenta_id = $1", [CUENTA])
  await pool.query("delete from vault.secrets where name = 'meta'")
  await pool.query("select vault.create_secret($1, 'meta')", [TOKEN])
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'meta'")
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  piezasCreadas.length = 0
  await pool.query("update public.ajustes set meta_cuenta_id = null")
})

describe("publicarPendientes", () => {
  it("publishes a piece whose approved time has come, reads it back and marks it published", async () => {
    const id = await crearProgramada()
    const sim = simular({ estados: ["IN_PROGRESS", "FINISHED"] })
    const d = doble(() => despues(1))
    await conVideoEnAlmacen(d.almacen)

    const resultado = await publicarPendientes(d.deps)

    expect(resultado).toEqual([{ piezaId: id, resultado: "publicada" }])
    const fila = await pieza(id)
    expect(fila).toMatchObject({
      estado: "publicado",
      media_id: "media_1",
      permalink: "https://www.instagram.com/reel/media_1/",
      explicacion: null,
      publicacion_reclamada_hasta: null,
    })
    expect(sim.contenedores).toHaveLength(1)
    expect(sim.contenedores[0]).toMatchObject({
      media_type: "REELS",
      caption: TEXTO,
      is_ai_generated: true,
      access_token: TOKEN,
    })
    expect(sim.contenedores[0]?.video_url).toBe(`https://almacen.test/${VIDEO}?expira=3600`)
    expect(sim.publicaciones).toEqual([{ creation_id: "contenedor_1", access_token: TOKEN }])
    expect(sim.lecturas).toEqual(["media_1"])
    expect(d.pausas).toEqual([60_000])
    expect(d.avisos.aConiEnviados).toHaveLength(1)
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain("publicado")
    expect(d.avisos.aWavEnviados).toEqual([])
  })

  it("leaves the audit trail of the publication as the service role", async () => {
    const id = await crearProgramada()
    simular()
    const d = doble(() => despues(1))
    await conVideoEnAlmacen(d.almacen)

    await publicarPendientes(d.deps)

    const { rows } = await pool.query<{ actor_rol: string; estado: string }>(
      "select actor_rol, datos ->> 'estado' as estado from public.eventos where pieza_id = $1 and tabla = 'piezas' order by id desc limit 1",
      [id],
    )
    expect(rows[0]).toEqual({ actor_rol: "service_role", estado: "publicado" })
  })

  it("does nothing before the approved time", async () => {
    const id = await crearProgramada()
    const sim = simular()
    const d = doble(() => despues(-1))
    await conVideoEnAlmacen(d.almacen)

    expect(await publicarPendientes(d.deps)).toEqual([])

    expect((await pieza(id)).estado).toBe("programado")
    expect(sim.contenedores).toEqual([])
    expect(d.avisos.aConiEnviados).toEqual([])
  })

  it("still publishes 29 minutes after the approved time", async () => {
    const id = await crearProgramada()
    simular()
    const d = doble(() => despues(29))
    await conVideoEnAlmacen(d.almacen)

    await publicarPendientes(d.deps)

    expect((await pieza(id)).estado).toBe("publicado")
  })

  it("sends a piece 31 minutes late back to Coni without calling Instagram", async () => {
    const id = await crearProgramada()
    const sim = simular()
    const d = doble(() => despues(31))
    await conVideoEnAlmacen(d.almacen)

    const resultado = await publicarPendientes(d.deps)

    expect(resultado).toEqual([{ piezaId: id, resultado: "hora_vencida" }])
    const fila = await pieza(id)
    expect(fila).toMatchObject({
      estado: "video_por_aprobar",
      intento: 1,
      puerta2_hash_texto: null,
      explicacion: "La hora aprobada pasó sin publicarse. Elige una nueva fecha.",
      publicacion_reclamada_hasta: null,
    })
    expect(sim.contenedores).toEqual([])
    expect(sim.publicaciones).toEqual([])
    expect(d.avisos.aConiEnviados).toHaveLength(1)
    expect(d.avisos.aConiEnviados[0]).toMatchObject({ urgente: true })
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain("nueva fecha")
    expect(d.avisos.aWavEnviados).toEqual([])
  })

  it("does not publish when the approved time passes while the container is still being processed", async () => {
    const id = await crearProgramada()
    const sim = simular({ estados: ["IN_PROGRESS", "FINISHED"] })
    // On time when the piece is taken; by the time the container is ready, the window has closed.
    let reloj = despues(25)
    const d = doble(() => reloj, {
      dormir: async () => {
        reloj = despues(40)
      },
    })
    await conVideoEnAlmacen(d.almacen)

    const resultado = await publicarPendientes(d.deps)

    expect(resultado).toEqual([{ piezaId: id, resultado: "hora_vencida" }])
    expect(sim.publicaciones).toEqual([])
    expect((await pieza(id)).estado).toBe("video_por_aprobar")
  })

  it("marks the publication as failed when the read-back has no AI label, and tells Coni and WAV", async () => {
    const id = await crearProgramada()
    simular({
      leer: (honesta) => {
        const { is_ai_generated: _etiqueta, ...sinEtiqueta } = honesta
        return sinEtiqueta
      },
    })
    const d = doble(() => despues(1))
    await conVideoEnAlmacen(d.almacen)

    const resultado = await publicarPendientes(d.deps)

    expect(resultado).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
    const fila = await pieza(id)
    expect(fila.estado).toBe("error_publicacion")
    expect(fila.estado_antes_del_error).toBe("programado")
    // The post is live: its id is kept so nobody publishes it a second time.
    expect(fila.media_id).toBe("media_1")
    expect(fila.explicacion).toContain("etiqueta")
    expect(fila.explicacion).not.toContain("—")
    expect(d.avisos.aConiEnviados[0]).toMatchObject({ urgente: true })
    expect(d.avisos.aWavEnviados).toHaveLength(1)
    expect(d.avisos.aWavEnviados[0]?.detalle).toContain("media_1")
  })

  it("marks the publication as failed when the caption that came back is not the approved text", async () => {
    const id = await crearProgramada()
    simular({ leer: (honesta) => ({ ...honesta, caption: "Otro texto" }) })
    const d = doble(() => despues(1))
    await conVideoEnAlmacen(d.almacen)

    await publicarPendientes(d.deps)

    const fila = await pieza(id)
    expect(fila.estado).toBe("error_publicacion")
    expect(fila.explicacion).toContain("texto")
    expect(d.avisos.aWavEnviados).toHaveLength(1)
  })

  it("marks the publication as failed when what was published is not a Reel", async () => {
    const id = await crearProgramada()
    simular({ leer: (honesta) => ({ ...honesta, media_product_type: "FEED" }) })
    const d = doble(() => despues(1))
    await conVideoEnAlmacen(d.almacen)

    await publicarPendientes(d.deps)

    expect((await pieza(id)).estado).toBe("error_publicacion")
  })

  it("accepts a caption that only differs in line endings and surrounding blanks", async () => {
    const id = await crearProgramada()
    simular({ leer: (honesta) => ({ ...honesta, caption: ` ${TEXTO}\r\n` }) })
    const d = doble(() => despues(1))
    await conVideoEnAlmacen(d.almacen)

    await publicarPendientes(d.deps)

    expect((await pieza(id)).estado).toBe("publicado")
  })

  it("does not create a second container when the first run ran out of polling time", async () => {
    const id = await crearProgramada()
    const sim = simular({ estados: ["IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "FINISHED"] })
    const d = doble(() => despues(1), { sondeo: { cadaMs: 60_000, veces: 2 } })
    await conVideoEnAlmacen(d.almacen)

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    const enEspera = await pieza(id)
    expect(enEspera.estado).toBe("programado")
    expect(enEspera.contenedor_id).toBe("contenedor_1")
    expect(enEspera.publicacion_enviada_en).toBeNull()

    // The lease is over ten minutes later, still inside the 30-minute window.
    const siguiente = doble(() => despues(12), { almacen: d.almacen, sondeo: { cadaMs: 60_000, veces: 2 } })
    expect(await publicarPendientes(siguiente.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])

    expect(sim.contenedores).toHaveLength(1)
    expect(sim.publicaciones).toEqual([{ creation_id: "contenedor_1", access_token: TOKEN }])
  })

  it("does not take a piece that another run holds", async () => {
    const id = await crearProgramada()
    const sim = simular({ estados: ["IN_PROGRESS"] })
    const d = doble(() => despues(1), { sondeo: { cadaMs: 60_000, veces: 1 } })
    await conVideoEnAlmacen(d.almacen)
    await publicarPendientes(d.deps)

    const otro = doble(() => despues(2), { almacen: d.almacen })
    expect(await publicarPendientes(otro.deps)).toEqual([])

    expect(sim.contenedores).toHaveLength(1)
    expect((await pieza(id)).estado).toBe("programado")
  })

  it("publishes once when two runs start together", async () => {
    const id = await crearProgramada()
    const sim = simular()
    const almacen = almacenEnMemoria()
    await conVideoEnAlmacen(almacen)
    const uno = doble(() => despues(1), { almacen })
    const otro = doble(() => despues(1), { almacen })

    const [a, b] = await Promise.all([publicarPendientes(uno.deps), publicarPendientes(otro.deps)])

    expect([...a, ...b]).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim.contenedores).toHaveLength(1)
    expect(sim.publicaciones).toHaveLength(1)
    expect((await pieza(id)).estado).toBe("publicado")
  })

  it("publishes every due piece, one after the other", async () => {
    const primera = await crearProgramada()
    const segunda = await crearProgramada(despues(5))
    const sim = simular()
    const d = doble(() => despues(10))
    await conVideoEnAlmacen(d.almacen)

    const resultado = await publicarPendientes(d.deps)

    expect(resultado.map((r) => r.piezaId).sort()).toEqual([primera, segunda].sort())
    expect(sim.publicaciones).toHaveLength(2)
  })

  describe("when the answer to media_publish is lost", () => {
    it("never sends media_publish again for a container Instagram already published", async () => {
      const id = await crearProgramada()
      const sim = simular({ estados: ["FINISHED", "PUBLISHED"], publicar: () => HttpResponse.error() })
      const d = doble(() => despues(1))
      await conVideoEnAlmacen(d.almacen)

      await expect(publicarPendientes(d.deps)).rejects.toThrow(/No pude conectar con Instagram/)
      const dudosa = await pieza(id)
      expect(dudosa.estado).toBe("programado")
      expect(dudosa.publicacion_enviada_en).not.toBeNull()
      expect(dudosa.media_id).toBeNull()

      const siguiente = doble(() => despues(12), { almacen: d.almacen })
      const resultado = await publicarPendientes(siguiente.deps)

      expect(resultado).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
      expect(sim.publicaciones).toHaveLength(1)
      const fila = await pieza(id)
      expect(fila.estado).toBe("error_publicacion")
      expect(fila.explicacion).toContain("Instagram")
      expect(siguiente.avisos.aWavEnviados[0]?.detalle).toContain("contenedor_1")
    })

    it("sends media_publish again, for the same container, when Instagram says it never published it", async () => {
      const id = await crearProgramada()
      let intentos = 0
      const sim = simular({
        estados: ["FINISHED"],
        publicar: () => {
          intentos += 1
          return intentos === 1 ? HttpResponse.error() : HttpResponse.json({ id: "media_ok" })
        },
      })
      const d = doble(() => despues(1))
      await conVideoEnAlmacen(d.almacen)
      await expect(publicarPendientes(d.deps)).rejects.toThrow()

      const siguiente = doble(() => despues(12), { almacen: d.almacen })
      expect(await publicarPendientes(siguiente.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])

      expect(sim.contenedores).toHaveLength(1)
      expect(sim.publicaciones.map((p) => p.creation_id)).toEqual(["contenedor_1", "contenedor_1"])
    })

    it("resolves a lost answer before sending a piece back to approval for being late", async () => {
      const id = await crearProgramada()
      const sim = simular({ estados: ["FINISHED", "PUBLISHED"], publicar: () => HttpResponse.error() })
      const d = doble(() => despues(1))
      await conVideoEnAlmacen(d.almacen)
      await expect(publicarPendientes(d.deps)).rejects.toThrow()

      const tarde = doble(() => despues(45), { almacen: d.almacen })
      await publicarPendientes(tarde.deps)

      // Coni is not asked for a new date: the post may be live, so this goes to WAV.
      expect((await pieza(id)).estado).toBe("error_publicacion")
      expect(sim.publicaciones).toHaveLength(1)
    })
  })

  describe("when Instagram refuses", () => {
    it("moves the piece to error_publicacion with a plain explanation when media_publish is rejected", async () => {
      const id = await crearProgramada()
      simular({
        publicar: () =>
          HttpResponse.json(
            { error: { message: "Invalid parameter", code: 100, type: "OAuthException" } },
            { status: 400 },
          ),
      })
      const d = doble(() => despues(1))
      await conVideoEnAlmacen(d.almacen)

      const resultado = await publicarPendientes(d.deps)

      expect(resultado).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
      const fila = await pieza(id)
      expect(fila.estado).toBe("error_publicacion")
      expect(fila.publicacion_enviada_en).toBeNull()
      expect(fila.explicacion).toContain("WAV")
      expect(fila.explicacion).not.toContain("Invalid parameter")
      expect(d.avisos.aWavEnviados[0]?.detalle).toContain("Invalid parameter")
    })

    it("asks Coni to reconnect Instagram when the token expired", async () => {
      const id = await crearProgramada()
      simular({
        crear: () =>
          HttpResponse.json({ error: { message: "Session expired", code: 190, error_subcode: 463 } }, { status: 400 }),
      })
      const d = doble(() => despues(1))
      await conVideoEnAlmacen(d.almacen)

      await publicarPendientes(d.deps)

      const fila = await pieza(id)
      expect(fila.estado).toBe("error_publicacion")
      expect(fila.explicacion).toBe(EXPLICACION_RECONECTAR)
      expect(d.avisos.aConiEnviados[0]).toMatchObject({ mensaje: EXPLICACION_RECONECTAR, urgente: true })
      expect(d.avisos.aWavEnviados).toHaveLength(1)
    })

    it("asks Coni to reconnect Instagram when there is no token or account saved", async () => {
      const id = await crearProgramada()
      await pool.query("delete from vault.secrets where name = 'meta'")
      const sim = simular()
      const d = doble(() => despues(1))
      await conVideoEnAlmacen(d.almacen)

      await publicarPendientes(d.deps)

      expect((await pieza(id)).explicacion).toBe(EXPLICACION_RECONECTAR)
      expect(sim.contenedores).toEqual([])
    })

    it("moves the piece to error_publicacion when the container ends in ERROR", async () => {
      const id = await crearProgramada()
      const sim = simular({ estados: [{ status_code: "ERROR", status: "Error: 2207026" }] })
      const d = doble(() => despues(1))
      await conVideoEnAlmacen(d.almacen)

      await publicarPendientes(d.deps)

      expect((await pieza(id)).estado).toBe("error_publicacion")
      expect(sim.publicaciones).toEqual([])
      expect(d.avisos.aWavEnviados[0]?.detalle).toContain("2207026")
    })

    it("leaves the piece scheduled and raises the error when Instagram has a temporary failure", async () => {
      const id = await crearProgramada()
      const sim = simular({ crear: () => new HttpResponse("Bad gateway", { status: 502 }) })
      const d = doble(() => despues(1))
      await conVideoEnAlmacen(d.almacen)

      await expect(publicarPendientes(d.deps)).rejects.toThrow(/HTTP 502/)

      expect((await pieza(id)).estado).toBe("programado")
      expect(sim.publicaciones).toEqual([])
    })
  })

  it("does not publish a piece whose caption no longer matches what Coni approved", async () => {
    const id = await crearProgramada()
    // A write that skipped editar_texto: the owner of the database can do it, a task cannot.
    await pool.query("update public.piezas set texto = 'Un texto distinto', version = version + 1 where id = $1", [id])
    const sim = simular()
    const d = doble(() => despues(1))
    await conVideoEnAlmacen(d.almacen)

    const resultado = await publicarPendientes(d.deps)

    expect(resultado).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
    expect(sim.contenedores).toEqual([])
    expect((await pieza(id)).estado).toBe("error_publicacion")
    expect(d.avisos.aWavEnviados).toHaveLength(1)
  })

  it("only reads back a piece whose media was already published, and never creates or publishes again", async () => {
    const id = await crearProgramada()
    await pool.query("update public.piezas set media_id = 'media_previo', version = version + 1 where id = $1", [id])
    const sim = simular({ leer: (honesta) => ({ ...honesta, caption: TEXTO, is_ai_generated: true }) })
    // 40 minutes late: the window is closed, but what is live is live.
    const d = doble(() => despues(40))
    await conVideoEnAlmacen(d.almacen)

    const resultado = await publicarPendientes(d.deps)

    expect(resultado).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim.contenedores).toEqual([])
    expect(sim.publicaciones).toEqual([])
    expect(sim.lecturas).toEqual(["media_previo"])
    expect(await pieza(id)).toMatchObject({ estado: "publicado", media_id: "media_previo" })
  })
})

describe("publicarPendientes sin Instagram conectado", () => {
  async function sinInstagram(): Promise<void> {
    await pool.query("delete from vault.secrets where name = 'meta'")
    await pool.query("update public.ajustes set meta_cuenta_id = null")
  }

  it("hands the piece to Coni at the approved time, without an error and with a notice that is not an alert", async () => {
    const id = await crearProgramada()
    await sinInstagram()
    const sim = simular()
    const d = doble(() => despues(1))
    await conVideoEnAlmacen(d.almacen)
    const { intento } = await pieza(id)

    const resultado = await publicarPendientes(d.deps)

    expect(resultado).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(await pieza(id)).toMatchObject({
      estado: "para_subir_a_mano",
      explicacion: null,
      estado_antes_del_error: null,
      publicacion_reclamada_hasta: null,
      contenedor_id: null,
      media_id: null,
    })
    expect(sim.contenedores).toEqual([])
    expect(d.avisos.avisosEnviados).toEqual([
      { tipo: "listo_para_subir", clave: `listo_para_subir:${id}:${intento}`, piezaId: id },
    ])
    expect(d.avisos.aConiEnviados[0]?.mensaje).toMatch(/listo para que lo subas a Instagram/)
    expect(d.avisos.aConiEnviados[0]?.mensaje).not.toContain("—")
    expect(d.avisos.aWavEnviados).toEqual([])
  })

  it("does not apply the 30 minute window: nothing is published, so a late piece is still handed over", async () => {
    const id = await crearProgramada()
    await sinInstagram()
    const d = doble(() => despues(300))

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect((await pieza(id)).estado).toBe("para_subir_a_mano")
  })

  it("never hands over a piece before its approved time", async () => {
    const id = await crearProgramada()
    await sinInstagram()
    const d = doble(() => despues(-1))

    expect(await publicarPendientes(d.deps)).toEqual([])
    expect((await pieza(id)).estado).toBe("programado")
    expect(d.avisos.aConiEnviados).toEqual([])
  })

  it("hands a piece over once: a second run finds nothing and says nothing again", async () => {
    const id = await crearProgramada()
    await sinInstagram()
    const d = doble(() => despues(1))

    await publicarPendientes(d.deps)
    expect(await publicarPendientes(d.deps)).toEqual([])
    expect(d.avisos.aConiEnviados).toHaveLength(1)
    expect((await pieza(id)).estado).toBe("para_subir_a_mano")
  })

  it("still refuses to hand over a piece whose caption changed after she approved it", async () => {
    const id = await crearProgramada()
    await sinInstagram()
    await pool.query("update public.piezas set texto = 'Otro texto', version = version + 1 where id = $1", [id])
    const d = doble(() => despues(1))

    await publicarPendientes(d.deps)

    expect((await pieza(id)).estado).toBe("error_publicacion")
  })

  it("keeps the reconnect error when the account is saved but the token is missing", async () => {
    const id = await crearProgramada()
    await pool.query("delete from vault.secrets where name = 'meta'")
    const d = doble(() => despues(1))

    await publicarPendientes(d.deps)

    expect(await pieza(id)).toMatchObject({ estado: "error_publicacion", explicacion: EXPLICACION_RECONECTAR })
    expect(d.avisos.aConiEnviados[0]).toMatchObject({ mensaje: EXPLICACION_RECONECTAR, urgente: true })
  })

  it("keeps the reconnect error when the token is saved but the account is missing", async () => {
    const id = await crearProgramada()
    await pool.query("update public.ajustes set meta_cuenta_id = null")
    const d = doble(() => despues(1))

    await publicarPendientes(d.deps)

    expect(await pieza(id)).toMatchObject({ estado: "error_publicacion", explicacion: EXPLICACION_RECONECTAR })
  })

  it("does nothing retroactive once Instagram is connected: the waiting piece stays, a new one publishes", async () => {
    const espera = await crearProgramada()
    await sinInstagram()
    const antes = doble(() => despues(1))
    await publicarPendientes(antes.deps)

    await pool.query("update public.ajustes set meta_cuenta_id = $1", [CUENTA])
    await pool.query("select vault.create_secret($1, 'meta')", [TOKEN])
    const nueva = await crearProgramada(despues(10))
    simular()
    const despuesDeConectar = doble(() => despues(11))
    await conVideoEnAlmacen(despuesDeConectar.almacen)

    const resultado = await publicarPendientes(despuesDeConectar.deps)

    expect(resultado).toEqual([{ piezaId: nueva, resultado: "publicada" }])
    expect((await pieza(espera)).estado).toBe("para_subir_a_mano")
  })
})
