import type { SupabaseClient } from "@supabase/supabase-js"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  confirmarGasto,
  type FilaDeGasto,
  type FilaDePieza,
  leerPieza,
  leerProduccion,
  leerSecreto,
  liberarGasto,
  reservarGasto,
} from "@/lib/datos/repositorio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { ArtefactoCambio, type Evento, TransicionInvalida, transicionar } from "@/lib/dominio/estados"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import {
  type ArtefactoPuerta1,
  claveIdempotencia,
  formulaDePuerta1,
  hashPuerta1,
  hashTexto,
  puedeGrabar,
} from "@/lib/dominio/puertas"
import { huellaDeRespaldo } from "@/lib/dominio/respaldo"
import { alinearConGuion, assDe, leerSrt } from "@/lib/dominio/subtitulos"
import {
  aCuatroDecimales,
  avisarTope,
  estimarCostoVoz,
  explicar,
  MINIMO_USD,
  piezaCambio,
  TEXTO_TOPE,
} from "@/lib/produccion/comun"
import { type Almacen, claveVideo, claveVozAprobada } from "@/lib/proveedores/almacen"
import type { Notificador } from "@/lib/proveedores/avisos"
import { type ConfigCompleta, leerConfigProduccion } from "@/lib/proveedores/config"
import { generarVoz } from "@/lib/proveedores/elevenlabs"
import { armarPedido } from "@/lib/proveedores/heygen"
import {
  bajar,
  CODIGO_POLITICA,
  crearVideo,
  type EstadoVideo,
  esFallaPorCreditos,
  leerVideo,
  PoliticaDeContenido,
  subirAsset,
  TEXTO_SIN_CREDITOS,
} from "@/lib/proveedores/heygen-api"
import type { Database } from "@/lib/supabase/database.types"
import { type InfoVideo, revisarVideo } from "@/lib/video/chequeos"

export interface DepsGrabacion {
  /** A `service_role` client: the database triggers keep enforcing the gates on everything it writes. */
  db: SupabaseClient<Database>
  avisos: Notificador
  almacen: Almacen
  /** Burns the ASS subtitles into the video and returns the final mp4 (`quemarSubtitulos` with ffmpeg and fonts). */
  quemar: (entrada: { video: Uint8Array; ass: string }) => Promise<Uint8Array>
  /** Reads size, duration, frame size and audio of the final mp4 (`sondear` with ffprobe). */
  sondear: (bytes: Uint8Array) => Promise<InfoVideo>
  /**
   * Returns when HeyGen's callback woke the run or the wait ran out. It says nothing about the video: the status is
   * always read by id afterwards (design A10, the callback URL of a wait token does not authenticate).
   */
  esperarRender: (videoId: string) => Promise<void>
  /** Where HeyGen posts when the video is done; the wait token's URL in the task. */
  callbackUrl?: string
  /** Base URLs of the providers, for tests. */
  base?: { elevenlabs?: string }
  ahora: () => string
}

export type ResultadoGrabacion =
  | { resultado: "grabada"; videoId: string }
  | { resultado: "nada_que_hacer" }
  | { resultado: "sin_aprobacion" }
  | { resultado: "tope" }
  | { resultado: "politica_contenido" }
  | { resultado: "falla_produccion" }

/** avatar_v is 48 credits a minute and Avatar IV 16 (the `_motor` note of coni.config.json). */
const CREDITOS_POR_MINUTO_AVATAR_V = 48
const CREDITOS_POR_MINUTO_AVATAR_IV = 16
/**
 * ASSUMPTION, to be replaced with the price of Coni's plan: US$ 4 per minute of avatar_v, the upper end of what the
 * design's open question 5 found (US$ 3 to 4 per minute), spread over its 48 credits. The API does not return a cost;
 * the confirmed amount is this same estimate until the plan reads the real usage.
 */
const USD_POR_CREDITO = 4 / CREDITOS_POR_MINUTO_AVATAR_V

/** What a render of this script is expected to cost, by the engine the config asks for (null is Avatar IV). */
export function estimarCostoVideo(guion: string, motor: string | null): number {
  const creditosPorMinuto = motor === "avatar_v" ? CREDITOS_POR_MINUTO_AVATAR_V : CREDITOS_POR_MINUTO_AVATAR_IV
  const usd = (estimarSegundos(guion) / 60) * creditosPorMinuto * USD_POR_CREDITO
  return Math.max(MINIMO_USD, aCuatroDecimales(usd))
}

const TEXTO_FALLA_DE_HEYGEN = "HeyGen no pudo terminar el video"
const TEXTO_SIN_SUBTITULOS = "HeyGen no entregó los subtítulos del video. Vuelve a intentarlo en unos minutos."

function explicacionDeFalla(codigo: string): string {
  if (esFallaPorCreditos(codigo)) return TEXTO_SIN_CREDITOS
  const detalle = codigo === "desconocido" ? "" : ` (${codigo})`
  return `${TEXTO_FALLA_DE_HEYGEN}${detalle}. Vuelve a intentarlo en unos minutos.`
}

/**
 * Where the run is. `fila` is replaced by the row each write returns, so the next write carries the right version.
 * `clave` is the idempotency key of this attempt: one per piece, approved script and voice, and attempt (Regrabar,
 * a retry after an error and a new round of the script each bump `intento`).
 */
interface Contexto {
  deps: DepsGrabacion
  fila: FilaDePieza
  guion: string
  clave: string
  /** The gate 1 hash this run records. */
  hashAprobado: string
  llave: string
  /** Only loaded while the piece has no voice yet: a piece that already has it never needs ElevenLabs. */
  llaveElevenlabs: string | null
  config: ConfigCompleta
}

/** Writes a transition of the domain with the optimistic lock; the database triggers still guard the gates. */
async function escribir(contexto: Contexto, evento: Evento): Promise<void> {
  const { pieza } = transicionar(piezaDesdeFila(contexto.fila), evento)
  const guardada = await actualizarPieza(
    contexto.deps.db,
    contexto.fila.id,
    contexto.fila.version,
    cambiosDesdePieza(pieza),
  )
  if (!guardada) throw piezaCambio()
  contexto.fila = guardada
}

/** The write that makes the video findable by a retry, right after POST /v3/videos and before any wait. */
async function guardarRender(contexto: Contexto, videoId: string): Promise<void> {
  const { fila } = contexto
  const guardada = await actualizarPieza(contexto.deps.db, fila.id, fila.version, {
    render_id: videoId,
    version: fila.version + 1,
  })
  if (!guardada) throw piezaCambio()
  contexto.fila = guardada
}

/**
 * Moves the piece first and releases the spend after: a run that dies in between leaves a reservation for the sweeper
 * (Plan 4) but never a piece stuck in render because its spend was already released.
 */
async function rechazarPorPolitica(contexto: Contexto): Promise<ResultadoGrabacion> {
  await escribir(contexto, { tipo: "politica_contenido", explicacion: new PoliticaDeContenido().message })
  await liberarGasto(contexto.deps.db, contexto.clave)
  return { resultado: "politica_contenido" }
}

async function fallar(contexto: Contexto, explicacion: string): Promise<ResultadoGrabacion> {
  await escribir(contexto, { tipo: "falla_produccion", explicacion })
  // A no-op when the spend was already confirmed (the video was delivered and paid) or never reserved.
  await liberarGasto(contexto.deps.db, contexto.clave)
  return { resultado: "falla_produccion" }
}

function textoDe(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes)
}

/**
 * From a delivered render to a final video waiting for Coni: download, align the SRT with the approved script, burn,
 * check, store and hand over. The raw HeyGen video is not stored (design: deleted after burning).
 */
async function ponerSubtitulos(contexto: Contexto, entregado: Extract<EstadoVideo, { estado: "listo" }>) {
  const { deps, guion } = contexto
  if (!entregado.subtitleUrl) throw new Falla(TEXTO_SIN_SUBTITULOS)
  const video = await bajar(entregado.videoUrl)
  const srt = textoDe(await bajar(entregado.subtitleUrl))
  const ass = assDe(alinearConGuion(leerSrt(srt), guion))

  const final = await deps.quemar({ video, ass })
  const hallazgos = revisarVideo(await deps.sondear(final))
  if (hallazgos.length > 0) {
    throw new Falla(`El video no pasó los chequeos: ${hallazgos.map((h) => h.mensaje).join(" ")}`)
  }

  const videoId = claveVideo(contexto.fila.id, final)
  await deps.almacen.subir(videoId, final, "video/mp4")
  await escribir(contexto, { tipo: "video_listo", videoId })
  return videoId
}

interface Entrada {
  contexto: Contexto
  gasto: FilaDeGasto
}

/** Creates the video once per attempt and stores its id; returns the id. Called only while the piece is `en_render`. */
async function crearElVideo({ contexto, gasto }: Entrada): Promise<string> {
  const { deps, fila, guion, clave, llave, config } = contexto
  if (gasto.estado !== "reservado") {
    // Confirmed or released, with no video stored: creating again could charge twice for the same attempt.
    throw new FallaDeConfiguracion(
      `La reserva de HeyGen de la pieza ${fila.id} está ${gasto.estado}, pero la pieza no tiene video guardado.`,
    )
  }
  if (!fila.audio_id) {
    throw new FallaDeConfiguracion(`La pieza ${fila.id} no tiene voz guardada.`)
  }
  const voz = await deps.almacen.bajar(fila.audio_id)
  const audioAssetId = await subirAsset({
    clave: llave,
    datos: voz,
    tipo: "audio/mpeg",
    idempotencia: `${clave}:asset`,
  })
  const { cuerpo } = armarPedido({
    config,
    guion,
    titulo: fila.titulo,
    audioAssetId,
    // Null on pieces approved before the choice existed: they record with heygen.avatar_id.
    avatarId: fila.avatar_id ?? undefined,
  })
  const videoId = await crearVideo({
    clave: llave,
    pedido: cuerpo,
    callbackUrl: deps.callbackUrl,
    idempotencia: `${clave}:video`,
  })
  // Before waiting. If this write is lost, the retry asks again with the same idempotency key and HeyGen replays
  // its first answer instead of charging a second time.
  await guardarRender(contexto, videoId)
  return videoId
}

async function leerLlaveElevenlabs(deps: DepsGrabacion, config: ConfigCompleta): Promise<string> {
  if (!config.elevenlabs.voice_id) {
    throw new FallaDeConfiguracion("Falta elevenlabs.voice_id en la configuración de producción.")
  }
  const llave = await leerSecreto(deps.db, "elevenlabs")
  if (!llave) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de ElevenLabs en Ajustes.")
  }
  return llave
}

async function cargarContexto(deps: DepsGrabacion, fila: FilaDePieza, guion: string, hash: string): Promise<Contexto> {
  const config = leerConfigProduccion(await leerProduccion(deps.db))
  const llave = await leerSecreto(deps.db, "heygen")
  if (!llave) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de HeyGen en Ajustes.")
  }
  const llaveElevenlabs = !tieneLaVozAprobada(fila, hash) ? await leerLlaveElevenlabs(deps, config) : null
  const clave = claveIdempotencia({ piezaId: fila.id, paso: "grabar", hash, intento: fila.intento })
  return { deps, fila, guion, clave, hashAprobado: hash, llave, llaveElevenlabs, config }
}

/**
 * Formula 1 (legacy) approved the voice itself, so any stored one stands. Formula 2 approves the script and the voice
 * is made afterwards under a key derived from the approval: a voice under any other key (a draft made before gate 1)
 * was not made for what Coni approved and must not be recorded.
 */
function tieneLaVozAprobada(fila: FilaDePieza, hashAprobado: string): boolean {
  if (fila.audio_id === null) return false
  if (formulaDePuerta1(formulaGuardada(fila)) === 1) return true
  return fila.audio_id === claveVozAprobada(fila.id, hashAprobado)
}

/** The column is a smallint with a check for 1, 2 and 3; anything else is a corrupted row, not an approval. */
function formulaGuardada(fila: FilaDePieza): 1 | 2 | 3 | null {
  const { puerta1_formula: formula } = fila
  if (formula === null || formula === 1 || formula === 2 || formula === 3) return formula
  throw new FallaDeConfiguracion(`La pieza ${fila.id} guardó una fórmula de la puerta 1 desconocida: ${formula}.`)
}

/**
 * What gate 1 hashed, rebuilt from the row by the formula stored at approval (null is the legacy one, with the voice
 * in the hash). Null when a column the formula needs is empty, which is not an approval.
 */
function artefactoAprobado(fila: FilaDePieza, guion: string): ArtefactoPuerta1 | null {
  const formula = formulaDePuerta1(formulaGuardada(fila))
  if (formula === 1) {
    return fila.audio_id === null ? null : { formula: 1, guion, audioId: fila.audio_id, avatarId: fila.avatar_id }
  }
  if (fila.texto === null || fila.avatar_id === null) return null
  if (formula === 2) return { formula: 2, guion, texto: fila.texto, avatarId: fila.avatar_id }
  return {
    formula: 3,
    guion,
    texto: fila.texto,
    avatarId: fila.avatar_id,
    respaldo: huellaDeRespaldo(leerRespaldo(fila.respaldo)),
  }
}

/**
 * Renders the approved script in HeyGen, burns it as subtitles, checks the result and leaves the video in
 * `video_por_aprobar` for Coni. It never approves anything and never spends without the approval of gate 1. It is safe
 * to run again at any point: the render id is stored right after the video is created, a stored id is read instead
 * of creating again, and a piece left in `subtitulando` resumes from the delivered render.
 */
export async function grabarPieza(deps: DepsGrabacion, piezaId: string): Promise<ResultadoGrabacion> {
  const { db } = deps
  const fila = await leerPieza(db, piezaId)
  if (!fila) {
    throw new FallaDeConfiguracion(`No existe la pieza ${piezaId}.`)
  }
  if (fila.estado !== "en_render" && fila.estado !== "subtitulando") {
    return { resultado: "nada_que_hacer" }
  }
  const pieza = piezaDesdeFila(fila)
  if (fila.guion === null || pieza.puerta1 === null) {
    return { resultado: "sin_aprobacion" }
  }
  const { guion } = fila
  const artefacto = artefactoAprobado(fila, guion)
  if (artefacto === null) return { resultado: "sin_aprobacion" }
  if (fila.estado === "en_render") {
    // The one place that decides whether credits may be spent: what Coni approved is what is about to be rendered.
    const veredicto = puedeGrabar(pieza, hashPuerta1(artefacto))
    if (!veredicto.ok) return { resultado: "sin_aprobacion" }
  }

  const contexto = await cargarContexto(deps, fila, guion, pieza.puerta1.hash)
  try {
    return await avanzar(contexto)
  } catch (error) {
    // The piece changing under the run is not a failure of the render: the retry reads it again.
    if (error instanceof TransicionInvalida || error instanceof ArtefactoCambio) throw error
    if (error instanceof PoliticaDeContenido && contexto.fila.estado === "en_render") {
      return await rechazarPorPolitica(contexto)
    }
    // Anything written for Coni ends this attempt with an explanation; a plain Error or a configuration error is
    // rethrown, so Trigger.dev retries it or WAV sees it, and the spend stays reserved for the retry.
    if (error instanceof Falla) return await fallar(contexto, error.message)
    throw error
  }
}

/**
 * Speaks the approved script with Coni's voice and stores it, after gate 1 and right before HeyGen. The spend key is
 * per piece and attempt and the audio id goes into the piece, so a retry neither reserves nor speaks twice.
 * Returns false when the cap stops it.
 */
async function ponerLaVoz(contexto: Contexto): Promise<boolean> {
  const { deps, guion, fila } = contexto
  const { db } = deps
  const clave = claveIdempotencia({
    piezaId: fila.id,
    paso: "grabar",
    hash: hashTexto(`elevenlabs:${fila.id}`),
    intento: fila.intento,
  })
  const estimado = estimarCostoVoz(guion)
  const reserva = await reservarGasto(db, {
    piezaId: fila.id,
    proveedor: "elevenlabs",
    paso: "voz",
    estimadoUsd: estimado,
    clave,
    ahora: deps.ahora(),
  })
  if (reserva.tope) {
    await explicar(deps, fila, TEXTO_TOPE)
    await avisarTope(deps, fila)
    return false
  }
  if (reserva.gasto.estado !== "reservado") {
    // Confirmed only after the audio is saved in the piece, and nothing else releases a voice reservation.
    throw new FallaDeConfiguracion(
      `La reserva de la voz de la pieza ${fila.id} está ${reserva.gasto.estado}, pero la pieza sigue sin voz.`,
    )
  }
  if (contexto.llaveElevenlabs === null) {
    throw new FallaDeConfiguracion(`La pieza ${fila.id} necesita la voz y no se cargó la llave de ElevenLabs.`)
  }
  // One key per approval: if a dead run already uploaded the voice, this run finds it and does not pay again.
  // The window that stays open is a crash between ElevenLabs answering and the upload finishing: ElevenLabs has no
  // idempotency key, so that one case can still generate (and charge) once more.
  const audioId = claveVozAprobada(fila.id, contexto.hashAprobado)
  if (!(await deps.almacen.existe(audioId))) {
    const audio = await generarVoz({
      clave: contexto.llaveElevenlabs,
      config: contexto.config.elevenlabs,
      texto: guion,
      base: deps.base?.elevenlabs,
    })
    await deps.almacen.subir(audioId, audio, "audio/mpeg")
  }
  await escribir(contexto, { tipo: "voz_lista", audioId })
  await confirmarGasto(db, clave, estimado)
  return true
}

async function avanzar(contexto: Contexto): Promise<ResultadoGrabacion> {
  const { deps } = contexto
  const { db } = deps
  const enRender = contexto.fila.estado === "en_render"

  if (enRender && !tieneLaVozAprobada(contexto.fila, contexto.hashAprobado) && !(await ponerLaVoz(contexto))) {
    return { resultado: "tope" }
  }

  let videoId = contexto.fila.render_id
  if (videoId === null) {
    if (!enRender) {
      // The video of a piece that is subtitling was delivered, so its id was stored: without it there is nothing to read.
      throw new FallaDeConfiguracion(`La pieza ${contexto.fila.id} está subtitulando sin render_id.`)
    }
    // A bad setup fails here, before any money is reserved and before any request: the asset id is a placeholder.
    armarPedido({
      config: contexto.config,
      guion: contexto.guion,
      titulo: contexto.fila.titulo,
      audioAssetId: "pendiente",
      avatarId: contexto.fila.avatar_id ?? undefined,
    })
  }
  const estimado = estimarCostoVideo(contexto.guion, contexto.config.heygen.motor)
  const reserva = await reservarGasto(db, {
    piezaId: contexto.fila.id,
    proveedor: "heygen",
    paso: "grabar",
    estimadoUsd: estimado,
    clave: contexto.clave,
    ahora: deps.ahora(),
  })
  if (reserva.tope) {
    await explicar(deps, contexto.fila, TEXTO_TOPE)
    await avisarTope(deps, contexto.fila)
    return { resultado: "tope" }
  }
  const { gasto } = reserva

  let video: EstadoVideo
  if (videoId === null) {
    videoId = await crearElVideo({ contexto, gasto })
    video = { estado: "pendiente" }
  } else {
    // A stored render may have finished while the run was away: read it before waiting for a callback that went to
    // another run's token.
    video = await leerVideo({ clave: contexto.llave, videoId })
  }

  if (enRender && (video.estado === "pendiente" || video.estado === "procesando")) {
    await deps.esperarRender(videoId)
    video = await leerVideo({ clave: contexto.llave, videoId })
  }

  switch (video.estado) {
    case "pendiente":
    case "procesando":
      throw new Error(`HeyGen sigue procesando el video ${videoId}.`)
    case "fallido":
      if (enRender && video.fallo.codigo === CODIGO_POLITICA) return rechazarPorPolitica(contexto)
      return fallar(contexto, explicacionDeFalla(video.fallo.codigo))
    case "listo": {
      if (enRender) await escribir(contexto, { tipo: "render_entregado" })
      // Paid for from here on: confirmed whether or not the subtitles work out.
      if (gasto.estado === "reservado") await confirmarGasto(db, contexto.clave, gasto.estimado_usd)
      const videoFinal = await ponerSubtitulos(contexto, video)
      return { resultado: "grabada", videoId: videoFinal }
    }
  }
}
