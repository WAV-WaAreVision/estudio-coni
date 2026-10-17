import { canonicos, type Destino, nombreDeDestino, nombreDeDestinos } from "@/lib/dominio/destinos"
import type { Estado } from "@/lib/dominio/estados"
import { diaLocal, etiquetaDeFecha, type Horario, instanteLocal, proponerFechas, semanaDe } from "@/lib/dominio/fechas"
import { limitesDelMes, lunesDeLaSemana, sumarDias } from "@/lib/dominio/metricas"
import { type CatalogoDePilares, type PilarVisible, pilarVisible } from "@/lib/dominio/pilares"

// The Calendario screen as data (Mes, Agenda, Ritmo). Everything Coni reads is decided here.

export interface PiezaDeCalendario {
  id: string
  titulo: string
  estado: Estado
  /** The slug of its idea's pillar. */
  pilar: string | null
  /** The approved publishing time; null until the video is approved. */
  publicarEn: string | null
  creadaEn: string
  /** Where the reel was approved to go. */
  destinos: readonly Destino[]
  /** What still waits for her to upload; empty when no row says (read as every destination). */
  pendientes: readonly Destino[]
}

/** A piece with its pillar already read from the catalog. */
type PiezaConPilar = PiezaDeCalendario & { visible: PilarVisible | null }

export type TonoDeEstado = "ok" | "aviso" | "error" | "neutro"

export interface Ocupante {
  piezaId: string
  titulo: string
  pilar: PilarVisible | null
  estado: string
  tono: TonoDeEstado
  /** Where the piece can be opened, when there is anything for her to do there. */
  href: string | null
  /** Placed in the slot as a proposal: it has no approved time yet. */
  provisional: boolean
  /** "Instagram · LinkedIn": where it goes. Null for a proposal, which has not been approved for anywhere. */
  destinos: string | null
}

export interface Hueco {
  /** ISO instant. */
  instante: string
  /** "Jueves 15". */
  dia: string
  /** "19:00". */
  hora: string
  /** Null is a free slot: "Libre · elige una idea". */
  ocupante: Ocupante | null
}

export interface CeldaDeMes {
  /** Day of the month; null for the blanks before the first. */
  dia: number | null
  hoy: boolean
  /** The pillar slug of each publication of the day. */
  puntos: (string | null)[]
  /** For a screen reader: the weekday and, when there are publications, which themes. */
  descripcion: string
}

export interface ProximaPublicacion {
  piezaId: string
  titulo: string
  pilar: PilarVisible | null
  fecha: string
  /** The networks she still has to upload it to: "Instagram y LinkedIn". */
  pendientes: string
}

export type CeldaDeRitmo =
  | { tipo: "llena"; pilar: PilarVisible | null; titulo: string }
  /** `falta`: the slot was expected to have a reel (it is past and came after her first one) and has none. */
  | { tipo: "libre"; falta: boolean }

export interface ModeloDeCalendario {
  mes: {
    nombre: string
    celdas: CeldaDeMes[]
    sinPublicaciones: boolean
    proximos: ProximaPublicacion[]
    /** Approved for a time that came while Instagram was not connected: she has to upload them. Oldest first. */
    porSubir: ProximaPublicacion[]
  }
  agenda: { semanas: { titulo: string; huecos: Hueco[]; libresMas: string | null }[] }
  ritmo: {
    vacio: boolean
    columnas: string[]
    semanas: { etiqueta: string; celdas: CeldaDeRitmo[] }[]
    resumen: string
    /** Before her first publication (decision 22): her schedule in words, shown instead of the count. */
    antesDeEmpezar: string | null
    sugerencia: string | null
  }
}

const SEMANAS_DE_AGENDA = 4
/** Decision 22 (amendment A4): the Agenda lists the next three free slots; the rest are counted per week. */
const LIBRES_A_LA_VISTA = 3
const SEMANAS_DE_RITMO = 4
/** The platform proposes slots at least this far ahead (design, "Calendario"). */
const ANTELACION_MS = 2 * 60 * 60 * 1000
/** A scheduled piece whose time just passed is about to go out: it stays on the agenda for this long. */
const MARGEN_DE_PUBLICACION_MS = 60 * 60 * 1000
const PROXIMOS = 3
const SEMANAS_PARA_OPINAR = 3
const CELDAS_PARA_OPINAR = 3
const PARTE_LIBRE_PARA_OPINAR = 0.75

const DIA_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const DIA_LARGO = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

/** "martes, jueves y sábado". */
function diasEnPalabras(dias: readonly number[]): string {
  const nombres = [...dias].sort((a, b) => a - b).map((dia) => DIA_LARGO[dia - 1] ?? "")
  if (nombres.length <= 1) return nombres.join("")
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`
}
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function partesDeDia(dia: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, diaDelMes] = dia.split("-").map(Number)
  return { anio: anio ?? 0, mes: mes ?? 0, dia: diaDelMes ?? 0 }
}

function diaIsoDe(dia: string): number {
  const p = partesDeDia(dia)
  const js = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay()
  return js === 0 ? 7 : js
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const ESTADOS_FECHADOS: readonly Estado[] = ["publicado", "programado", "para_subir_a_mano", "publicado_a_mano"]

function esFechada(pieza: PiezaConPilar): pieza is PiezaConPilar & { publicarEn: string } {
  return ESTADOS_FECHADOS.includes(pieza.estado) && pieza.publicarEn !== null
}

/** What a screen reader hears after the theme for the pieces that Coni handles by hand. */
const NOTA_DE_MANO: Partial<Record<Estado, string>> = {
  para_subir_a_mano: ", para subir",
  publicado_a_mano: ", subido a mano",
}

function esperando(pieza: PiezaConPilar): Destino[] {
  return canonicos(pieza.pendientes.length > 0 ? pieza.pendientes : pieza.destinos)
}

/** Said only when LinkedIn is among the destinations: an Instagram-only day reads as it always did. */
function enLinkedin(pieza: PiezaConPilar): string {
  return pieza.destinos.includes("linkedin") ? `, en ${nombreDeDestinos(pieza.destinos)}` : ""
}

function nombreDeTema(pilar: PilarVisible | null): string {
  return pilar ? pilar.nombre : "sin tema"
}

function instanteDeHueco(dia: string, horaTexto: string, zona: string): number {
  const p = partesDeDia(dia)
  const reloj = /^(\d{1,2}):(\d{2})/.exec(horaTexto)
  return instanteLocal({ ...p, hora: Number(reloj?.[1] ?? 0), minuto: Number(reloj?.[2] ?? 0) }, zona)
}

// --- Mes ---------------------------------------------------------------------------------------------------------

function construirMes(piezas: readonly PiezaConPilar[], ahora: number, zona: string): ModeloDeCalendario["mes"] {
  const mes = limitesDelMes(ahora, zona)
  const primero = `${mes.clave}-01`
  const { anio, mes: numeroDeMes } = partesDeDia(primero)
  const diasDelMes = new Date(Date.UTC(anio, numeroDeMes, 0)).getUTCDate()
  const hoy = diaLocal(ahora, zona)
  const fechadas = piezas.filter(esFechada)

  const celdas: CeldaDeMes[] = Array.from({ length: diaIsoDe(primero) - 1 }, () => ({
    dia: null,
    hoy: false,
    puntos: [],
    descripcion: "",
  }))
  for (let dia = 1; dia <= diasDelMes; dia += 1) {
    const texto = `${mes.clave}-${String(dia).padStart(2, "0")}`
    const delDia = fechadas.filter((pieza) => diaLocal(Date.parse(pieza.publicarEn), zona) === texto)
    const nombre = `${DIA_LARGO[diaIsoDe(texto) - 1]} ${dia}`
    celdas.push({
      dia,
      hoy: texto === hoy,
      puntos: delDia.map((pieza) => pieza.pilar),
      descripcion:
        delDia.length > 0
          ? `${nombre}: ${delDia.map((pieza) => `${nombreDeTema(pieza.visible)}${NOTA_DE_MANO[pieza.estado] ?? ""}${enLinkedin(pieza)}`).join(", ")}`
          : nombre,
    })
  }

  const delMes = fechadas.filter((pieza) => {
    const instante = Date.parse(pieza.publicarEn)
    return instante >= mes.desde && instante < mes.hasta
  })
  const aLaLista = (pieza: PiezaConPilar & { publicarEn: string }): ProximaPublicacion => ({
    piezaId: pieza.id,
    titulo: pieza.titulo,
    pilar: pieza.visible,
    fecha: etiquetaDeFecha(pieza.publicarEn, zona, "corta"),
    pendientes: nombreDeDestinos(esperando(pieza)),
  })
  return {
    nombre: mes.nombre,
    celdas,
    sinPublicaciones: delMes.length === 0,
    porSubir: fechadas
      .filter((pieza) => pieza.estado === "para_subir_a_mano")
      .sort((a, b) => Date.parse(a.publicarEn) - Date.parse(b.publicarEn))
      .map(aLaLista),
    proximos: fechadas
      .filter((pieza) => pieza.estado === "programado" && Date.parse(pieza.publicarEn) >= ahora)
      .sort((a, b) => Date.parse(a.publicarEn) - Date.parse(b.publicarEn))
      .slice(0, PROXIMOS)
      .map((pieza) => ({
        piezaId: pieza.id,
        titulo: pieza.titulo,
        pilar: pieza.visible,
        fecha: etiquetaDeFecha(pieza.publicarEn, zona, "corta"),
        pendientes: nombreDeDestinos(esperando(pieza)),
      })),
  }
}

// --- Agenda ------------------------------------------------------------------------------------------------------

/** What the piece is doing, in her words, and whether there is something for her to open. */
function ocupanteDe(pieza: PiezaConPilar, provisional: boolean): Ocupante {
  const base = {
    piezaId: pieza.id,
    titulo: pieza.titulo,
    pilar: pieza.visible,
    provisional,
    destinos: provisional ? null : canonicos(pieza.destinos).map(nombreDeDestino).join(" · "),
  }
  switch (pieza.estado) {
    case "programado":
      return { ...base, estado: "Programado", tono: "ok", href: `/video/${pieza.id}` }
    case "para_subir_a_mano":
      return {
        ...base,
        estado: `Para subir a ${nombreDeDestinos(esperando(pieza))}`,
        tono: "aviso",
        href: `/video/${pieza.id}`,
      }
    case "publicado_a_mano":
      return { ...base, estado: "Subido a mano", tono: "ok", href: `/video/${pieza.id}` }
    case "video_por_aprobar":
      return { ...base, estado: "Falta tu firma: video y fecha", tono: "aviso", href: `/video/${pieza.id}` }
    case "guion_por_aprobar":
      return { ...base, estado: "Falta tu firma: guion", tono: "aviso", href: `/guion/${pieza.id}` }
    // Only a piece the old app left there (design 2026-10-15): the deploy moves those back to gate 1.
    case "guion_aprobado":
      return { ...base, estado: "Guion aprobado · falta grabar", tono: "aviso", href: `/guion/${pieza.id}` }
    case "grabando_voz":
      return { ...base, estado: "Preparando la voz", tono: "neutro", href: null }
    case "en_render":
    case "subtitulando":
      return { ...base, estado: "Grabando", tono: "neutro", href: null }
    case "error_produccion":
      return { ...base, estado: "Algo falló al grabar", tono: "error", href: `/guion/${pieza.id}` }
    default:
      return { ...base, estado: "Guion en preparación", tono: "neutro", href: null }
  }
}

/** The pieces without a date, the ones closest to publishing first. */
const ORDEN_EN_CAMINO: Partial<Record<Estado, number>> = {
  video_por_aprobar: 0,
  subtitulando: 1,
  en_render: 1,
  grabando_voz: 1,
  error_produccion: 2,
  guion_aprobado: 2,
  guion_por_aprobar: 3,
  guion_en_proceso: 4,
}

function construirAgenda(
  piezas: readonly PiezaConPilar[],
  horario: Horario,
  ahora: number,
): ModeloDeCalendario["agenda"] {
  const { zona } = horario
  const lunes = lunesDeLaSemana(ahora, zona)
  const fin = instanteDeHueco(sumarDias(lunes, 7 * SEMANAS_DE_AGENDA), "00:00", zona)
  const programadas = piezas.filter(
    (pieza): pieza is PiezaConPilar & { publicarEn: string } =>
      (pieza.estado === "programado" || pieza.estado === "para_subir_a_mano" || pieza.estado === "publicado_a_mano") &&
      pieza.publicarEn !== null,
  )
  const programadasPorInstante = new Map(programadas.map((pieza) => [Date.parse(pieza.publicarEn), pieza]))

  const horarios = proponerFechas({
    ahora,
    horario,
    ocupadas: [],
    cuantas: horario.dias.length * 7 * SEMANAS_DE_AGENDA,
  })
    .map((instante) => Date.parse(instante))
    .filter((instante) => instante < fin)
  const instantes = new Set(horarios)
  // An approved time that no longer matches the schedule keeps its place: changing the settings never moves it.
  const inicioDeLaSemana = instanteDeHueco(lunes, "00:00", zona)
  for (const pieza of programadas) {
    const instante = Date.parse(pieza.publicarEn)
    // What she handles by hand stays in the week it belongs to: its time passed and it is still hers to do or to see.
    const cuenta =
      pieza.estado === "programado" ? instante >= ahora - MARGEN_DE_PUBLICACION_MS : instante >= inicioDeLaSemana
    if (cuenta && instante < fin) instantes.add(instante)
  }

  const huecos: Hueco[] = [...instantes]
    .sort((a, b) => a - b)
    .flatMap((instante) => {
      const programada = programadasPorInstante.get(instante)
      if (!programada && instante < ahora + ANTELACION_MS) return []
      const texto = etiquetaDeFecha(new Date(instante).toISOString(), zona, "corta")
      const [dia = "", hora = ""] = texto.split(" · ")
      return [
        {
          instante: new Date(instante).toISOString(),
          dia: mayuscula(dia),
          hora,
          ocupante: programada ? ocupanteDe(programada, false) : null,
        },
      ]
    })

  const enCamino = piezas
    .filter((pieza) => ORDEN_EN_CAMINO[pieza.estado] !== undefined)
    .sort(
      (a, b) =>
        (ORDEN_EN_CAMINO[a.estado] ?? 9) - (ORDEN_EN_CAMINO[b.estado] ?? 9) ||
        Date.parse(a.creadaEn) - Date.parse(b.creadaEn),
    )
  const libres = huecos.filter((hueco) => hueco.ocupante === null)
  enCamino.forEach((pieza, i) => {
    const hueco = libres[i]
    if (hueco) hueco.ocupante = ocupanteDe(pieza, true)
  })

  let libresVistos = 0
  const visible = new Set(
    huecos.filter((hueco) => {
      if (hueco.ocupante !== null) return true
      libresVistos += 1
      return libresVistos <= LIBRES_A_LA_VISTA
    }),
  )

  return {
    semanas: Array.from({ length: SEMANAS_DE_AGENDA }, (_, i) => {
      const inicio = sumarDias(lunes, 7 * i)
      const deLaSemana = huecos.filter((hueco) => lunesDeLaSemana(Date.parse(hueco.instante), zona) === inicio)
      const ocultos = deLaSemana.filter((hueco) => !visible.has(hueco)).length
      return {
        titulo: `Semana del ${semanaDe(instanteDeHueco(inicio, "12:00", zona), zona)}`,
        huecos: deLaSemana.filter((hueco) => visible.has(hueco)),
        libresMas: ocultos === 0 ? null : ocultos === 1 ? "y 1 libre más" : `y ${ocultos} libres más`,
      }
    }),
  }
}

// --- Ritmo -------------------------------------------------------------------------------------------------------

function construirRitmo(
  piezas: readonly PiezaConPilar[],
  horario: Horario,
  ahora: number,
  primeraPublicacion: string | null | undefined,
  yaPublico: boolean,
): ModeloDeCalendario["ritmo"] {
  const { zona } = horario
  const dias = [...horario.dias].sort((a, b) => a - b)
  const fechadas = piezas.filter(esFechada)
  const lunesActual = lunesDeLaSemana(ahora, zona)
  const lunes = Array.from({ length: SEMANAS_DE_RITMO }, (_, i) =>
    sumarDias(lunesActual, -7 * (SEMANAS_DE_RITMO - 1 - i)),
  )

  // Her real first reel when the page knows it; otherwise the first one in the pieces it was given.
  const delasPiezas = fechadas.map((pieza) => Date.parse(pieza.publicarEn)).sort((a, b) => a - b)[0]
  const dada = primeraPublicacion ? Date.parse(primeraPublicacion) : Number.NaN
  const primera = Number.isNaN(dada) ? delasPiezas : Math.min(dada, delasPiezas ?? dada)
  const lunesDeLaPrimera = primera === undefined ? null : lunesDeLaSemana(primera, zona)

  const semanas = lunes.map((inicio) => ({
    inicio,
    celdas: dias.map((diaIso): CeldaDeRitmo => {
      const dia = sumarDias(inicio, diaIso - 1)
      const pieza = fechadas.find((candidata) => diaLocal(Date.parse(candidata.publicarEn), zona) === dia)
      if (pieza) return { tipo: "llena", pilar: pieza.visible, titulo: pieza.titulo }
      const instante = instanteDeHueco(dia, horario.hora, zona)
      return { tipo: "libre", falta: instante < ahora && primera !== undefined && instante >= primera }
    }),
  }))

  const usados = semanas.reduce((suma, s) => suma + s.celdas.filter((c) => c.tipo === "llena").length, 0)
  // What was expected so far: the slots with a reel and the free ones that already passed (after her first reel).
  const esperados = semanas.reduce((suma, s) => suma + s.celdas.filter((c) => c.tipo === "llena" || c.falta).length, 0)
  const espacios = dias.length
  const etiqueta = (inicio: string) => `${partesDeDia(inicio).dia} ${MES_CORTO[partesDeDia(inicio).mes - 1]}`

  return {
    vacio: fechadas.length === 0,
    columnas: dias.map((d) => DIA_CORTO[d - 1] ?? ""),
    semanas: semanas.map((s) => ({ etiqueta: etiqueta(s.inicio), celdas: s.celdas })),
    resumen: `Tu horario tiene ${espacios} ${espacios === 1 ? "espacio" : "espacios"} por semana. En estas ${SEMANAS_DE_RITMO} semanas van ${usados} de ${esperados}.`,
    antesDeEmpezar: yaPublico
      ? null
      : `Todavía no publicas. Tu ritmo es ${diasEnPalabras(dias)} a las ${horario.hora.slice(0, 5)}. Cuando salga la primera pieza, aquí verás si vas al día.`,
    sugerencia: yaPublico ? sugerirCambio({ semanas, dias, lunesDeLaPrimera }) : null,
  }
}

/**
 * A day of the schedule that stays free almost every week. Only weeks since her first reel count (before it nothing
 * was expected), only slots already past (a slot ahead is not a miss), and with three weeks or fewer of history it
 * says nothing (design, Pass 2).
 */
function sugerirCambio(entrada: {
  semanas: { inicio: string; celdas: CeldaDeRitmo[] }[]
  dias: number[]
  lunesDeLaPrimera: string | null
}): string | null {
  const { semanas, dias, lunesDeLaPrimera } = entrada
  if (lunesDeLaPrimera === null) return null
  const evaluadas = semanas.filter((s) => s.inicio >= lunesDeLaPrimera)
  if (evaluadas.length < SEMANAS_PARA_OPINAR) return null

  let peor: { columna: number; parte: number; faltas: number } | null = null
  for (const columna of dias.keys()) {
    const pasadas = evaluadas.flatMap((s) => {
      const celda = s.celdas[columna]
      return !celda || (celda.tipo === "libre" && !celda.falta) ? [] : [celda]
    })
    if (pasadas.length < CELDAS_PARA_OPINAR) continue
    const faltas = pasadas.filter((celda) => celda.tipo === "libre").length
    const parte = faltas / pasadas.length
    if (parte < PARTE_LIBRE_PARA_OPINAR) continue
    if (!peor || parte > peor.parte || (parte === peor.parte && faltas > peor.faltas)) peor = { columna, parte, faltas }
  }
  const nombre = peor ? DIA_LARGO[(dias[peor.columna] ?? 1) - 1] : undefined
  if (!nombre) return null
  const plural = nombre.endsWith("s") ? nombre : `${nombre}s`
  return `Los ${plural} casi siempre quedan libres. ¿Cambiamos el horario o publicamos menos días a la semana?`
}

export function construirCalendario(entrada: {
  piezas: readonly PiezaDeCalendario[]
  horario: Horario
  ahora: number
  /** When her first reel went out or was scheduled for, if the pieces given do not go back that far. */
  primeraPublicacion?: string | null
  /** Any network row out or uploaded by her (decision 15); false before her first publication. */
  yaPublico: boolean
  pilares: CatalogoDePilares
}): ModeloDeCalendario {
  const { horario, ahora, primeraPublicacion } = entrada
  const piezas = entrada.piezas.map((pieza) => ({ ...pieza, visible: pilarVisible(entrada.pilares, pieza.pilar) }))
  return {
    mes: construirMes(piezas, ahora, horario.zona),
    agenda: construirAgenda(piezas, horario, ahora),
    ritmo: construirRitmo(piezas, horario, ahora, primeraPublicacion, entrada.yaPublico),
  }
}
