import { createHash } from "node:crypto"
import { HttpResponse, http } from "msw"
import type pg from "pg"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { reservarGasto } from "@/lib/datos/repositorio"
import { cargarRespaldoDeIdea, leerRespaldo } from "@/lib/datos/respaldo"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveIdempotencia, hashPuerta1 } from "@/lib/dominio/puertas"
import { huellaDeRespaldo } from "@/lib/dominio/respaldo"
import { claveDeToma } from "@/lib/dominio/voz"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { type DepsGrabacion, estimarCostoVideo, grabarPieza } from "@/lib/produccion/grabar"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { almacenEnMemoria, claveVideo, claveVozAprobada } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { CODIGO_POLITICA } from "@/lib/proveedores/heygen-api"
import type { InfoVideo } from "@/lib/video/chequeos"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { comoConi, comoServicio, pool } from "./db"
import { AUDIO, AVATAR, aplicar, crearPiezaEn, GUION, TEXTO } from "./flujo"
import { clienteDeServicio } from "./servicio"
import { sembrarIdeaDelMotor, vaciarMotor } from "./siembra"

afterAll(() => pool.end())

const ELEVENLABS = leerConfigProduccion(coniConfig).elevenlabs
const HUELLA = huellaDelGuion(GUION, ELEVENLABS)
const HEYGEN = "https://api.heygen.com"
const URL_VOZ = "https://api.elevenlabs.io/v1/text-to-speech/:voz"
const CLAVE_ELEVENLABS = "sk_eleven_de_prueba"
const CLAVE_HEYGEN = "hg_llave_de_coni_de_prueba"
const VIDEO_ID = "v_abc123"
const ASSET_ID = "asset_voz_1"
const URL_VIDEO = "https://files.heygen.test/v_abc123.mp4?firma=uno"
const URL_SRT = "https://files.heygen.test/v_abc123.srt?firma=dos"
const CALLBACK = "https://api.trigger.dev/api/v1/waitpoints/tokens/wp_1/callback/abc"
const VOZ = new Uint8Array([73, 68, 51, 4, 0, 255, 251, 144, 1, 2, 3])
const VIDEO_DE_HEYGEN = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 2, 3, 4])
const VIDEO_FINAL = new Uint8Array([9, 9, 9, 9, 1, 2, 3])
// HeyGen transcribes the audio and gets the name wrong; the approved script has it right.
const SRT =
  "1\n00:00:00,500 --> 00:00:02,000\nHola, soy Connie.\n\n2\n00:00:02,500 --> 00:00:04,000\nHoy hablamos de límites.\n"
const INFO_BUENA: InfoVideo = {
  duracion: 41.5,
  ancho: 1080,
  alto: 1920,
  conAudio: true,
  bytes: VIDEO_FINAL.length,
}
const MENSAJE_POLITICA = "HeyGen no aceptó una frase del guion. Revísalo y vuelve a aprobarlo."
const TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."
// 7 words at 150 a minute is 2.8 s; avatar_v is 48 credits a minute and the assumption is US$ 4 a minute.
const ESTIMADO = 0.1867

interface Peticion {
  cabeceras: Headers
  cuerpo: unknown
}

interface Simulacion {
  assets: (Peticion & { archivo: Uint8Array | null })[]
  creaciones: Peticion[]
  lecturas: number
  descargas: string[]
  voces: { voz: string; llave: string | null; texto: string }[]
}

interface OpcionesSimulacion {
  /** The ElevenLabs answer to the n-th call (0 based); the default is a good audio. */
  voz?: (n: number) => Response | Promise<Response>
  /** The answers of GET /v3/videos/{id}, in order; the last one repeats. */
  lecturas?: Record<string, unknown>[]
  /** The answer of POST /v3/videos instead of the default one. */
  crear?: () => Response | Promise<Response>
  /** Runs while HeyGen "creates" the video, before it answers. */
  alCrear?: () => Promise<void>
  srt?: string
}

const VIDEO_LISTO = {
  id: VIDEO_ID,
  status: "completed",
  video_url: URL_VIDEO,
  subtitle_url: URL_SRT,
  duration: 41.5,
}

function simular(opciones: OpcionesSimulacion = {}): Simulacion {
  const sim: Simulacion = { assets: [], creaciones: [], lecturas: 0, descargas: [], voces: [] }
  const lecturas = opciones.lecturas ?? [VIDEO_LISTO]
  // HeyGen replays the first answer to a repeated Idempotency-Key, which is what the app relies on.
  const reproducidas = new Map<string, string>()
  servidor.use(
    http.post<{ voz: string }, { text: string }>(URL_VOZ, async ({ request, params }) => {
      const cuerpo = await request.json()
      sim.voces.push({ voz: String(params.voz), llave: request.headers.get("xi-api-key"), texto: cuerpo.text })
      return opciones.voz
        ? await opciones.voz(sim.voces.length - 1)
        : new HttpResponse(VOZ, { headers: { "Content-Type": "audio/mpeg" } })
    }),
    http.post(`${HEYGEN}/v3/assets`, async ({ request }) => {
      const archivo = (await request.formData()).get("file")
      sim.assets.push({
        cabeceras: request.headers,
        cuerpo: null,
        archivo: archivo instanceof File ? new Uint8Array(await archivo.arrayBuffer()) : null,
      })
      return HttpResponse.json({ data: { asset_id: ASSET_ID } })
    }),
    http.post(`${HEYGEN}/v3/videos`, async ({ request }) => {
      sim.creaciones.push({ cabeceras: request.headers, cuerpo: await request.json() })
      await opciones.alCrear?.()
      if (opciones.crear) return opciones.crear()
      const llave = request.headers.get("idempotency-key") ?? `sin-llave-${sim.creaciones.length}`
      const videoId = reproducidas.get(llave) ?? `${VIDEO_ID}_${reproducidas.size}`
      reproducidas.set(llave, videoId)
      return HttpResponse.json({ data: { video_id: videoId, status: "waiting", output_format: "mp4" } })
    }),
    http.get(`${HEYGEN}/v3/videos/:id`, ({ params }) => {
      const respuesta = lecturas[Math.min(sim.lecturas, lecturas.length - 1)]
      sim.lecturas += 1
      return HttpResponse.json({ data: { ...respuesta, id: String(params.id) } })
    }),
    http.get("https://files.heygen.test/v_abc123.mp4", () => {
      sim.descargas.push("video")
      return new HttpResponse(VIDEO_DE_HEYGEN)
    }),
    http.get("https://files.heygen.test/v_abc123.srt", () => {
      sim.descargas.push("srt")
      return new HttpResponse(opciones.srt ?? SRT)
    }),
  )
  return sim
}

interface Doble {
  deps: DepsGrabacion
  almacen: ReturnType<typeof almacenEnMemoria>
  quemados: { video: Uint8Array; ass: string }[]
  sondeados: Uint8Array[]
  esperas: string[]
}

function doble(cambios: Partial<DepsGrabacion> = {}): Doble {
  const almacen = almacenEnMemoria()
  const quemados: Doble["quemados"] = []
  const sondeados: Uint8Array[] = []
  const esperas: string[] = []
  const deps: DepsGrabacion = {
    db: clienteDeServicio(),
    avisos: notificadorEnMemoria(),
    almacen,
    quemar: async (entrada) => {
      quemados.push(entrada)
      return VIDEO_FINAL
    },
    sondear: async (bytes) => {
      sondeados.push(bytes)
      return INFO_BUENA
    },
    esperarRender: async (videoId) => {
      esperas.push(videoId)
    },
    callbackUrl: CALLBACK,
    ahora: () => new Date().toISOString(),
    ...cambios,
  }
  return { deps, almacen, quemados, sondeados, esperas }
}

const piezasCreadas: string[] = []

async function enTransaccion(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await fn(c)
    await c.query("commit")
  } catch (error) {
    await c.query("rollback")
    throw error
  } finally {
    c.release()
  }
}

/** A piece approved at gate 1 (formula 2: no voice yet), walked through the real flow up to the render. */
async function crearPiezaSinVoz(): Promise<string> {
  let id = ""
  await enTransaccion(async (c) => {
    id = await crearPiezaEn(c, "en_render")
  })
  piezasCreadas.push(id)
  return id
}

/** The same piece with the voice already stored, as a run that got past the voice step leaves it. */
async function crearPiezaEnRender(): Promise<string> {
  const id = await crearPiezaSinVoz()
  const audioId = await claveDeVoz(id)
  await enTransaccion(async (c) => {
    await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId })
  })
  return id
}

/** A piece approved before the voice moved after gate 1: no formula, a voice, and the hash of formula 1. */
async function crearPiezaLegacy(opciones: { audio: boolean } = { audio: true }): Promise<string> {
  const id = await crearPiezaEnRender()
  await enTransaccion(async (c) => {
    // The triggers (formula only at approval, only Coni sets the avatar) are the point of the schema; a repair skips them.
    await c.query("set local session_replication_role = replica")
    await c.query(
      "update public.piezas set puerta1_formula = null, audio_id = $3, puerta1_hash = $2, version = version + 1 where id = $1",
      [id, hashPuerta1({ formula: 1, guion: GUION, audioId: AUDIO, avatarId: AVATAR }), opciones.audio ? AUDIO : null],
    )
  })
  return id
}

/** A piece approved before avatars could be chosen: no avatar_id, and the gate 1 hash of the old formula. */
async function crearPiezaAprobadaAntesDeElegirAvatar(): Promise<string> {
  const id = await crearPiezaEnRender()
  await enTransaccion(async (c) => {
    await c.query("set local session_replication_role = replica")
    await c.query(
      "update public.piezas set avatar_id = null, puerta1_formula = null, audio_id = $3, puerta1_hash = $2 where id = $1",
      [id, hashPuerta1({ formula: 1, guion: GUION, audioId: AUDIO }), AUDIO],
    )
  })
  return id
}

async function conVozEnAlmacen(almacen: ReturnType<typeof almacenEnMemoria>, id: string): Promise<void> {
  const { audio_id: audioId } = await pieza(id)
  if (audioId === null) throw new Error(`La pieza ${id} no tiene voz guardada`)
  await almacen.subir(audioId, VOZ, "audio/mpeg")
}

interface FilaPieza {
  estado: string
  version: number
  intento: number
  video_id: string | null
  render_id: string | null
  explicacion: string | null
  estado_antes_del_error: string | null
  puerta1_hash: string | null
  guion: string | null
  audio_id: string | null
}

async function pieza(id: string): Promise<FilaPieza> {
  const { rows } = await pool.query<FilaPieza>(
    `select estado, version, intento, video_id, render_id, explicacion, estado_antes_del_error, puerta1_hash, guion, audio_id
     from public.piezas where id = $1`,
    [id],
  )
  const fila = rows[0]
  if (!fila) throw new Error(`No existe la pieza ${id}`)
  return fila
}

interface FilaGasto {
  proveedor: string
  paso: string
  estado: string
  clave: string
  estimado: number
  real: number | null
}

async function gastos(id: string): Promise<FilaGasto[]> {
  const { rows } = await pool.query<FilaGasto>(
    `select proveedor, paso, estado, clave, estimado_usd::float8 as estimado, real_usd::float8 as real
     from public.gastos where pieza_id = $1 order by id`,
    [id],
  )
  return rows
}

function claveDeGasto(id: string, intento: number): string {
  return claveIdempotencia({
    piezaId: id,
    paso: "grabar",
    hash: hashPuerta1({ formula: 2, guion: GUION, texto: TEXTO, avatarId: AVATAR }),
    intento,
  })
}

function claveDeGastoVoz(id: string, intento: number): string {
  return claveIdempotencia({ piezaId: id, paso: "voz", hash: HUELLA, intento })
}

beforeEach(async () => {
  await pool.query("update public.ajustes set produccion = $1::jsonb, tope_mensual_usd = 40", [
    JSON.stringify(coniConfig),
  ])
  await pool.query("delete from vault.secrets where name = 'heygen'")
  await pool.query("select vault.create_secret($1, 'heygen')", [CLAVE_HEYGEN])
  await pool.query("delete from vault.secrets where name = 'elevenlabs'")
  await pool.query("select vault.create_secret($1, 'elevenlabs')", [CLAVE_ELEVENLABS])
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name in ('heygen', 'elevenlabs')")
  await pool.query("delete from public.gastos where pieza_id = any($1::uuid[])", [piezasCreadas])
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  await vaciarMotor()
  piezasCreadas.length = 0
  await pool.query("update public.ajustes set produccion = '{}'::jsonb, tope_mensual_usd = 40")
})

describe("estimarCostoVideo", () => {
  it("prices the script at 48 credits a minute for avatar_v and 16 for Avatar IV, at US$ 4 a minute of avatar_v", () => {
    expect(estimarCostoVideo(GUION, "avatar_v")).toBe(ESTIMADO)
    expect(estimarCostoVideo(GUION, "avatar_iv")).toBe(0.0622)
    expect(estimarCostoVideo(GUION, null)).toBe(0.0622)
  })

  it("never goes below the minimum a reservation accepts", () => {
    expect(estimarCostoVideo("", "avatar_v")).toBe(0.0001)
  })
})

describe("grabarPieza", () => {
  it("renders the video, burns the approved script over it, stores the result and leaves the piece for Coni", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    const claveFinal = claveVideo(id, VIDEO_FINAL)
    expect(resultado).toEqual({ resultado: "grabada", videoId: claveFinal })
    const fila = await pieza(id)
    expect(fila).toMatchObject({
      estado: "video_por_aprobar",
      video_id: claveFinal,
      render_id: `${VIDEO_ID}_0`,
      explicacion: null,
      estado_antes_del_error: null,
    })
    expect(claveFinal).toBe(`videos/${id}/${createHash("sha256").update(VIDEO_FINAL).digest("hex")}.mp4`)
    expect(d.almacen.obtener(claveFinal)).toEqual({ datos: VIDEO_FINAL, tipo: "video/mp4" })
    // The raw HeyGen video is not kept: only the voice and the final video are in the store.
    expect(d.almacen.claves().sort()).toEqual([await claveDeVoz(id), claveFinal].sort())
    expect(sim.descargas).toEqual(["video", "srt"])
    expect(d.esperas).toEqual([`${VIDEO_ID}_0`])
    expect(d.quemados).toHaveLength(1)
    expect([...(d.quemados[0]?.video ?? [])]).toEqual([...VIDEO_DE_HEYGEN])
    expect([...(d.sondeados[0] ?? [])]).toEqual([...VIDEO_FINAL])
  })

  it("sends HeyGen the voice as an asset and the video request with the callback, the key of Coni and one idempotency key per call", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await grabarPieza(d.deps, id)

    const clave = claveDeGasto(id, 0)
    expect(sim.assets).toHaveLength(1)
    expect(sim.assets[0]?.cabeceras.get("x-api-key")).toBe(CLAVE_HEYGEN)
    expect(sim.assets[0]?.cabeceras.get("idempotency-key")).toBe(`${clave}:asset`)
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
    expect(sim.creaciones).toHaveLength(1)
    expect(sim.creaciones[0]?.cabeceras.get("x-api-key")).toBe(CLAVE_HEYGEN)
    expect(sim.creaciones[0]?.cabeceras.get("idempotency-key")).toBe(`${clave}:video`)
    expect(sim.creaciones[0]?.cuerpo).toMatchObject({
      type: "avatar",
      avatar_id: AVATAR,
      title: "Prueba",
      aspect_ratio: "9:16",
      audio_asset_id: ASSET_ID,
      callback_url: CALLBACK,
      caption: { file_format: "srt" },
    })
    expect(sim.creaciones[0]?.cuerpo).not.toHaveProperty("script")
  })

  it("records with the avatar Coni chose, not with heygen.avatar_id", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await grabarPieza(d.deps, id)

    expect(sim.creaciones[0]?.cuerpo).toMatchObject({ avatar_id: AVATAR })
    expect(coniConfig.heygen.avatar_id).not.toBe(AVATAR)
  })

  it("records a piece approved before the choice existed with heygen.avatar_id", async () => {
    const id = await crearPiezaAprobadaAntesDeElegirAvatar()
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.creaciones[0]?.cuerpo).toMatchObject({ avatar_id: coniConfig.heygen.avatar_id })
  })

  it("does not spend when the avatar no longer matches what gate 1 approved", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)
    const c = await pool.connect()
    try {
      await c.query("begin")
      await c.query("set local session_replication_role = replica")
      await c.query("update public.piezas set avatar_id = 'otro-look' where id = $1", [id])
      await c.query("commit")
    } finally {
      c.release()
    }

    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "sin_aprobacion" })
    expect(sim.creaciones).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("burns the words of the approved script with the timing of HeyGen's SRT", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await grabarPieza(d.deps, id)

    const ass = d.quemados[0]?.ass ?? ""
    expect(ass).toContain("Hola, soy Coni.")
    expect(ass).not.toContain("Connie")
    expect(ass).toContain("Hoy hablamos de límites.")
    expect(ass).toContain("Dialogue: 0,0:00:00.50,0:00:02.00,Coni")
  })

  it("reserves the HeyGen spend before any request and confirms it when the video is delivered", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await grabarPieza(d.deps, id)

    expect(await gastos(id)).toEqual([
      {
        proveedor: "heygen",
        paso: "grabar",
        estado: "confirmado",
        clave: claveDeGasto(id, 0),
        estimado: ESTIMADO,
        real: ESTIMADO,
      },
    ])
  })

  it("writes everything as the service role and never touches gate 1", async () => {
    const id = await crearPiezaEnRender()
    const antes = await pieza(id)
    simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await grabarPieza(d.deps, id)

    expect((await pieza(id)).puerta1_hash).toBe(antes.puerta1_hash)
    const { rows } = await pool.query<{ actor_rol: string }>(
      "select actor_rol from public.eventos where pieza_id = $1 and tabla = 'piezas' and operacion = 'update' order by id",
      [id],
    )
    // The updates before the render belong to the walk through the flow; the last three are the task's.
    expect(rows.slice(-3).map((r) => r.actor_rol)).toEqual(["service_role", "service_role", "service_role"])
    const roles = await pool.query<{ actor_rol: string }>(
      "select distinct actor_rol from public.eventos where pieza_id = $1 and tabla = 'gastos'",
      [id],
    )
    expect(roles.rows).toEqual([{ actor_rol: "service_role" }])
  })

  it("stores the render id before it waits, so a crash while waiting finds it", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)
    const vistoAlEsperar: { fila: FilaPieza | null } = { fila: null }
    d.deps.esperarRender = async () => {
      vistoAlEsperar.fila = await pieza(id)
    }

    await grabarPieza(d.deps, id)

    expect(vistoAlEsperar.fila).toMatchObject({ estado: "en_render", render_id: `${VIDEO_ID}_0` })
  })

  it("does nothing for a piece that is not in render or subtitling", async () => {
    const id = await crearPiezaEnRender()
    await pool.query(
      "update public.piezas set estado = 'descartado', puerta1_hash = null, puerta1_en = null, puerta1_por = null, version = version + 1 where id = $1",
      [id],
    )
    const d = doble()

    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "nada_que_hacer" })
    expect(await gastos(id)).toEqual([])
  })

  it("fails as a configuration error for a piece that does not exist", async () => {
    const error = await grabarPieza(doble().deps, "11111111-2222-4333-8444-555555555555").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
  })
})

describe("grabarPieza sin aprobación", () => {
  it("makes no request and reserves nothing when the script changed after Coni approved it", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    await pool.query(
      "update public.piezas set guion = 'Otro guion que Coni no aprobó.', version = version + 1 where id = $1",
      [id],
    )
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)
    const antes = await pieza(id)

    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "sin_aprobacion" })

    expect(sim.assets).toHaveLength(0)
    expect(sim.creaciones).toHaveLength(0)
    expect(sim.lecturas).toBe(0)
    expect(await gastos(id)).toEqual([])
    expect(await pieza(id)).toEqual(antes)
  })

  it("makes no request when the legacy piece has no voice", async () => {
    const id = await crearPiezaLegacy({ audio: false })
    const sim = simular()

    expect(await grabarPieza(doble().deps, id)).toEqual({ resultado: "sin_aprobacion" })
    expect(sim.creaciones).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })
})

describe("grabarPieza sin llave o con el tope alcanzado", () => {
  it("fails as a configuration error, before reserving anything, when Coni has not entered her HeyGen key", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    await pool.query("delete from vault.secrets where name = 'heygen'")
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const error = await grabarPieza(d.deps, id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.stringContaining("HeyGen") })
    expect(sim.assets).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("fails as a configuration error, before reserving anything, when a piece without a chosen avatar has no legacy avatar_id", async () => {
    const id = await crearPiezaAprobadaAntesDeElegirAvatar()
    const sim = simular()
    const sinAvatar = { ...coniConfig, heygen: { ...coniConfig.heygen, avatar_id: "PENDIENTE" } }
    await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(sinAvatar)])
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const error = await grabarPieza(d.deps, id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.stringContaining("avatar_id") })
    expect(sim.assets).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("explains the cap to Coni and makes no request when the spend would pass it", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    await pool.query("update public.ajustes set tope_mensual_usd = 0.1")
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "tope" })
    expect(d.deps.avisos).toMatchObject({
      aConiEnviados: [{ mensaje: TOPE, urgente: true }],
      avisosEnviados: [{ tipo: "tope_alcanzado", clave: `tope_alcanzado:${id}:0`, piezaId: id }],
    })
    expect(sim.assets).toHaveLength(0)
    expect(sim.creaciones).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
    expect(await pieza(id)).toMatchObject({ estado: "en_render", explicacion: TOPE, render_id: null })
  })
})

describe("grabarPieza reintentos", () => {
  it("does not create the video again when the render id is already stored", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular({ lecturas: [VIDEO_LISTO] })
    await pool.query("update public.piezas set render_id = $2, version = version + 1 where id = $1", [id, VIDEO_ID])
    await reservarGasto(clienteDeServicio(), {
      piezaId: id,
      proveedor: "heygen",
      paso: "grabar",
      estimadoUsd: ESTIMADO,
      clave: claveDeGasto(id, 0),
      ahora: new Date().toISOString(),
    })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.creaciones).toHaveLength(0)
    expect(sim.assets).toHaveLength(0)
    expect(await gastos(id)).toHaveLength(1)
    expect((await gastos(id))[0]).toMatchObject({ estado: "confirmado", estimado: ESTIMADO })
  })

  it("does not wait for the callback when the stored video is already finished", async () => {
    const id = await crearPiezaEnRender()
    simular({ lecturas: [VIDEO_LISTO] })
    await pool.query("update public.piezas set render_id = $2, version = version + 1 where id = $1", [id, VIDEO_ID])
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await grabarPieza(d.deps, id)

    expect(d.esperas).toEqual([])
  })

  it("waits for the callback when the stored video is still rendering, and reads it again afterwards", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular({ lecturas: [{ status: "processing" }, VIDEO_LISTO] })
    await pool.query("update public.piezas set render_id = $2, version = version + 1 where id = $1", [id, VIDEO_ID])
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(d.esperas).toEqual([VIDEO_ID])
    expect(sim.lecturas).toBe(2)
  })

  it("asks HeyGen again with the same idempotency key when the run died before it stored the render id", async () => {
    const id = await crearPiezaEnRender()
    let cambiada = false
    const sim = simular({
      // The piece changes while HeyGen creates the video (the first time only), so the write of the render id finds
      // another version.
      alCrear: async () => {
        if (cambiada) return
        cambiada = true
        await pool.query("update public.piezas set explicacion = 'cambio ajeno', version = version + 1 where id = $1", [
          id,
        ])
      },
    })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("cambió")
    expect((await pieza(id)).render_id).toBeNull()

    // The retry: nothing is stored, so it creates again; HeyGen replays the answer to the same key.
    const segunda = await grabarPieza(d.deps, id)

    expect(segunda.resultado).toBe("grabada")
    expect(sim.creaciones).toHaveLength(2)
    const llaves = sim.creaciones.map((c) => c.cabeceras.get("idempotency-key"))
    expect(llaves[0]).toBe(`${claveDeGasto(id, 0)}:video`)
    expect(llaves[1]).toBe(llaves[0])
    const llavesAsset = sim.assets.map((a) => a.cabeceras.get("idempotency-key"))
    expect(llavesAsset).toEqual([`${claveDeGasto(id, 0)}:asset`, `${claveDeGasto(id, 0)}:asset`])
    expect((await pieza(id)).render_id).toBe(`${VIDEO_ID}_0`)
    expect(await gastos(id)).toHaveLength(1)
  })

  it("throws and writes nothing more when the video is still rendering after the wait", async () => {
    const id = await crearPiezaEnRender()
    simular({ lecturas: [{ status: "processing" }] })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("sigue")

    expect(await pieza(id)).toMatchObject({ estado: "en_render", render_id: `${VIDEO_ID}_0`, explicacion: null })
    expect((await gastos(id))[0]).toMatchObject({ estado: "reservado", real: null })
    expect(d.quemados).toHaveLength(0)
  })

  it("refuses to create the video again when the spend of this attempt is no longer reserved and there is no render id", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    await reservarGasto(clienteDeServicio(), {
      piezaId: id,
      proveedor: "heygen",
      paso: "grabar",
      estimadoUsd: ESTIMADO,
      clave: claveDeGasto(id, 0),
      ahora: new Date().toISOString(),
    })
    await pool.query("update public.gastos set estado = 'confirmado', real_usd = estimado_usd where pieza_id = $1", [
      id,
    ])
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const error = await grabarPieza(d.deps, id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(sim.assets).toHaveLength(0)
    expect(sim.creaciones).toHaveLength(0)
  })

  it("resumes a piece that was left subtitling, without charging or creating anything again", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    const d = doble({
      quemar: async () => {
        throw new Error("ffmpeg falló: killed")
      },
    })
    await conVozEnAlmacen(d.almacen, id)

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("ffmpeg falló")
    expect(await pieza(id)).toMatchObject({ estado: "subtitulando", render_id: `${VIDEO_ID}_0` })
    expect((await gastos(id))[0]).toMatchObject({ estado: "confirmado" })

    const reanudada = doble({ almacen: d.almacen })
    const resultado = await grabarPieza(reanudada.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.creaciones).toHaveLength(1)
    expect(sim.assets).toHaveLength(1)
    expect(await gastos(id)).toHaveLength(1)
    expect(await pieza(id)).toMatchObject({ estado: "video_por_aprobar", video_id: claveVideo(id, VIDEO_FINAL) })
    expect(reanudada.esperas).toEqual([])
  })

  it("confirms the spend when the run died between delivering the render and confirming it", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble({
      quemar: async () => {
        throw new Error("ffmpeg falló: killed")
      },
    })
    await conVozEnAlmacen(d.almacen, id)
    await expect(grabarPieza(d.deps, id)).rejects.toThrow("ffmpeg falló")
    await pool.query("update public.gastos set estado = 'reservado', real_usd = null where pieza_id = $1", [id])

    await grabarPieza(doble({ almacen: d.almacen }).deps, id)

    expect((await gastos(id))[0]).toMatchObject({ estado: "confirmado", real: ESTIMADO })
  })
})

describe("grabarPieza cuando HeyGen no entrega", () => {
  it("sends the piece back to Coni, with the reason, when HeyGen rejects a sentence of the script on create", async () => {
    const id = await crearPiezaEnRender()
    simular({
      crear: () =>
        HttpResponse.json({ error: { code: CODIGO_POLITICA, message: "Violates the policy" } }, { status: 400 }),
    })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "politica_contenido" })
    const fila = await pieza(id)
    expect(fila).toMatchObject({
      estado: "guion_por_aprobar",
      explicacion: MENSAJE_POLITICA,
      puerta1_hash: null,
      intento: 1,
    })
    expect((await gastos(id))[0]).toMatchObject({ estado: "liberado", real: null })
    expect(d.esperas).toEqual([])
  })

  it("sends the piece back to Coni, with the reason, when HeyGen fails the video for the content policy", async () => {
    const id = await crearPiezaEnRender()
    simular({
      lecturas: [{ status: "failed", failure_code: CODIGO_POLITICA, failure_message: "Violates the policy" }],
    })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "politica_contenido" })
    expect(await pieza(id)).toMatchObject({
      estado: "guion_por_aprobar",
      explicacion: MENSAJE_POLITICA,
      puerta1_hash: null,
      render_id: `${VIDEO_ID}_0`,
    })
    expect((await gastos(id))[0]).toMatchObject({ estado: "liberado" })
    expect(d.quemados).toHaveLength(0)
  })

  it("moves the piece to error_produccion, with an explanation for Coni, when HeyGen fails the video", async () => {
    const id = await crearPiezaEnRender()
    simular({ lecturas: [{ status: "failed", failure_code: "internal_error", failure_message: "boom" }] })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "falla_produccion" })
    expect(await pieza(id)).toMatchObject({
      estado: "error_produccion",
      estado_antes_del_error: "en_render",
      explicacion: "HeyGen no pudo terminar el video (internal_error). Vuelve a intentarlo en unos minutos.",
    })
    expect((await gastos(id))[0]).toMatchObject({ estado: "liberado", real: null })
  })

  it("leaves out the code in the explanation when HeyGen does not give one", async () => {
    const id = await crearPiezaEnRender()
    simular({ lecturas: [{ status: "failed" }] })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await grabarPieza(d.deps, id)

    expect((await pieza(id)).explicacion).toBe("HeyGen no pudo terminar el video. Vuelve a intentarlo en unos minutos.")
  })

  it("tells Coni to top up HeyGen, not to wait, when the video fails for lack of credits", async () => {
    const id = await crearPiezaEnRender()
    simular({
      lecturas: [{ status: "failed", failure_code: "MOVIO_PAYMENT_INSUFFICIENT_CREDIT", failure_message: "x" }],
    })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "falla_produccion" })
    expect(await pieza(id)).toMatchObject({
      estado: "error_produccion",
      explicacion:
        "HeyGen no tiene créditos para grabar este video. Recarga créditos en HeyGen y después toca Reintentar.",
    })
  })

  it("tells Coni her HeyGen account has no credits, releases the spend and charges nothing", async () => {
    const id = await crearPiezaEnRender()
    simular({
      crear: () =>
        HttpResponse.json({ error: { code: "insufficient_credit", message: "No credits" } }, { status: 402 }),
    })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "falla_produccion" })
    expect(await pieza(id)).toMatchObject({
      estado: "error_produccion",
      explicacion:
        "HeyGen no tiene créditos para grabar este video. Recarga créditos en HeyGen y después toca Reintentar.",
      render_id: null,
    })
    expect((await gastos(id))[0]).toMatchObject({ estado: "liberado" })
  })

  it("rethrows a configuration error from HeyGen and leaves the piece where it was", async () => {
    const id = await crearPiezaEnRender()
    simular({
      crear: () => HttpResponse.json({ error: { code: "unauthorized", message: "Invalid key" } }, { status: 401 }),
    })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const error = await grabarPieza(d.deps, id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.not.stringContaining(CLAVE_HEYGEN) })
    expect((await pieza(id)).estado).toBe("en_render")
  })

  it("lets Trigger.dev retry a server error from HeyGen without changing the piece", async () => {
    const id = await crearPiezaEnRender()
    simular({ crear: () => new HttpResponse("upstream", { status: 503 }) })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("503")

    expect((await pieza(id)).estado).toBe("en_render")
    expect((await gastos(id))[0]).toMatchObject({ estado: "reservado" })
  })
})

describe("grabarPieza chequeos del video", () => {
  it("moves the piece to error_produccion, with the failed checks, and keeps the spend confirmed", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble({ sondear: async () => ({ ...INFO_BUENA, duracion: 3, conAudio: false }) })
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "falla_produccion" })
    const fila = await pieza(id)
    expect(fila).toMatchObject({ estado: "error_produccion", estado_antes_del_error: "subtitulando", video_id: null })
    expect(fila.explicacion).toBe(
      "El video no pasó los chequeos: El video dura 3 s y tiene que durar entre 5 y 90 s. El video no tiene audio.",
    )
    expect((await gastos(id))[0]).toMatchObject({ estado: "confirmado" })
    expect(d.almacen.claves()).toEqual([await claveDeVoz(id)])
  })

  it("moves the piece to error_produccion when HeyGen's subtitles do not match the script", async () => {
    const id = await crearPiezaEnRender()
    simular({ srt: "1\n00:00:00,500 --> 00:00:02,000\nOtra cosa totalmente distinta aquí\n" })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "falla_produccion" })
    expect(await pieza(id)).toMatchObject({
      estado: "error_produccion",
      explicacion: expect.stringContaining("no calzan con el guion"),
    })
    expect(d.quemados).toHaveLength(0)
  })

  it("moves the piece to error_produccion when HeyGen delivers the video without subtitles", async () => {
    const id = await crearPiezaEnRender()
    simular({ lecturas: [{ ...VIDEO_LISTO, subtitle_url: null }] })
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado).toEqual({ resultado: "falla_produccion" })
    expect((await pieza(id)).explicacion).toContain("subtítulos")
    expect(d.quemados).toHaveLength(0)
  })

  it("lets Trigger.dev retry when burning fails with a plain error, leaving the piece subtitling", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble({
      quemar: async () => {
        throw new Error("ffmpeg falló: killed")
      },
    })
    await conVozEnAlmacen(d.almacen, id)

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("ffmpeg falló")

    expect((await pieza(id)).estado).toBe("subtitulando")
  })

  it("rethrows a configuration error from the burn (the wrong font) and leaves the piece subtitling", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble({
      quemar: async () => {
        throw new FallaDeConfiguracion("libass eligió Montserrat-Black")
      },
    })
    await conVozEnAlmacen(d.almacen, id)

    const error = await grabarPieza(d.deps, id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect((await pieza(id)).estado).toBe("subtitulando")
  })
})

describe("grabarPieza si la pieza cambia mientras tanto", () => {
  it("throws, so the retry reads the piece again, when it is discarded while HeyGen renders", async () => {
    const id = await crearPiezaEnRender()
    simular()
    const d = doble({
      esperarRender: async () => {
        await pool.query(
          "update public.piezas set estado = 'descartado', puerta1_hash = null, puerta1_en = null, puerta1_por = null, version = version + 1 where id = $1",
          [id],
        )
      },
    })
    await conVozEnAlmacen(d.almacen, id)

    await expect(grabarPieza(d.deps, id)).rejects.toThrow()

    expect((await pieza(id)).estado).toBe("descartado")
    expect(d.quemados).toHaveLength(0)

    expect(await grabarPieza(doble().deps, id)).toEqual({ resultado: "nada_que_hacer" })
  })
})

describe("la entrada a en_render con el flujo real", () => {
  it("lets Coni regrabar after the first video: the new attempt creates its own video", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)
    await grabarPieza(d.deps, id)

    const c = await pool.connect()
    try {
      await c.query("begin")
      await aplicar(c, id, comoConi, { tipo: "regrabar" })
      await c.query("commit")
    } catch (error) {
      await c.query("rollback")
      throw error
    } finally {
      c.release()
    }
    expect((await pieza(id)).render_id).toBeNull()

    const segunda = await grabarPieza(d.deps, id)

    expect(segunda.resultado).toBe("grabada")
    expect(sim.creaciones).toHaveLength(2)
    expect(sim.creaciones[1]?.cuerpo).toMatchObject({ avatar_id: AVATAR })
    expect(sim.creaciones[1]?.cabeceras.get("idempotency-key")).toBe(`${claveDeGasto(id, 1)}:video`)
    expect(sim.assets[1]?.cabeceras.get("idempotency-key")).toBe(`${claveDeGasto(id, 1)}:asset`)
    expect(sim.creaciones[1]?.cabeceras.get("idempotency-key")).not.toBe(
      sim.creaciones[0]?.cabeceras.get("idempotency-key"),
    )
    const filas = await gastos(id)
    expect(filas.map((f) => f.estado)).toEqual(["confirmado", "confirmado"])
    expect(filas.map((f) => f.clave)).toEqual([claveDeGasto(id, 0), claveDeGasto(id, 1)])
  })
})

/** The take the run makes for this piece: the approved script, Coni's voice and the attempt it is on. */
async function claveDeVoz(id: string): Promise<string> {
  return claveDeToma(id, HUELLA, (await pieza(id)).intento)
}

async function conTopeMensual(usd: number): Promise<void> {
  await pool.query("update public.ajustes set tope_mensual_usd = $1", [usd])
}

describe("grabarPieza con la voz después de la puerta 1", () => {
  it("makes the voice right before HeyGen: reserves its spend, speaks the approved script once, stores the audio and records with it", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    const d = doble()

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    const audioId = await claveDeVoz(id)
    expect(sim.voces).toEqual([{ voz: coniConfig.elevenlabs.voice_id, llave: CLAVE_ELEVENLABS, texto: GUION }])
    expect(d.almacen.obtener(audioId)).toEqual({ datos: VOZ, tipo: "audio/mpeg" })
    expect(await pieza(id)).toMatchObject({ estado: "video_por_aprobar", audio_id: audioId })
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
    const filas = await gastos(id)
    expect(filas.map((f) => [f.proveedor, f.paso, f.estado, f.clave])).toEqual([
      ["elevenlabs", "voz", "confirmado", claveDeGastoVoz(id, 0)],
      ["heygen", "grabar", "confirmado", claveDeGasto(id, 0)],
    ])
    expect(filas[0]?.real).toBeCloseTo(estimarCostoVoz(GUION), 4)
  })

  it("does not speak again when the run is retried after the voice was stored", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular({ crear: () => new HttpResponse("upstream", { status: 503 }) })
    const d = doble()

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("503")
    expect(sim.voces).toHaveLength(1)
    expect(await pieza(id)).toMatchObject({ estado: "en_render", audio_id: await claveDeVoz(id) })

    const segunda = simular()
    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(segunda.voces).toHaveLength(0)
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toHaveLength(1)
  })

  it("resumes without paying twice when the voice failed on the first run", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular({
      voz: (n) => (n === 0 ? new HttpResponse("upstream", { status: 503 }) : new HttpResponse(VOZ)),
    })
    const d = doble()

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("503")
    expect(await pieza(id)).toMatchObject({ estado: "en_render", audio_id: null })
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([["elevenlabs", "reservado"]])
    expect(sim.creaciones).toHaveLength(0)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(2)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([
      ["elevenlabs", "confirmado"],
      ["heygen", "confirmado"],
    ])
  })

  it("ignores a voice that was not made for the approved script and speaks the approved one", async () => {
    const id = await crearPiezaSinVoz()
    const ajena = `voces/${id}/${"a".repeat(64)}.mp3`
    await enTransaccion(async (c) => {
      await c.query("set local session_replication_role = replica")
      await c.query("update public.piezas set audio_id = $2, version = version + 1 where id = $1", [id, ajena])
    })
    const sim = simular()
    const d = doble()
    await d.almacen.subir(ajena, new Uint8Array([9, 9, 9]), "audio/mpeg")

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.voces).toEqual([{ voz: coniConfig.elevenlabs.voice_id, llave: CLAVE_ELEVENLABS, texto: GUION }])
    expect(await pieza(id)).toMatchObject({ audio_id: await claveDeVoz(id) })
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
  })

  it("trusts a voice stored under the key of the approved script, without ElevenLabs", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(0)
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
  })

  it("records a legacy piece with the voice it already has, without ElevenLabs", async () => {
    const id = await crearPiezaLegacy()
    await pool.query("delete from vault.secrets where name = 'elevenlabs'")
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(0)
    expect((await gastos(id)).map((g) => g.proveedor)).toEqual(["heygen"])
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
  })

  it("stops without spending when a legacy piece has no voice", async () => {
    const id = await crearPiezaLegacy({ audio: false })
    const sim = simular()

    expect(await grabarPieza(doble().deps, id)).toEqual({ resultado: "sin_aprobacion" })
    expect(sim.voces).toHaveLength(0)
    expect(sim.creaciones).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("stops without spending when the publication text changed after Coni approved", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    await pool.query(
      "update public.piezas set texto = 'Otro texto que Coni no vio.', version = version + 1 where id = $1",
      [id],
    )

    expect(await grabarPieza(doble().deps, id)).toEqual({ resultado: "sin_aprobacion" })
    expect(sim.voces).toHaveLength(0)
    expect(sim.creaciones).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("explains the cap and records nothing when the voice alone would pass it", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    await conTopeMensual(estimarCostoVoz(GUION) / 2)
    const d = doble()

    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "tope" })

    expect(sim.voces).toHaveLength(0)
    expect(sim.assets).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
    expect(await pieza(id)).toMatchObject({ estado: "en_render", explicacion: TOPE, audio_id: null })
    expect(d.deps.avisos).toMatchObject({ aConiEnviados: [{ mensaje: TOPE, urgente: true }] })
  })

  it("keeps the voice and finishes the render after the cap is raised", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    await conTopeMensual(estimarCostoVoz(GUION) + 0.01)
    const d = doble()

    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "tope" })
    expect(sim.voces).toHaveLength(1)
    expect(sim.creaciones).toHaveLength(0)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([["elevenlabs", "confirmado"]])

    await conTopeMensual(40)
    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(1)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([
      ["elevenlabs", "confirmado"],
      ["heygen", "confirmado"],
    ])
  })

  it("fails as a configuration error, before any spend, when elevenlabs.voice_id is missing", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    const sinVoz = { ...coniConfig, elevenlabs: { ...coniConfig.elevenlabs, voice_id: "" } }
    await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(sinVoz)])

    const error = await grabarPieza(doble().deps, id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.stringContaining("voice_id") })
    expect(sim.voces).toHaveLength(0)
    expect(sim.assets).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("fails as a configuration error, before any spend, when Coni has not entered her ElevenLabs key", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    await pool.query("delete from vault.secrets where name = 'elevenlabs'")

    const error = await grabarPieza(doble().deps, id).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.stringContaining("ElevenLabs") })
    expect(sim.voces).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("fails as a configuration error when the production config is invalid", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    await pool.query('update public.ajustes set produccion = \'{"ruta_voz": "ElevenLabs"}\'::jsonb')

    await expect(grabarPieza(doble().deps, id)).rejects.toBeInstanceOf(FallaDeConfiguracion)
    expect(sim.voces).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("uses the ElevenLabs key without the spaces and newline it may have been pasted with", async () => {
    const id = await crearPiezaSinVoz()
    await pool.query("delete from vault.secrets where name = 'elevenlabs'")
    await pool.query("select vault.create_secret($1, 'elevenlabs')", [`  ${CLAVE_ELEVENLABS}\n`])
    const sim = simular()

    await grabarPieza(doble().deps, id)

    expect(sim.voces[0]?.llave).toBe(CLAVE_ELEVENLABS)
  })

  it("fails and leaves the piece alone when it changed while the voice was being generated", async () => {
    const id = await crearPiezaSinVoz()
    const d = doble()
    const sim = simular({
      voz: async () => {
        await pool.query("update public.piezas set titulo = 'Cambiado', version = version + 1 where id = $1", [id])
        return new HttpResponse(VOZ)
      },
    })

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("La pieza cambió mientras se producía.")

    expect(await pieza(id)).toMatchObject({ estado: "en_render", audio_id: null })
    expect(sim.creaciones).toHaveLength(0)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([["elevenlabs", "confirmado"]])
    // The take is stored and paid even though the piece did not take it: a retry finds it instead of paying again.
    expect(d.almacen.claves()).toEqual([await claveDeVoz(id)])
  })

  it("never pays the voice twice when the run died after uploading it and before saving it in the piece", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    const d = doble()
    const subir = d.almacen.subir.bind(d.almacen)
    let caidas = 0
    d.almacen.subir = async (clave, datos, tipo) => {
      await subir(clave, datos, tipo)
      if (caidas === 0) {
        caidas += 1
        // The piece moves under the run, so its write of the voice is the one that is lost.
        await pool.query("update public.piezas set titulo = 'Cambiado', version = version + 1 where id = $1", [id])
      }
    }

    await expect(grabarPieza(d.deps, id)).rejects.toThrow("La pieza cambió mientras se producía.")
    expect(await pieza(id)).toMatchObject({ audio_id: null })

    const resultado = await grabarPieza(d.deps, id)

    expect(resultado.resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(1)
    expect(await pieza(id)).toMatchObject({ audio_id: await claveDeVoz(id) })
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([
      ["elevenlabs", "confirmado"],
      ["heygen", "confirmado"],
    ])
  })
})

describe("grabarPieza con la voz por texto", () => {
  it("records with the legacy voice of the current approval, without ElevenLabs", async () => {
    const id = await crearPiezaSinVoz()
    const { puerta1_hash: hash } = await pieza(id)
    if (hash === null) throw new Error("sin puerta 1")
    const legada = claveVozAprobada(id, hash)
    await enTransaccion(async (c) => {
      await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId: legada })
    })
    const sim = simular()
    const d = doble()
    await d.almacen.subir(legada, VOZ, "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(0)
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toEqual([])
  })

  it("reuses an earlier take of the same text instead of paying again", async () => {
    const id = await crearPiezaSinVoz()
    const anterior = claveDeToma(id, HUELLA, 7)
    const sim = simular()
    const d = doble()
    await d.almacen.subir(anterior, VOZ, "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(0)
    expect(await pieza(id)).toMatchObject({ audio_id: anterior })
    expect((await gastos(id)).filter((g) => g.proveedor === "elevenlabs")).toEqual([])
  })

  it("never sends HeyGen a voice of another text: it speaks the approved script instead", async () => {
    const id = await crearPiezaSinVoz()
    const ajena = claveDeToma(id, huellaDelGuion("Otro texto que Coni no aprobó.", ELEVENLABS), 0)
    await enTransaccion(async (c) => {
      await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId: ajena })
    })
    const sim = simular()
    const d = doble()
    await d.almacen.subir(ajena, new Uint8Array([7, 7, 7]), "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toEqual([{ voz: ELEVENLABS.voice_id, llave: CLAVE_ELEVENLABS, texto: GUION }])
    expect(sim.assets).toHaveLength(1)
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
  })

  it("never sends HeyGen a take of the same text that belongs to another piece", async () => {
    const id = await crearPiezaSinVoz()
    const otra = await crearPiezaSinVoz()
    const deOtra = claveDeToma(otra, HUELLA, 0)
    await enTransaccion(async (c) => {
      await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId: deOtra })
    })
    const sim = simular()
    const d = doble()
    await d.almacen.subir(deOtra, new Uint8Array([5, 5, 5]), "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(1)
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
    expect(await pieza(id)).toMatchObject({ audio_id: await claveDeVoz(id) })
  })

  it("never sends HeyGen the legacy voice of another approval of the same piece", async () => {
    const id = await crearPiezaSinVoz()
    const deOtraAprobacion = claveVozAprobada(id, "e".repeat(64))
    await enTransaccion(async (c) => {
      await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId: deOtraAprobacion })
    })
    const sim = simular()
    const d = doble()
    await d.almacen.subir(deOtraAprobacion, new Uint8Array([4, 4, 4]), "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(1)
    expect([...(sim.assets[0]?.archivo ?? [])]).toEqual([...VOZ])
  })

  it("spends nothing on HeyGen when the voice is rejected and the new one is stopped by the cap", async () => {
    const id = await crearPiezaSinVoz()
    const ajena = claveDeToma(id, huellaDelGuion("Otro texto que Coni no aprobó.", ELEVENLABS), 0)
    await enTransaccion(async (c) => {
      await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId: ajena })
    })
    await conTopeMensual(0)
    const sim = simular()
    const d = doble()
    await d.almacen.subir(ajena, new Uint8Array([7, 7, 7]), "audio/mpeg")

    expect(await grabarPieza(d.deps, id)).toEqual({ resultado: "tope" })
    expect(sim.voces).toHaveLength(0)
    expect(sim.assets).toHaveLength(0)
    expect(sim.creaciones).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("makes a new voice when the voice settings changed since the stored one", async () => {
    const id = await crearPiezaEnRender()
    const otra = { ...coniConfig, elevenlabs: { ...coniConfig.elevenlabs, model_id: "eleven_v3" } }
    await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(otra)])
    const sim = simular()
    const d = doble()
    await conVozEnAlmacen(d.almacen, id)

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(1)
  })

  it("releases the voice reservation when ElevenLabs has no characters, and tells Coni", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular({
      voz: () => HttpResponse.json({ detail: { status: "quota_exceeded", message: "quota" } }, { status: 401 }),
    })
    const d = doble()

    expect((await grabarPieza(d.deps, id)).resultado).toBe("falla_produccion")
    expect(sim.creaciones).toHaveLength(0)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([["elevenlabs", "liberado"]])
    expect((await pieza(id)).explicacion).toBe(
      "ElevenLabs no tiene caracteres suficientes para esta voz. Recarga en elevenlabs.io y vuelve a intentarlo.",
    )
  })
})

const RESPALDO_APROBADO = {
  teoria: { id: "t", titulo: "T", tesis: "Te", porQue: "P" },
  afirmaciones: [
    { id: "a", texto: "x", cita: "una cita", aporte: "y", autor: "Siembra Ana", deConi: false, esPersona: true },
  ],
}

/** Approves the piece with formula 3 over the given frozen backing, as a repair (the triggers are not the subject). */
async function aprobarConRespaldo(id: string, respaldo: unknown): Promise<void> {
  const huella = huellaDeRespaldo(leerRespaldo(JSON.parse(JSON.stringify(respaldo))))
  await enTransaccion(async (c) => {
    await c.query("set local session_replication_role = replica")
    await c.query(
      "update public.piezas set respaldo = $2::jsonb, puerta1_formula = 3, puerta1_hash = $3, version = version + 1 where id = $1",
      [
        id,
        JSON.stringify(respaldo),
        hashPuerta1({ formula: 3, guion: GUION, texto: TEXTO, avatarId: AVATAR, respaldo: huella }),
      ],
    )
  })
}

/** A piece Coni approved with formula 3 and a frozen backing, still without voice. */
async function crearPiezaConRespaldo(): Promise<string> {
  const id = await crearPiezaSinVoz()
  await aprobarConRespaldo(id, RESPALDO_APROBADO)
  return id
}

describe("grabarPieza con la fórmula 3", () => {
  it("renders a piece whose backing is the one Coni approved", async () => {
    const id = await crearPiezaConRespaldo()
    const sim = simular()
    expect((await grabarPieza(doble().deps, id)).resultado).toBe("grabada")
    expect(sim.creaciones).toHaveLength(1)
  })

  it("stops without spending when the backing on the piece changed after approval", async () => {
    const id = await crearPiezaConRespaldo()
    const sim = simular()
    const cambiado = { ...RESPALDO_APROBADO, teoria: { ...RESPALDO_APROBADO.teoria, tesis: "Otra tesis." } }
    await pool.query("update public.piezas set respaldo = $2::jsonb, version = version + 1 where id = $1", [
      id,
      JSON.stringify(cambiado),
    ])

    expect(await grabarPieza(doble().deps, id)).toEqual({ resultado: "sin_aprobacion" })
    expect(sim.voces).toHaveLength(0)
    expect(sim.creaciones).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })

  it("keeps the approval when the knowledge base moves on after it", async () => {
    const idea = await sembrarIdeaDelMotor({
      gancho: "g",
      semana: "2026-09-27",
      teoria: {
        titulo: "Teoría que se borra",
        tesis: "Tesis",
        nivel: "medio",
        respaldo: [
          { autor: "Siembra Ana Pérez", cita: "una cita larga de la fuente que luego se excluye" },
          { autor: "Siembra Luis Soto", cita: "otra cita de la fuente" },
        ],
      },
    })
    const congelado = await cargarRespaldoDeIdea(clienteDeServicio(), idea)
    if (!congelado) throw new Error("La idea del motor no trajo respaldo")
    const id = await crearPiezaSinVoz()
    await aprobarConRespaldo(id, congelado)
    const primera = congelado.afirmaciones[0]
    if (!primera) throw new Error("El respaldo no trajo afirmaciones")
    await pool.query("update public.afirmaciones set excluida = true where id = $1", [primera.id])
    await pool.query("delete from public.teorias where id = $1", [congelado.teoria.id])
    simular()

    expect((await grabarPieza(doble().deps, id)).resultado).toBe("grabada")
  })
})
