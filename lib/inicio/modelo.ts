import { canonicos, type Destino, nombreDeDestinos } from "@/lib/dominio/destinos"
import type { Estado } from "@/lib/dominio/estados"
import { estimarSegundos } from "@/lib/dominio/estimaciones"
import { diaLocal, etiquetaDeFecha, semanaDe } from "@/lib/dominio/fechas"

export interface PiezaDeInicio {
  id: string
  titulo: string
  estado: Estado
  explicacion: string | null
  guion: string | null
  pilar: string | null
  publicarEn: string | null
  permalink: string | null
  actualizadaEn: string
  /** Where the reel was approved to go. */
  destinos: readonly Destino[]
  /** What still waits for her to upload; empty when no row says (read as every destination). */
  pendientes: readonly Destino[]
}

export interface FilaDeFirma {
  id: string
  titulo: string
  pilar: string | null
  meta: string
  href: string
  /** What signing it takes, for the card of the first one (decision 8, step 6). */
  instruccion: string
}

/** A piece whose voice is being made: it cannot be signed yet (decision 8, step 6). */
export interface FilaEnPreparacion {
  id: string
  titulo: string
  pilar: string | null
  meta: string
}

export interface FilaEnCamino {
  id: string
  titulo: string
  pilar: string | null
  estado: string
  /** Being worked on right now: the row shows the working dot. */
  ocupada: boolean
  /** The piece's screen: the work in progress and the undo window, or the scheduled date. */
  href: string
}

export interface FilaPorSubir {
  id: string
  titulo: string
  pilar: string | null
  meta: string
  href: string
}

export interface AvisoDeInicio {
  tipo: "error" | "ok"
  /** Error: the piece's title. Ok: the sentence of the news. */
  titulo: string
  texto: string
  /** Error notices: the cause in one sentence, the large block's title (decision 8, step 3). */
  causa?: string
  /** Error notices: the piece's pillar, for its row when it is not the first one. */
  pilar?: string | null
  accion?: { etiqueta: string; href: string; externo?: boolean }
}

export interface Inicio {
  semana: string
  /** The answer of the screen: what needs her attention, or what waits for her signature. */
  titulo: string
  /** One line under the title: "Después, 2 esperan tu firma." or "1 en preparación · unos 6 min". */
  linea: string | null
  /** Failures, the most urgent first: the first is the large block, the rest are rows. */
  atencion: AvisoDeInicio[]
  /** Good news: a recent publication or a manual upload. */
  avisos: AvisoDeInicio[]
  firma: FilaDeFirma[]
  enPreparacion: FilaEnPreparacion[]
  /** Reels whose time came and have a destination she uploads herself. */
  porSubir: FilaPorSubir[]
  /** "Para subir a Instagram y LinkedIn": every network that waits, or just "Para subir". */
  porSubirTitulo: string
  camino: FilaEnCamino[]
}

const MINUTOS_POR_FIRMA = 3
const DIAS_DE_CELEBRACION_MS = 2 * 24 * 60 * 60 * 1000
const EXPLICACION_GENERICA = "Algo no salió como esperábamos con esta pieza."

/** Only what she can sign now counts: a voice being made waits apart (critique v3, P2). */
const ESPERAN_FIRMA: readonly Estado[] = ["guion_por_aprobar", "video_por_aprobar"]

/** The order of the failures (decision 8, step 3): what is already late first. */
const ORDEN_DE_ATENCION: readonly Estado[] = [
  "error_publicacion",
  "error_produccion",
  "guion_por_aprobar",
  "guion_en_proceso",
  "video_por_aprobar",
]

function tituloDeInicio(atencion: number, firmas: number): string {
  if (atencion > 0) return atencion === 1 ? "Una cosa necesita tu atención" : `${atencion} cosas necesitan tu atención`
  if (firmas === 0) return "Esta semana está al día"
  return firmas === 1 ? "Una espera tu firma" : `${firmas} esperan tu firma`
}

function lineaDeInicio(atencion: number, firmas: number, enPreparacion: number): string | null {
  if (atencion > 0) {
    if (firmas === 0) return null
    return firmas === 1 ? "Después, una espera tu firma." : `Después, ${firmas} esperan tu firma.`
  }
  const partes = [
    enPreparacion > 0 ? `${enPreparacion} en preparación` : null,
    firmas > 0 ? `unos ${firmas * MINUTOS_POR_FIRMA} min` : null,
  ].filter((parte): parte is string => parte !== null)
  return partes.length > 0 ? partes.join(" · ") : null
}

function segundosDe(pieza: PiezaDeInicio): number {
  return Math.round(estimarSegundos(pieza.guion ?? ""))
}

function filaDeFirma(pieza: PiezaDeInicio): FilaDeFirma {
  const base = { id: pieza.id, titulo: pieza.titulo, pilar: pieza.pilar }
  if (pieza.estado === "video_por_aprobar") {
    return {
      ...base,
      meta: `Video · ${segundosDe(pieza)} s`,
      href: `/video/${pieza.id}`,
      instruccion: "Mira el video, revisa el texto y elige la fecha.",
    }
  }
  return {
    ...base,
    meta: `Guion · ${segundosDe(pieza)} s`,
    href: `/guion/${pieza.id}`,
    instruccion: "Escucha tu voz y revisa el guion.",
  }
}

function filaEnPreparacion(pieza: PiezaDeInicio): FilaEnPreparacion {
  return { id: pieza.id, titulo: pieza.titulo, pilar: pieza.pilar, meta: "Preparando la voz" }
}

function filaEnCamino(pieza: PiezaDeInicio, zona: string): FilaEnCamino | null {
  const base = { id: pieza.id, titulo: pieza.titulo, pilar: pieza.pilar }
  switch (pieza.estado) {
    case "guion_en_proceso":
      // With a reason on it, the piece is a failure (it is not being written), not "on its way".
      return pieza.explicacion === null
        ? { ...base, estado: "Escribiendo el guion · te aviso", ocupada: true, href: `/guion/${pieza.id}` }
        : null
    case "en_render":
    case "subtitulando":
      return { ...base, estado: "Grabando · unos 5 min · te aviso", ocupada: true, href: `/guion/${pieza.id}` }
    case "programado":
      return {
        ...base,
        estado: pieza.publicarEn ? `Programado · ${etiquetaDeFecha(pieza.publicarEn, zona, "corta")}` : "Programado",
        ocupada: false,
        href: `/video/${pieza.id}`,
      }
    default:
      return null
  }
}

/** What she reads under a failure whose only text is a provider's. It names no button: each failure has its own. */
export const TEXTO_ENTRA_A_LA_PIEZA = "Entra a la pieza para ver qué puedes hacer."

function avisoDeError(pieza: PiezaDeInicio): AvisoDeInicio | null {
  const base = {
    tipo: "error" as const,
    titulo: pieza.titulo,
    texto: pieza.explicacion ?? EXPLICACION_GENERICA,
    pilar: pieza.pilar,
  }
  const revisar = (ruta: "guion" | "video") => ({ etiqueta: "Revisar", href: `/${ruta}/${pieza.id}` })
  switch (pieza.estado) {
    case "error_publicacion":
      return { ...base, causa: "No pude publicar.", accion: revisar("video") }
    case "error_produccion":
      return { ...base, causa: "No pude terminar el video.", accion: revisar("guion") }
    case "guion_por_aprobar":
      // A phrase HeyGen refused or a voice that could not be made: the text says which, the screen has the way out.
      return pieza.explicacion === null
        ? null
        : { ...base, causa: "Tu guion necesita atención.", accion: revisar("guion") }
    case "guion_en_proceso":
      return pieza.explicacion === null
        ? null
        : { ...base, causa: "No pude escribir el guion.", accion: revisar("guion") }
    case "video_por_aprobar":
      return pieza.explicacion === null
        ? null
        : { ...base, causa: "Elige otra fecha.", accion: { etiqueta: "Elegir otra fecha", href: `/video/${pieza.id}` } }
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

function textoDeSubidaAMano(destinos: readonly Destino[]): string {
  const conInstagram = destinos.includes("instagram")
  const conLinkedin = destinos.includes("linkedin")
  if (conInstagram && conLinkedin) {
    return "Quedó anotado como subido por ti, con la etiqueta de IA en Instagram y el texto en LinkedIn."
  }
  return conLinkedin
    ? "Quedó anotado como subido por ti a LinkedIn."
    : "Quedó anotado como subido por ti, con la etiqueta de IA."
}

function avisoDeSubidaAMano(pieza: PiezaDeInicio, ahora: number, zona: string): AvisoDeInicio {
  // `permalink` is the Instagram link: LinkedIn keeps its own on the piece's screen.
  const conLink = pieza.permalink && pieza.destinos.includes("instagram")
  return {
    tipo: "ok",
    titulo: `${pieza.titulo}: subido a mano ${cuandoSePublico(pieza, ahora, zona)}`,
    texto: textoDeSubidaAMano(pieza.destinos),
    ...(conLink && pieza.permalink
      ? { accion: { etiqueta: "Ver en Instagram", href: pieza.permalink, externo: true } }
      : {}),
  }
}

/** What waits for her to upload; a piece whose rows say nothing waits for every destination. */
function esperando(pieza: PiezaDeInicio): Destino[] {
  return canonicos(pieza.pendientes.length > 0 ? pieza.pendientes : pieza.destinos)
}

function filaPorSubir(pieza: PiezaDeInicio, zona: string): FilaPorSubir {
  return {
    id: pieza.id,
    titulo: pieza.titulo,
    pilar: pieza.pilar,
    meta: `Para subir a ${nombreDeDestinos(esperando(pieza))}${pieza.publicarEn ? ` · ${etiquetaDeFecha(pieza.publicarEn, zona, "corta")}` : ""}`,
    href: `/video/${pieza.id}`,
  }
}

/** What is being worked on comes first (it has no date yet); what is scheduled follows, soonest first. */
function porHoraDePublicacion(a: PiezaDeInicio, b: PiezaDeInicio): number {
  if (a.publicarEn === null || b.publicarEn === null)
    return Number(a.publicarEn !== null) - Number(b.publicarEn !== null)
  return Date.parse(a.publicarEn) - Date.parse(b.publicarEn)
}

function reciente(piezas: readonly PiezaDeInicio[], estado: Estado, ahora: number): PiezaDeInicio | undefined {
  return piezas
    .filter((pieza) => pieza.estado === estado && ahora - Date.parse(pieza.actualizadaEn) <= DIAS_DE_CELEBRACION_MS)
    .sort((a, b) => Date.parse(b.actualizadaEn) - Date.parse(a.actualizadaEn))[0]
}

/** What Inicio shows, from the pieces and the clock: no database, no rendering (decision 8). */
export function construirInicio(entrada: { piezas: readonly PiezaDeInicio[]; ahora: number; zona: string }): Inicio {
  const { piezas, ahora, zona } = entrada
  const enPreparacion = piezas.filter((pieza) => pieza.estado === "grabando_voz").map(filaEnPreparacion)
  const camino = piezas
    .map((pieza) => ({ pieza, fila: filaEnCamino(pieza, zona) }))
    .filter((par): par is { pieza: PiezaDeInicio; fila: FilaEnCamino } => par.fila !== null)
    .sort((a, b) => porHoraDePublicacion(a.pieza, b.pieza))
    .map((par) => par.fila)
  const conAviso = piezas
    .map((pieza) => ({ pieza, aviso: avisoDeError(pieza) }))
    .filter((par): par is { pieza: PiezaDeInicio; aviso: AvisoDeInicio } => par.aviso !== null)
    .sort((a, b) => ORDEN_DE_ATENCION.indexOf(a.pieza.estado) - ORDEN_DE_ATENCION.indexOf(b.pieza.estado))
  const atencion = conAviso.map((par) => par.aviso)
  // A piece under attention is reached from its notice: counting it again would tell her a second one waits.
  const enAtencion = new Set(conAviso.map((par) => par.pieza.id))
  const firma = piezas
    .filter((pieza) => ESPERAN_FIRMA.includes(pieza.estado) && !enAtencion.has(pieza.id))
    .map(filaDeFirma)

  const avisos: AvisoDeInicio[] = []
  const publicada = reciente(piezas, "publicado", ahora)
  if (publicada) avisos.push(avisoDePublicacion(publicada, ahora, zona))
  const subida = reciente(piezas, "publicado_a_mano", ahora)
  if (subida) avisos.push(avisoDeSubidaAMano(subida, ahora, zona))

  const paraSubir = piezas.filter((pieza) => pieza.estado === "para_subir_a_mano")
  const redes = canonicos(paraSubir.flatMap(esperando))
  const porSubir = paraSubir
    .sort((a, b) => Date.parse(a.publicarEn ?? a.actualizadaEn) - Date.parse(b.publicarEn ?? b.actualizadaEn))
    .map((pieza) => filaPorSubir(pieza, zona))

  return {
    semana: `Semana del ${semanaDe(ahora, zona)}`,
    titulo: tituloDeInicio(atencion.length, firma.length),
    linea: lineaDeInicio(atencion.length, firma.length, enPreparacion.length),
    atencion,
    avisos,
    firma,
    enPreparacion,
    porSubir,
    porSubirTitulo: redes.length > 0 ? `Para subir a ${nombreDeDestinos(redes)}` : "Para subir",
    camino,
  }
}
