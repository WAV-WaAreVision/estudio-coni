import {
  type AprobacionGuion,
  type AprobacionVideo,
  type EstadoAntesDelError,
  instanteEstricto,
  type Pieza,
  tipoDePieza,
} from "@/lib/dominio/estados"
import { formulaDePuerta2 } from "@/lib/dominio/puertas"
import type { Database } from "@/lib/supabase/database.types"

type FilaBase = Database["public"]["Tables"]["piezas"]["Row"]

type ColumnaDeInstante = "puerta1_en" | "puerta2_publicar_en" | "puerta2_en"

/** The columns the server may write on a piece; who approved (`puerta*_por`) is set by the database. */
export type CambiosPieza = Pick<
  FilaBase,
  | "estado"
  | "version"
  | "intento"
  | "estado_antes_del_error"
  | "audio_id"
  | "video_id"
  | "puerta1_hash"
  | "puerta1_en"
  | "puerta2_video_id"
  | "puerta2_hash_texto"
  | "puerta2_publicar_en"
  | "puerta2_en"
  | "puerta2_formula"
  | "explicacion"
>

/** What the domain reads from a row: supabase-js gives strings, node-postgres gives `Date`s. */
export type FilaPieza = Omit<CambiosPieza, ColumnaDeInstante> &
  Record<ColumnaDeInstante, string | Date | null> & { tipo: FilaBase["tipo"] }

const REINTENTABLES: readonly EstadoAntesDelError[] = ["en_render", "subtitulando", "programado"]

/**
 * Postgres keeps microseconds and writes `2026-10-08 22:00:00.123456+00`; supabase-js sends
 * `2026-10-08T22:00:00.123456+00:00`. `instanteEstricto` takes ISO with at most milliseconds.
 */
function instanteDeBase(valor: string | Date | null): string | null {
  if (valor === null) return null
  if (valor instanceof Date && Number.isNaN(valor.getTime())) {
    throw new Error("Instante ilegible en la base: fecha inválida")
  }
  const texto =
    valor instanceof Date
      ? valor.toISOString()
      : valor
          .replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T")
          .replace(/(\.\d{3})\d+/, "$1")
          .replace(/([+-]\d{2})$/, "$1:00")
  const instante = instanteEstricto(texto)
  if (!instante) {
    throw new Error(`Instante ilegible en la base: ${String(valor)}`)
  }
  return instante
}

function estadoAntesDelError(valor: FilaBase["estado_antes_del_error"]): EstadoAntesDelError | null {
  if (valor === null) return null
  const reintentable = REINTENTABLES.find((estado) => estado === valor)
  if (!reintentable) {
    throw new Error(`estado_antes_del_error no es un paso reintentable: ${valor}`)
  }
  return reintentable
}

function puerta1(fila: FilaPieza): AprobacionGuion | null {
  const en = instanteDeBase(fila.puerta1_en)
  if (fila.puerta1_hash === null && en === null) return null
  if (fila.puerta1_hash === null || en === null) {
    throw new Error("La puerta 1 de la pieza está incompleta en la base.")
  }
  return { hash: fila.puerta1_hash, en }
}

function puerta2(fila: FilaPieza): AprobacionVideo | null {
  const publicarEn = instanteDeBase(fila.puerta2_publicar_en)
  const en = instanteDeBase(fila.puerta2_en)
  const { puerta2_video_id: videoId, puerta2_hash_texto: hashTexto } = fila
  if (videoId === null && hashTexto === null && publicarEn === null && en === null) return null
  if (videoId === null || hashTexto === null || publicarEn === null || en === null) {
    throw new Error("La puerta 2 de la pieza está incompleta en la base.")
  }
  return { videoId, hashTexto, formula: formulaDePuerta2(fila.puerta2_formula), publicarEn, en }
}

export function piezaDesdeFila(fila: FilaPieza): Pieza {
  return {
    tipo: tipoDePieza(fila.tipo),
    estado: fila.estado,
    version: fila.version,
    intento: fila.intento,
    estadoAntesDelError: estadoAntesDelError(fila.estado_antes_del_error),
    audioId: fila.audio_id,
    videoId: fila.video_id,
    puerta1: puerta1(fila),
    puerta2: puerta2(fila),
    explicacion: fila.explicacion,
  }
}

export function cambiosDesdePieza(pieza: Pieza): CambiosPieza {
  return {
    estado: pieza.estado,
    version: pieza.version,
    intento: pieza.intento,
    estado_antes_del_error: pieza.estadoAntesDelError,
    audio_id: pieza.audioId,
    video_id: pieza.videoId,
    puerta1_hash: pieza.puerta1?.hash ?? null,
    puerta1_en: pieza.puerta1?.en ?? null,
    puerta2_video_id: pieza.puerta2?.videoId ?? null,
    puerta2_hash_texto: pieza.puerta2?.hashTexto ?? null,
    puerta2_publicar_en: pieza.puerta2?.publicarEn ?? null,
    puerta2_en: pieza.puerta2?.en ?? null,
    // Null stays null for formula 1: an approval from before LinkedIn is rewritten exactly as it was.
    puerta2_formula: pieza.puerta2?.formula === 2 ? 2 : null,
    explicacion: pieza.explicacion,
  }
}
