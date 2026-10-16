import type { SupabaseClient } from "@supabase/supabase-js"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  type CambiosDePieza,
  confirmarGasto,
  type FilaDeGasto,
  type FilaDePieza,
  leerPieza,
  leerProduccion,
  leerSecreto,
  liberarGasto,
  reservarGasto,
} from "@/lib/datos/repositorio"
import {
  ArtefactoCambio,
  type Evento,
  esperaDeVentana,
  MARGEN_DE_RELOJ_MS,
  TransicionInvalida,
  transicionar,
  VENTANA_DESHACER_MS,
} from "@/lib/dominio/estados"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveIdempotencia, formulaDePuerta1, hashPuerta1, puedeGrabar } from "@/lib/dominio/puertas"
import { alinearConGuion, assDe, leerSrt } from "@/lib/dominio/subtitulos"
import { vozDelGuion } from "@/lib/dominio/voz"
import { artefactoAprobado, formulaGuardada } from "@/lib/produccion/aprobacion"
import { aCuatroDecimales, avisarTope, explicar, MINIMO_USD, piezaCambio, TEXTO_TOPE } from "@/lib/produccion/comun"
import { asegurarVoz, huellaDelGuion, leerLlaveDeVoz } from "@/lib/produccion/voz"
import { type Almacen, claveVideo, claveVozAprobada } from "@/lib/proveedores/almacen"
import type { Notificador } from "@/lib/proveedores/avisos"
import { type ConfigCompleta, leerConfigProduccion } from "@/lib/proveedores/config"
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
  /** Waits that long before the run goes on (`wait.for` in the task): the undo window of a fresh signature. */
  esperar: (ms: number) => Promise<void>
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

/** The same render in credits, for an API wallet that counts credits instead of dollars. */
export function estimarCreditosVideo(guion: string, motor: string | null): number {
  const creditosPorMinuto = motor === "avatar_v" ? CREDITOS_POR_MINUTO_AVATAR_V : CREDITOS_POR_MINUTO_AVATAR_IV
  return Math.ceil((estimarSegundos(guion) / 60) * creditosPorMinuto)
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

/** A write of columns outside the domain, locked on the version the run holds; the run holds the new row after it. */
async function guardarConVersion(contexto: Contexto, cambios: Omit<CambiosDePieza, "version">): Promise<void> {
  const { fila } = contexto
  const guardada = await actualizarPieza(contexto.deps.db, fila.id, fila.version, {
    ...cambios,
    version: fila.version + 1,
  })
  if (!guardada) throw piezaCambio()
  contexto.fila = guardada
}

/** The write that makes the video findable by a retry, right after POST /v3/videos and before any wait. */
function guardarRender(contexto: Contexto, videoId: string): Promise<void> {
  return guardarConVersion(contexto, { render_id: videoId })
}

/**
 * The run takes the piece before its first spend (design 2026-10-15, decision 5): a write of the version alone, so the
 * state and the notices stay as they are. An undo that committed after the run read the row makes it miss, and the
 * retry finds the piece back at gate 1; an undo that comes after it misses the version her screen signed.
 */
function tomarLaPieza(contexto: Contexto): Promise<void> {
  return guardarConVersion(contexto, {})
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
  // The binding of the voice to gate 1, right before the call that charges.
  const audioId = vozAprobada(contexto)
  if (audioId === null) {
    throw new FallaDeConfiguracion(`La voz de la pieza ${fila.id} no corresponde al guion aprobado.`)
  }
  const voz = await deps.almacen.bajar(audioId)
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

async function cargarContexto(deps: DepsGrabacion, fila: FilaDePieza, guion: string, hash: string): Promise<Contexto> {
  const config = leerConfigProduccion(await leerProduccion(deps.db))
  const llave = await leerSecreto(deps.db, "heygen")
  if (!llave) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de HeyGen en Ajustes.")
  }
  const clave = claveIdempotencia({ piezaId: fila.id, paso: "grabar", hash, intento: fila.intento })
  return { deps, fila, guion, clave, hashAprobado: hash, llave, config }
}

/**
 * The longest wait a sane clock can ask for: the window and the margin, plus a minute of skew between the task and
 * the app. More than that means a clock is far off, and sleeping on it would hide a render that never starts.
 */
const ESPERA_MAXIMA_MS = VENTANA_DESHACER_MS + MARGEN_DE_RELOJ_MS + 60_000

/**
 * The second lock of the undo window (design 2026-10-15, decision 5). A run that starts before the window of its
 * signature has closed (a delayed run that fires early, a resumption by maintenance, a task clock behind the app's)
 * waits until the window and the clock margin are over, then decides on the row as it is now. A newer signature comes
 * with a newer attempt, which ends a run that carries its own in `grabarPieza`; a run queued without one by the
 * previously deployed app waits for that signature too. After one wait for a signature (`esperada`) the loop trusts
 * that wait, timed by Trigger.dev, instead of reading again a clock that may lag, so the loop always ends.
 */
async function despuesDeLaVentana(
  deps: DepsGrabacion,
  leida: FilaDePieza,
  intento: number | undefined,
): Promise<FilaDePieza | null> {
  let fila: FilaDePieza | null = leida
  let esperada: string | null = null
  while (fila?.estado === "en_render") {
    // A run of another attempt (an undone signature) ends in `grabarPieza`: waiting for its window would be pointless.
    if (intento !== undefined && fila.intento !== intento) break
    const firma = piezaDesdeFila(fila).puerta1
    if (firma === null || firma.en === esperada) break
    const ahora = deps.ahora()
    const espera = esperaDeVentana(firma.en, ahora)
    if (espera === 0) break
    if (espera > ESPERA_MAXIMA_MS) {
      const segundos = Math.ceil(espera / 1000)
      throw new FallaDeConfiguracion(
        `La pieza ${fila.id} tendría que esperar ${segundos} s a que cierre la ventana para deshacer: ` +
          `el reloj de la tarea (${ahora}) no cuadra con el de la firma (${firma.en}).`,
      )
    }
    await deps.esperar(espera)
    esperada = firma.en
    fila = await leerPieza(deps.db, fila.id)
  }
  return fila
}

/**
 * Renders the approved script in HeyGen, burns it as subtitles, checks the result and leaves the video in
 * `video_por_aprobar` for Coni. It never approves anything and never spends without the approval of gate 1. It is safe
 * to run again at any point: the render id is stored right after the video is created, a stored id is read instead
 * of creating again, and a piece left in `subtitulando` resumes from the delivered render. `intento`: the attempt the
 * run was started for; when the piece is on another one, the run ends without touching it.
 */
export async function grabarPieza(deps: DepsGrabacion, piezaId: string, intento?: number): Promise<ResultadoGrabacion> {
  const leida = await leerPieza(deps.db, piezaId)
  if (!leida) {
    throw new FallaDeConfiguracion(`No existe la pieza ${piezaId}.`)
  }
  // Before anything that spends: Coni may still be taking this signature back.
  const fila = await despuesDeLaVentana(deps, leida, intento)
  if (!fila) {
    throw new FallaDeConfiguracion(`No existe la pieza ${piezaId}.`)
  }
  if (fila.estado !== "en_render" && fila.estado !== "subtitulando") {
    return { resultado: "nada_que_hacer" }
  }
  // A run belongs to the attempt it was started for (the payload carries it; a run queued by an older app sends none).
  // One whose attempt is over, such as a signature Coni undid, must not render for the newer one: that one has its own.
  // The row was read again after the wait, so a signature undone and signed again meanwhile is caught here too.
  if (intento !== undefined && fila.intento !== intento) return { resultado: "nada_que_hacer" }
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
 * The stored voice the render may use, or null. Formula 1 hashed the voice itself. Formulas 2 and 3 hashed the script:
 * the voice must be a take of that exact script with the configured voice, or the legacy voice made under the key of
 * this very approval (it was generated for the approved script). Anything else is not what Coni approved.
 */
function vozAprobada(contexto: Contexto): string | null {
  const { fila, guion, config, hashAprobado } = contexto
  if (formulaDePuerta1(formulaGuardada(fila)) === 1) return fila.audio_id
  return vozDelGuion({
    audioId: fila.audio_id,
    piezaId: fila.id,
    huella: huellaDelGuion(guion, config.elevenlabs),
    legadas: [claveVozAprobada(fila.id, hashAprobado)],
  })
}

/** The voice of the approved script, reused when it exists, written into the piece. False when the cap stops it. */
async function ponerLaVoz(contexto: Contexto): Promise<boolean> {
  const { deps, config } = contexto
  const voz = await asegurarVoz(deps, {
    fila: contexto.fila,
    guion: contexto.guion,
    config: config.elevenlabs,
    llave: () => leerLlaveDeVoz(deps.db, config),
    nueva: false,
  })
  if (voz.tipo === "tope") {
    await explicar(deps, contexto.fila, TEXTO_TOPE)
    await avisarTope(deps, contexto.fila)
    return false
  }
  await escribir(contexto, { tipo: "voz_lista", audioId: voz.audioId })
  return true
}

async function avanzar(contexto: Contexto): Promise<ResultadoGrabacion> {
  const { deps } = contexto
  const { db } = deps
  const enRender = contexto.fila.estado === "en_render"

  // Only a render that was never created spends from here; a stored render id or a delivered video was paid already.
  if (enRender && contexto.fila.render_id === null) await tomarLaPieza(contexto)
  if (enRender && vozAprobada(contexto) === null && !(await ponerLaVoz(contexto))) {
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
