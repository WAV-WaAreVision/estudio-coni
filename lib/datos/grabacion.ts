import type { SupabaseClient } from "@supabase/supabase-js"
import { urlParaVer } from "@/lib/acciones/medios"
import { leerPresupuesto } from "@/lib/datos/pantallas"
import { leerPausasAbiertas } from "@/lib/datos/pausas"
import { type FilaDePieza, leerPieza, leerProduccion } from "@/lib/datos/repositorio"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { textoParaVoz } from "@/lib/dominio/etiquetas"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { type ProveedorConPausa, textoDePausa } from "@/lib/dominio/pausas"
import {
  type Alcance,
  alcanceDeVideo,
  alcanceDeVoz,
  costoDeVoz,
  lineaDeFirma,
  lineaDeSaldoVideo,
  lineaDeSaldoVoz,
  type Saldos,
} from "@/lib/dominio/saldos"
import { vozDelGuion } from "@/lib/dominio/voz"
import { dolares } from "@/lib/formato"
import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { formulaGuardada } from "@/lib/produccion/aprobacion"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { estimarCostoVideo, estimarCreditosVideo } from "@/lib/produccion/grabar"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { claveVozAprobada } from "@/lib/proveedores/almacen"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { leerSaldos } from "@/lib/saldos/reales"
import type { Database } from "@/lib/supabase/database.types"

export interface BotonesDeGrabacion {
  /** The cost of her voice split for the layout: «US$ 0,33» and «~1.100 caracteres». */
  montoVoz: string
  unidadVoz: string
  saldoVoz: string
  /** A paused ElevenLabs, or what to top up when its balance or the month's cap does not reach; null lets it work. */
  bloqueoVoz: string | null
  /** Closes the signature when HeyGen or the month's cap cannot cover the video; the voice is already made. */
  bloqueoVideo: string | null
  /** The HeyGen balance line WAV reads, and the video's estimate (WAV's email names both). */
  saldoVideo: string
  montoVideo: string
  /**
   * `bloqueoVoz` / `bloqueoVideo` is a balance that does not cover the estimate: no pause opens for it, so «Avisar a
   * Federico» sits beside the block (issue 101, decision 1). A pause or the month's limit is never one.
   */
  vozSinSaldo: boolean
  videoSinSaldo: boolean
}

export interface DatosDeGrabacion {
  /** Gate 1: the script waits for her signature, or her voice of it is being made. */
  estado: "guion_por_aprobar" | "grabando_voz"
  /** Her voice of this exact script, signed for an hour; null when there is none yet. */
  voz: { url: string | null; clave: string } | null
  /** Null when the production setup does not read: the buttons still work, without numbers. */
  botones: BotonesDeGrabacion | null
  /** Under the slider: what the signature spends and how long she has to undo it. */
  lineaDeFirma: string
  /** The piece's latest voice reservation was released because ElevenLabs refused it: that attempt cost nothing. */
  vozSinCobro: boolean
  /** Claude's pause text while it is paused: «Pedir cambios» needs a new script (plan amendment A5). */
  bloqueoCambios: string | null
}

const bloqueo = (alcance: Alcance) => (alcance.tipo === "no_alcanza" ? alcance.mensaje : null)

export function presentarGrabacion(entrada: {
  guion: string
  motor: string | null
  saldos: Saldos
  zona: string
  /** The ElevenLabs model: it decides which tone marks reach the voice, and so the characters it bills. */
  modeloDeVoz: string
  /** What is left of the month's limit (`limite - usado`). */
  quedanUsd: number
  /** The providers paused right now. */
  pausas: readonly ProveedorConPausa[]
}): BotonesDeGrabacion {
  const { guion, motor, saldos } = entrada
  // The cost and the balance of the voice are about the text ElevenLabs receives, not the stored script.
  const textoDeVoz = textoParaVoz(guion, entrada.modeloDeVoz)
  const usdVoz = estimarCostoVoz(textoDeVoz)
  const usdVideo = estimarCostoVideo(guion, motor)
  const sinLimite = (costo: number) => (entrada.quedanUsd < costo ? TEXTO_LIMITE : null)
  const costoVozPartido = costoDeVoz(textoDeVoz.length, usdVoz)
  // At gate 1 her voice is not signed yet: new spend, stopped by the month's limit (spec 2026-11-02, D1).
  // A paused provider closes its button with its pause text before any balance or limit (spec 2026-11-07).
  const antesDelSaldoVoz = textoDePausa(entrada.pausas, "elevenlabs") ?? sinLimite(usdVoz)
  const saldoVoz = bloqueo(alcanceDeVoz(saldos.elevenlabs, textoDeVoz.length))
  // The signature starts the recording, which is signed work: only HeyGen (its pause, its balance) can close it.
  const pausaVideo = textoDePausa(entrada.pausas, "heygen")
  const saldoVideo = bloqueo(
    alcanceDeVideo(saldos.heygen, { usd: usdVideo, creditos: estimarCreditosVideo(guion, motor) }),
  )
  return {
    montoVoz: costoVozPartido.monto,
    unidadVoz: costoVozPartido.unidad,
    saldoVoz: lineaDeSaldoVoz(saldos.elevenlabs, entrada.zona),
    saldoVideo: lineaDeSaldoVideo(saldos.heygen),
    montoVideo: dolares(usdVideo),
    bloqueoVoz: antesDelSaldoVoz ?? saldoVoz,
    bloqueoVideo: pausaVideo ?? saldoVideo,
    vozSinSaldo: antesDelSaldoVoz === null && saldoVoz !== null,
    videoSinSaldo: pausaVideo === null && saldoVideo !== null,
  }
}

/**
 * The stored voice that speaks this script with the configured voice: a take of its fingerprint, or, while gate 1 of
 * formula 2 or 3 stands, the legacy voice of that approval. Formula 1 pieces keep their own voice.
 */
export function vozVigente(
  fila: FilaDePieza,
  guion: string,
  config: ReturnType<typeof leerConfigProduccion>,
): string | null {
  const formula = formulaGuardada(fila)
  if (fila.puerta1_hash !== null && (formula === null || formula === 1)) return fila.audio_id
  return vozDelGuion({
    audioId: fila.audio_id,
    piezaId: fila.id,
    huella: huellaDelGuion(guion, config.elevenlabs),
    legadas: fila.puerta1_hash === null ? [] : [claveVozAprobada(fila.id, fila.puerta1_hash)],
  })
}

/** `<pieza>:voz:<huella>:<intento>` plus an optional `:r<n>`: the attempt's key and its further tries. */
/** `<pieza>:voz:<huella>:<intento>` plus an optional `:r<n>`: the attempt is the number after the fingerprint. */
const CLAVE_DE_INTENTO = /:voz:[0-9a-f]{16}:(\d+)(?::r\d+)?$/

/**
 * Read through Coni's session (she can read `gastos`). True only when every voice try of the piece's current attempt,
 * whatever script it spoke, was released as a refusal: one open (unknown outcome), swept or confirmed try means the
 * attempt may have cost money. No try of this attempt (it failed before reserving, like the cap) says nothing either.
 */
async function leerVozSinCobro(db: SupabaseClient<Database>, fila: FilaDePieza): Promise<boolean> {
  const { data, error } = await db
    .from("gastos")
    .select("clave, estado, sin_cobro")
    .eq("pieza_id", fila.id)
    .eq("proveedor", "elevenlabs")
    .eq("paso", "voz")
  if (error) throw new Error(`No pude leer el gasto de la voz: ${error.message}`)
  const delIntento = data.filter((g) => Number(CLAVE_DE_INTENTO.exec(g.clave)?.[1] ?? Number.NaN) === fila.intento)
  return delIntento.length > 0 && delIntento.every((g) => g.estado === "liberado" && g.sin_cobro)
}

/** The line is a courtesy: a failed read only hides it, gate 1 still opens. */
async function vozSinCobroOFalso(db: SupabaseClient<Database>, fila: FilaDePieza): Promise<boolean> {
  try {
    return await leerVozSinCobro(db, fila)
  } catch (error) {
    console.error(`No pude saber si el último intento de voz de la pieza ${fila.id} se cobró`, error)
    return false
  }
}

/** Everything gate 1 shows about her voice and the video, read when the screen opens. */
export async function leerDatosDeGrabacion(
  db: SupabaseClient<Database>,
  entrada: { fila: FilaDePieza; estado: DatosDeGrabacion["estado"]; guion: string; zona: string },
): Promise<DatosDeGrabacion> {
  const { fila, estado, guion, zona } = entrada
  // Read before the config, so the early return below also closes «Pedir cambios» while Claude is paused.
  const pausas = await leerPausasAbiertas(db)
  const bloqueoCambios = textoDePausa(pausas, "claude")
  let config: ReturnType<typeof leerConfigProduccion>
  try {
    config = leerConfigProduccion(await leerProduccion(db))
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude leer la configuración para la puerta 1", error)
    return { estado, voz: null, botones: null, lineaDeFirma: lineaDeFirma(null), vozSinCobro: false, bloqueoCambios }
  }
  const clave = vozVigente(fila, guion, config)
  const [saldos, presupuesto, url, vozSinCobro] = await Promise.all([
    leerSaldos(),
    leerPresupuesto(db, Date.now()),
    urlParaVer(clave),
    vozSinCobroOFalso(db, fila),
  ])
  return {
    estado,
    voz: clave === null ? null : { url, clave },
    vozSinCobro,
    bloqueoCambios,
    botones: presentarGrabacion({
      guion,
      motor: config.heygen.motor,
      saldos,
      zona,
      modeloDeVoz: config.elevenlabs.model_id,
      quedanUsd: presupuesto.limite - presupuesto.usado,
      pausas,
    }),
    lineaDeFirma: lineaDeFirma({
      segundos: estimarSegundos(guion),
      usd: estimarCostoVideo(guion, config.heygen.motor),
    }),
  }
}

const enPuerta1 = (estado: string): estado is DatosDeGrabacion["estado"] =>
  estado === "guion_por_aprobar" || estado === "grabando_voz"

/**
 * Gate 1's buttons of a piece recomputed the way its page does, for «Avisar a Federico» on a balance block (issue 101,
 * decision 1): null when the piece is not a reel at gate 1 with its script.
 */
export async function leerBotonesDeLaPieza(
  db: SupabaseClient<Database>,
  id: string,
): Promise<{ titulo: string; intento: number; botones: BotonesDeGrabacion | null } | null> {
  const fila = await leerPieza(db, id)
  if (fila === null || fila.tipo === "carrusel" || fila.guion === null) return null
  const { estado, guion } = fila
  if (!enPuerta1(estado)) return null
  const { data, error } = await db.from("ajustes").select("zona").maybeSingle()
  if (error) throw new Error(`No pude leer la zona de los ajustes: ${error.message}`, { cause: error })
  const datos = await leerDatosDeGrabacion(db, { fila, estado, guion, zona: data?.zona ?? "America/Santiago" })
  return { titulo: fila.titulo, intento: fila.intento, botones: datos.botones }
}
