import type { Estado } from "@/lib/dominio/estados"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { diaLocal, etiquetaDeFecha, semanaDe } from "@/lib/dominio/fechas"
import type { Pilar } from "@/lib/dominio/pilares"

export interface PiezaDeInicio {
  id: string
  titulo: string
  estado: Estado
  explicacion: string | null
  guion: string | null
  pilar: Pilar | null
  publicarEn: string | null
  permalink: string | null
  actualizadaEn: string
}

export interface FilaDeFirma {
  id: string
  titulo: string
  pilar: Pilar | null
  meta: string
  href: string
}

export interface FilaEnCamino {
  id: string
  titulo: string
  pilar: Pilar | null
  estado: string
  /** Being worked on right now: the row is not a link and shows a quiet progress bar. */
  ocupada: boolean
}

export interface AvisoDeInicio {
  tipo: "error" | "ok"
  titulo: string
  texto: string
  accion?: { etiqueta: string; href: string; externo?: boolean }
}

export interface Inicio {
  semana: string
  resumen: string
  firma: FilaDeFirma[]
  camino: FilaEnCamino[]
  avisos: AvisoDeInicio[]
}

const MINUTOS_POR_FIRMA = 3
const DIAS_DE_CELEBRACION_MS = 2 * 24 * 60 * 60 * 1000
const EXPLICACION_GENERICA = "Algo no salió como esperábamos con esta pieza."

function resumenDeFirmas(cantidad: number): string {
  if (cantidad === 0) return "Esta semana está al día"
  const minutos = cantidad * MINUTOS_POR_FIRMA
  return cantidad === 1
    ? `Una cosa espera tu firma · unos ${minutos} min`
    : `${cantidad} cosas esperan tu firma · unos ${minutos} min`
}

function segundosDe(pieza: PiezaDeInicio): number {
  return Math.round(estimarSegundos(pieza.guion ?? ""))
}

function filaDeFirma(pieza: PiezaDeInicio): FilaDeFirma {
  const esGuion = pieza.estado === "guion_por_aprobar"
  return {
    id: pieza.id,
    titulo: pieza.titulo,
    pilar: pieza.pilar,
    meta: `${esGuion ? "Guion" : "Video"} · ${segundosDe(pieza)} s`,
    href: esGuion ? `/guion/${pieza.id}` : `/video/${pieza.id}`,
  }
}

function filaEnCamino(pieza: PiezaDeInicio, zona: string): FilaEnCamino | null {
  const base = { id: pieza.id, titulo: pieza.titulo, pilar: pieza.pilar }
  switch (pieza.estado) {
    case "guion_en_proceso":
      // With a reason on it, the piece is a notice (it is not being written), not "on its way".
      return pieza.explicacion === null ? { ...base, estado: "Escribiendo el guion · te aviso", ocupada: true } : null
    case "en_render":
    case "subtitulando":
      return { ...base, estado: "Grabando · unos 5 min · te aviso", ocupada: true }
    case "programado":
      return {
        ...base,
        estado: pieza.publicarEn ? `Programado · ${etiquetaDeFecha(pieza.publicarEn, zona, "corta")}` : "Programado",
        ocupada: false,
      }
    default:
      return null
  }
}

function avisoDeError(pieza: PiezaDeInicio): AvisoDeInicio | null {
  const texto = pieza.explicacion ?? EXPLICACION_GENERICA
  switch (pieza.estado) {
    case "error_produccion":
    case "guion_en_proceso":
      return pieza.estado === "guion_en_proceso" && pieza.explicacion === null
        ? null
        : { tipo: "error", titulo: pieza.titulo, texto, accion: { etiqueta: "Revisar", href: `/guion/${pieza.id}` } }
    case "error_publicacion":
      return { tipo: "error", titulo: pieza.titulo, texto, accion: { etiqueta: "Revisar", href: `/video/${pieza.id}` } }
    case "guion_por_aprobar":
      return pieza.explicacion === null
        ? null
        : {
            tipo: "error",
            titulo: pieza.titulo,
            texto,
            accion: { etiqueta: "Revisar la frase", href: `/guion/${pieza.id}` },
          }
    case "video_por_aprobar":
      return pieza.explicacion === null
        ? null
        : {
            tipo: "error",
            titulo: pieza.titulo,
            texto,
            accion: { etiqueta: "Elegir otra fecha", href: `/video/${pieza.id}` },
          }
    default:
      return null
  }
}

function avisoDePublicacion(pieza: PiezaDeInicio, ahora: number, zona: string): AvisoDeInicio {
  const publicadaEn = Date.parse(pieza.actualizadaEn)
  const hora = etiquetaDeFecha(pieza.actualizadaEn, zona, "corta").split(" · ")[1] ?? ""
  const cuando =
    diaLocal(publicadaEn, zona) === diaLocal(ahora, zona)
      ? `hoy a las ${hora}`
      : `el ${etiquetaDeFecha(pieza.actualizadaEn, zona, "corta").replace(" · ", " a las ")}`
  return {
    tipo: "ok",
    titulo: `${pieza.titulo} se publicó ${cuando}`,
    texto: "La etiqueta de IA quedó puesta en Instagram.",
    ...(pieza.permalink ? { accion: { etiqueta: "Ver en Instagram", href: pieza.permalink, externo: true } } : {}),
  }
}

/** What is being worked on comes first (it has no date yet); what is scheduled follows, soonest first. */
function porHoraDePublicacion(a: PiezaDeInicio, b: PiezaDeInicio): number {
  if (a.publicarEn === null || b.publicarEn === null)
    return Number(a.publicarEn !== null) - Number(b.publicarEn !== null)
  return Date.parse(a.publicarEn) - Date.parse(b.publicarEn)
}

/** What Inicio shows, from the pieces and the clock: no database, no rendering. */
export function construirInicio(entrada: { piezas: readonly PiezaDeInicio[]; ahora: number; zona: string }): Inicio {
  const { piezas, ahora, zona } = entrada
  const firma = piezas
    .filter((pieza) => pieza.estado === "guion_por_aprobar" || pieza.estado === "video_por_aprobar")
    .map(filaDeFirma)
  const camino = piezas
    .map((pieza) => ({ pieza, fila: filaEnCamino(pieza, zona) }))
    .filter((par): par is { pieza: PiezaDeInicio; fila: FilaEnCamino } => par.fila !== null)
    .sort((a, b) => porHoraDePublicacion(a.pieza, b.pieza))
    .map((par) => par.fila)

  const avisos: AvisoDeInicio[] = piezas.flatMap((pieza) => avisoDeError(pieza) ?? [])
  const reciente = piezas
    .filter(
      (pieza) => pieza.estado === "publicado" && ahora - Date.parse(pieza.actualizadaEn) <= DIAS_DE_CELEBRACION_MS,
    )
    .sort((a, b) => Date.parse(b.actualizadaEn) - Date.parse(a.actualizadaEn))[0]
  if (reciente) avisos.push(avisoDePublicacion(reciente, ahora, zona))

  return {
    semana: `Semana del ${semanaDe(ahora, zona)}`,
    resumen: resumenDeFirmas(firma.length),
    firma,
    camino,
    avisos,
  }
}
