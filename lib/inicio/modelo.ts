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
  /** Set when Coni has something to do on its screen. */
  href?: string
}

export interface FilaPorSubir {
  id: string
  titulo: string
  pilar: Pilar | null
  meta: string
  href: string
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
  /** The answer of the screen («2 cosas esperan tu firma») and, apart, how long it takes («unos 6 min»). */
  titulo: string
  tiempo: string | null
  firma: FilaDeFirma[]
  /** Reels whose time came while Instagram was not connected: she uploads them herself. */
  porSubir: FilaPorSubir[]
  camino: FilaEnCamino[]
  avisos: AvisoDeInicio[]
}

const MINUTOS_POR_FIRMA = 3
const DIAS_DE_CELEBRACION_MS = 2 * 24 * 60 * 60 * 1000
const EXPLICACION_GENERICA = "Algo no salió como esperábamos con esta pieza."

function tituloDeFirmas(cantidad: number): string {
  if (cantidad === 0) return "Esta semana está al día"
  return cantidad === 1 ? "Una cosa espera tu firma" : `${cantidad} cosas esperan tu firma`
}

function tiempoDeFirmas(cantidad: number): string | null {
  return cantidad === 0 ? null : `unos ${cantidad * MINUTOS_POR_FIRMA} min`
}

function resumenDeFirmas(cantidad: number): string {
  const tiempo = tiempoDeFirmas(cantidad)
  return tiempo === null ? tituloDeFirmas(cantidad) : `${tituloDeFirmas(cantidad)} · ${tiempo}`
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
    case "guion_aprobado":
      // With a reason on it (a failed voice) it is a notice instead.
      return pieza.explicacion === null
        ? { ...base, estado: "Guion aprobado · falta grabar", ocupada: false, href: `/guion/${pieza.id}` }
        : null
    case "grabando_voz":
      return { ...base, estado: "Grabando la voz · unos segundos", ocupada: true }
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
    case "guion_aprobado":
      return pieza.estado !== "error_produccion" && pieza.explicacion === null
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

function cuandoSePublico(pieza: PiezaDeInicio, ahora: number, zona: string): string {
  const hora = etiquetaDeFecha(pieza.actualizadaEn, zona, "corta").split(" · ")[1] ?? ""
  return diaLocal(Date.parse(pieza.actualizadaEn), zona) === diaLocal(ahora, zona)
    ? `hoy a las ${hora}`
    : `el ${etiquetaDeFecha(pieza.actualizadaEn, zona, "corta").replace(" · ", " a las ")}`
}

function avisoDePublicacion(pieza: PiezaDeInicio, ahora: number, zona: string): AvisoDeInicio {
  return {
    tipo: "ok",
    titulo: `${pieza.titulo} se publicó ${cuandoSePublico(pieza, ahora, zona)}`,
    texto: "La etiqueta de IA quedó puesta en Instagram.",
    ...(pieza.permalink ? { accion: { etiqueta: "Ver en Instagram", href: pieza.permalink, externo: true } } : {}),
  }
}

function avisoDeSubidaAMano(pieza: PiezaDeInicio, ahora: number, zona: string): AvisoDeInicio {
  return {
    tipo: "ok",
    titulo: `${pieza.titulo}: subido a mano ${cuandoSePublico(pieza, ahora, zona)}`,
    texto: "Quedó anotado como subido por ti, con la etiqueta de IA.",
    ...(pieza.permalink ? { accion: { etiqueta: "Ver en Instagram", href: pieza.permalink, externo: true } } : {}),
  }
}

function filaPorSubir(pieza: PiezaDeInicio, zona: string): FilaPorSubir {
  return {
    id: pieza.id,
    titulo: pieza.titulo,
    pilar: pieza.pilar,
    meta: `Para subir${pieza.publicarEn ? ` · ${etiquetaDeFecha(pieza.publicarEn, zona, "corta")}` : ""}`,
    href: `/video/${pieza.id}`,
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
  const recienteAMano = piezas
    .filter(
      (pieza) =>
        pieza.estado === "publicado_a_mano" && ahora - Date.parse(pieza.actualizadaEn) <= DIAS_DE_CELEBRACION_MS,
    )
    .sort((a, b) => Date.parse(b.actualizadaEn) - Date.parse(a.actualizadaEn))[0]
  if (recienteAMano) avisos.push(avisoDeSubidaAMano(recienteAMano, ahora, zona))
  const porSubir = piezas
    .filter((pieza) => pieza.estado === "para_subir_a_mano")
    .sort((a, b) => Date.parse(a.publicarEn ?? a.actualizadaEn) - Date.parse(b.publicarEn ?? b.actualizadaEn))
    .map((pieza) => filaPorSubir(pieza, zona))

  return {
    semana: `Semana del ${semanaDe(ahora, zona)}`,
    resumen: resumenDeFirmas(firma.length),
    titulo: tituloDeFirmas(firma.length),
    tiempo: tiempoDeFirmas(firma.length),
    firma,
    porSubir,
    camino,
    avisos,
  }
}
