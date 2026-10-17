import type { SupabaseClient } from "@supabase/supabase-js"
import { urlParaVer } from "@/lib/acciones/medios"
import { leerPresupuesto } from "@/lib/datos/pantallas"
import { type FilaDePieza, leerProduccion } from "@/lib/datos/repositorio"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { textoParaVoz } from "@/lib/dominio/etiquetas"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import {
  type Alcance,
  alcanceDeVideo,
  alcanceDeVoz,
  costoDeVoz,
  lineaDeFirma,
  lineaDeSaldoVoz,
  type Saldos,
} from "@/lib/dominio/saldos"
import { vozDelGuion } from "@/lib/dominio/voz"
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
  /** What to top up when ElevenLabs or the month's cap does not reach; null lets the button work. */
  bloqueoVoz: string | null
  /** Closes the signature when HeyGen or the month's cap cannot cover the video; the voice is already made. */
  bloqueoVideo: string | null
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
}

const TEXTO_SIN_TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes o espera al próximo mes."

const bloqueo = (alcance: Alcance) => (alcance.tipo === "no_alcanza" ? alcance.mensaje : null)

export function presentarGrabacion(entrada: {
  guion: string
  motor: string | null
  saldos: Saldos
  zona: string
  /** The ElevenLabs model: it decides which tone marks reach the voice, and so the characters it bills. */
  modeloDeVoz: string
  /** What is left of the month's cap. */
  quedanUsd: number
}): BotonesDeGrabacion {
  const { guion, motor, saldos } = entrada
  // The cost and the balance of the voice are about the text ElevenLabs receives, not the stored script.
  const textoDeVoz = textoParaVoz(guion, entrada.modeloDeVoz)
  const usdVoz = estimarCostoVoz(textoDeVoz)
  const usdVideo = estimarCostoVideo(guion, motor)
  const sinTope = (costo: number) => (entrada.quedanUsd < costo ? TEXTO_SIN_TOPE : null)
  const costoVozPartido = costoDeVoz(textoDeVoz.length, usdVoz)
  return {
    montoVoz: costoVozPartido.monto,
    unidadVoz: costoVozPartido.unidad,
    saldoVoz: lineaDeSaldoVoz(saldos.elevenlabs, entrada.zona),
    bloqueoVoz: sinTope(usdVoz) ?? bloqueo(alcanceDeVoz(saldos.elevenlabs, textoDeVoz.length)),
    // The signature needs her voice first, so the video is only about its own cost.
    bloqueoVideo:
      sinTope(usdVideo) ??
      bloqueo(alcanceDeVideo(saldos.heygen, { usd: usdVideo, creditos: estimarCreditosVideo(guion, motor) })),
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
const CLAVE_DE_INTENTO = /^(.*:voz:[0-9a-f]{16}:(\d+))(?::r\d+)?$/

/**
 * Read through Coni's session (she can read `gastos`). True only when every try of the latest voice attempt was released
 * as a refusal: one open (unknown outcome), swept or confirmed try means that attempt may have cost money.
 */
async function leerVozSinCobro(db: SupabaseClient<Database>, fila: FilaDePieza): Promise<boolean> {
  const piezaId = fila.id
  const voz = () =>
    db
      .from("gastos")
      .select("clave, estado, sin_cobro")
      .eq("pieza_id", piezaId)
      .eq("proveedor", "elevenlabs")
      .eq("paso", "voz")
  const { data: ultima, error } = await voz()
    .order("creado_en", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el gasto de la voz: ${error.message}`)
  const partes = ultima ? CLAVE_DE_INTENTO.exec(ultima.clave) : null
  const base = partes?.[1]
  // A newer attempt that failed before reserving (the cap, a missing key) must not inherit an older refusal.
  if (!base || Number(partes?.[2]) !== fila.intento) return false
  const { data: intentos, error: errorIntentos } = await voz().or(`clave.eq."${base}",clave.like."${base}:r%"`)
  if (errorIntentos) throw new Error(`No pude leer los gastos del intento de voz: ${errorIntentos.message}`)
  return intentos.length > 0 && intentos.every((g) => g.estado === "liberado" && g.sin_cobro)
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
  let config: ReturnType<typeof leerConfigProduccion>
  try {
    config = leerConfigProduccion(await leerProduccion(db))
  } catch (error) {
    if (!(error instanceof FallaDeConfiguracion)) throw error
    console.error("No pude leer la configuración para la puerta 1", error)
    return { estado, voz: null, botones: null, lineaDeFirma: lineaDeFirma(null), vozSinCobro: false }
  }
  const clave = vozVigente(fila, guion, config)
  const [saldos, presupuesto, url, vozSinCobro] = await Promise.all([
    leerSaldos(),
    leerPresupuesto(db, Date.now(), zona),
    urlParaVer(clave),
    vozSinCobroOFalso(db, fila),
  ])
  return {
    estado,
    voz: clave === null ? null : { url, clave },
    vozSinCobro,
    botones: presentarGrabacion({
      guion,
      motor: config.heygen.motor,
      saldos,
      zona,
      modeloDeVoz: config.elevenlabs.model_id,
      quedanUsd: presupuesto.tope - presupuesto.usado,
    }),
    lineaDeFirma: lineaDeFirma({
      segundos: estimarSegundos(guion),
      usd: estimarCostoVideo(guion, config.heygen.motor),
    }),
  }
}
