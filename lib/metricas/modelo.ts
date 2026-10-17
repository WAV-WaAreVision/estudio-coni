import type { Destino } from "@/lib/dominio/destinos"
import { instanteLocal, semanaDe } from "@/lib/dominio/fechas"
import {
  agruparPorSemana,
  type Comparacion,
  compararTemas,
  contarEnMes,
  DIAS_PARA_COMPARAR,
  guardadosPorMil,
  limitesDelMes,
  lunesDeLaSemana,
  metricasAlDia,
  type ReelMedido,
  segundosVistos,
  sumarDias,
  UMBRAL_DE_REELS,
} from "@/lib/dominio/metricas"
import { type CatalogoDePilares, nombreDePilar, type PilarVisible, pilarVisible } from "@/lib/dominio/pilares"

// The Métricas screen as data: every sentence Coni reads is decided here, so it can be tested without a browser.

export interface LecturaDeReel {
  piezaId: string
  dia: string
  alcance: number | null
  guardados: number | null
  compartidos: number | null
  comentarios: number | null
  tiempoPromedio: number | null
}

/** One network a piece went out on (`publicaciones` in `publicado` or `subido_a_mano`, decision 15). */
export interface PublicacionMedible {
  piezaId: string
  titulo: string
  /** The slug of its idea's pillar. */
  pilar: string | null
  red: Destino
  /** She uploaded it herself (`subido_a_mano`): Instagram has no reel to ask about. */
  aMano: boolean
  /** The signed publishing time or, without one, when the row was marked (amendment A3), as an ISO instant. */
  publicadoEn: string
}

export interface LecturaDeLinkedin {
  piezaId: string
  medidoEn: string
  impresiones: number | null
  reacciones: number | null
  comentarios: number | null
  compartidos: number | null
}

export interface EntradaDeMetricas {
  publicaciones: readonly PublicacionMedible[]
  /** Instagram readings; the newest of each reel is the one shown. */
  lecturas: readonly LecturaDeReel[]
  /** The newest LinkedIn reading of each post. */
  lecturasLinkedin: readonly LecturaDeLinkedin[]
  /** When each consultation was noted. */
  consultas: readonly string[]
  /** Clicks on the links of `/l`, by day. */
  clics: readonly { dia: string; clics: number }[]
  zona: string
  ahora: number
  pilares: CatalogoDePilares
}

export interface Barra {
  piezaId: string
  titulo: string
  pilar: PilarVisible | null
  porMil: number | null
  /** 0 to 100, scaled to the best bar that is visible. */
  ancho: number
  texto: string
  /** The same figure split for the layout: «50,4», «cada 1.000» and the sample «121 guardados de 2.400 personas». */
  cifra: string | null
  unidad: string
  muestra: string | null
  /** The sample size of the reel's theme. */
  reelsDelTema: number
}

export interface TemaEnLista {
  pilar: PilarVisible
  n: number
}

export type PanelDeComparacion =
  | { tipo: "sin_numeros"; titulo: string; texto: string }
  | { tipo: "temprano"; titulo: string; texto: string; avance: number; meta: number; temas: TemaEnLista[] }
  | {
      tipo: "comparable"
      titulo: string
      temas: { pilar: PilarVisible; texto: string }[]
      frase: string
      cautela: string
      pendientes: TemaEnLista[]
    }

export interface ReelDeSemana {
  piezaId: string
  titulo: string
  pilar: PilarVisible | null
  meta: string
}

export interface Semana {
  titulo: string
  reels: ReelDeSemana[]
  resumen: string
}

export interface ModeloDeMetricas {
  mes: string
  resumen: string
  vacio: boolean
  aviso: string | null
  barras: Barra[]
  comparacion: PanelDeComparacion | null
  semanas: Semana[]
}

const SEMANAS_A_MOSTRAR = 12

const REGLA_DE_LA_SEMANA = "Cuento los reels desde que cumplen una semana."

const numero = (valor: number) => valor.toLocaleString("es-CL")

function plural(cantidad: number, singular: string, varios: string): string {
  return `${numero(cantidad)} ${cantidad === 1 ? singular : varios}`
}

function newestReadings(lecturas: readonly LecturaDeReel[]): Map<string, LecturaDeReel> {
  const ultimas = new Map<string, LecturaDeReel>()
  for (const lectura of lecturas) {
    const actual = ultimas.get(lectura.piezaId)
    if (!actual || lectura.dia > actual.dia) ultimas.set(lectura.piezaId, lectura)
  }
  return ultimas
}

const SIN_LECTURA: Omit<LecturaDeReel, "piezaId"> = {
  dia: "",
  alcance: null,
  guardados: null,
  compartidos: null,
  comentarios: null,
  tiempoPromedio: null,
}

function reelMedido(pieza: PublicacionMedible, lectura: Omit<LecturaDeReel, "piezaId">): ReelMedido {
  return {
    piezaId: pieza.piezaId,
    titulo: pieza.titulo,
    pilar: pieza.pilar,
    publicadoEn: pieza.publicadoEn,
    ...lectura,
  }
}

const UNIDAD_DE_BARRA = "cada 1.000"

function muestraDeBarra(lectura: LecturaDeReel | undefined, porMil: number | null): string | null {
  if (!lectura || porMil === null || lectura.guardados === null || lectura.alcance === null) return null
  return `${plural(lectura.guardados, "guardado", "guardados")} de ${plural(lectura.alcance, "persona", "personas")}`
}

function textoDeBarra(lectura: LecturaDeReel | undefined, porMil: number | null): string {
  if (!lectura || porMil === null || lectura.guardados === null || lectura.alcance === null) {
    return "Todavía sin números: llegan cada mañana a las 7:00."
  }
  return `${numero(porMil)} ${UNIDAD_DE_BARRA} · ${muestraDeBarra(lectura, porMil)}`
}

function metaDeReel(lectura: LecturaDeReel | undefined): string {
  if (!lectura || (lectura.guardados === null && lectura.alcance === null)) return "Todavía sin números"
  const partes: string[] = []
  if (lectura.guardados !== null) partes.push(plural(lectura.guardados, "guardado", "guardados"))
  if (lectura.alcance !== null) partes.push(`${numero(lectura.alcance)} de alcance`)
  const segundos = segundosVistos(lectura.tiempoPromedio)
  if (segundos !== null) partes.push(`en promedio se vio ${segundos} s`)
  return partes.join(" · ")
}

function etiquetaDelDia(dia: string): string {
  // Noon UTC keeps the calendar day whatever the zone.
  const texto = new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dia}T12:00:00Z`))
  // "lunes, 12 de octubre": Coni says "lunes 12 de octubre".
  return texto.replace(",", "")
}

function panelDeComparacion(comparacion: Comparacion, pilares: CatalogoDePilares): PanelDeComparacion {
  const enLista = (temas: readonly { pilar: string; n: number }[]): TemaEnLista[] =>
    temas.map(({ pilar, n }) => ({ pilar: pilarVisible(pilares, pilar), n }))
  if (comparacion.estado === "sin_reels") {
    return {
      tipo: "sin_numeros",
      titulo: "Todavía no hay con qué comparar",
      texto: `Cuando lleguen los números de tus reels, aquí verás cuántos hay de cada tema. Comparo temas cuando haya ${UMBRAL_DE_REELS} reels de cada uno.`,
    }
  }
  if (comparacion.estado === "temprano") {
    const [lider, segundo] = comparacion.temas
    const nombre = lider ? nombreDePilar(pilares, lider.pilar) : ""
    const yaLlego = (lider?.n ?? 0) >= UMBRAL_DE_REELS
    const avance = yaLlego ? (segundo?.n ?? 0) : (lider?.n ?? 0)
    const texto = yaLlego
      ? `${nombre} ya tiene ${UMBRAL_DE_REELS} reels. Comparo cuando otro tema también llegue a ${UMBRAL_DE_REELS}; el siguiente lleva ${avance} de ${UMBRAL_DE_REELS}. ${REGLA_DE_LA_SEMANA}`
      : `Comparo temas cuando haya ${UMBRAL_DE_REELS} reels de cada uno. El tema con más reels lleva ${avance} de ${UMBRAL_DE_REELS}. ${REGLA_DE_LA_SEMANA}`
    return {
      tipo: "temprano",
      titulo: "Todavía es temprano para concluir",
      texto,
      avance,
      meta: UMBRAL_DE_REELS,
      temas: enLista(comparacion.temas),
    }
  }
  const { diferencia } = comparacion
  const mayor = nombreDePilar(pilares, diferencia.mayor)
  const menor = nombreDePilar(pilares, diferencia.menor)
  const gap = `${numero(diferencia.valor)} cada 1.000 (entre ${numero(diferencia.desde)} y ${numero(diferencia.hasta)})`
  return {
    tipo: "comparable",
    titulo: "Comparación de temas",
    temas: comparacion.temas.map((tema) => ({
      pilar: pilarVisible(pilares, tema.pilar),
      texto: `${nombreDePilar(pilares, tema.pilar)} · ${plural(tema.n, "reel", "reels")} · promedio ${numero(tema.media)} cada 1.000 (entre ${numero(tema.desde)} y ${numero(tema.hasta)})`,
    })),
    frase: diferencia.distinguible
      ? `${mayor} va por delante de ${menor} por ${gap}. La diferencia es mayor que lo que varían tus reels entre sí.`
      : `${mayor} va por delante de ${menor} por ${gap}. Todavía no es mayor que lo que varían tus reels entre sí.`,
    cautela:
      "Es una comparación de lo ya publicado: entre un tema y otro cambian también el gancho y el día. No entran los reels de los últimos 7 días, que aún están sumando guardados.",
    pendientes: enLista(comparacion.pendientes),
  }
}

function resumenDeSemana(consultas: number, clics: number): string {
  return `${plural(consultas, "consulta", "consultas")} · ${plural(clics, "toque", "toques")} en tu link`
}

export function construirMetricas(entrada: EntradaDeMetricas): ModeloDeMetricas {
  const { zona, ahora } = entrada
  const mes = limitesDelMes(ahora, zona)
  const ultimas = newestReadings(entrada.lecturas)
  const reels = entrada.publicaciones.filter((p) => p.red === "instagram" && !p.aMano)

  const enElMes = (instante: number) => instante >= mes.desde && instante < mes.hasta
  const reelsDelMes = reels.filter((pieza) => enElMes(Date.parse(pieza.publicadoEn))).length
  const consultasDelMes = contarEnMes(entrada.consultas, mes.clave, zona)
  const clicsDelMes = entrada.clics
    .filter((clic) => clic.dia.startsWith(`${mes.clave}-`))
    .reduce((suma, clic) => suma + clic.clics, 0)

  const desde = sumarDias(lunesDeLaSemana(ahora, zona), -7 * (SEMANAS_A_MOSTRAR - 1))
  const reciente = (pieza: PublicacionMedible) => lunesDeLaSemana(Date.parse(pieza.publicadoEn), zona) >= desde

  const medidos: ReelMedido[] = []
  for (const pieza of reels) {
    const lectura = ultimas.get(pieza.piezaId)
    if (lectura) medidos.push(reelMedido(pieza, lectura))
  }
  const corte = ahora - DIAS_PARA_COMPARAR * 86_400_000
  const comparacion = compararTemas(medidos.filter((reel) => Date.parse(reel.publicadoEn) <= corte))
  const reelsPorTema = new Map<string, number>()
  for (const reel of medidos) {
    if (reel.pilar !== null && guardadosPorMil(reel.guardados, reel.alcance) !== null) {
      reelsPorTema.set(reel.pilar, (reelsPorTema.get(reel.pilar) ?? 0) + 1)
    }
  }

  const visibles = reels.filter(reciente)
  const conBarra = visibles.map((pieza) => {
    const lectura = ultimas.get(pieza.piezaId)
    const porMil = lectura ? guardadosPorMil(lectura.guardados, lectura.alcance) : null
    return { pieza, lectura, porMil }
  })
  const maximo = Math.max(0, ...conBarra.map((fila) => fila.porMil ?? 0))
  const barras: Barra[] = conBarra
    .sort(
      (a, b) =>
        (b.porMil ?? -1) - (a.porMil ?? -1) || Date.parse(b.pieza.publicadoEn) - Date.parse(a.pieza.publicadoEn),
    )
    .map(({ pieza, lectura, porMil }) => ({
      piezaId: pieza.piezaId,
      titulo: pieza.titulo,
      pilar: pilarVisible(entrada.pilares, pieza.pilar),
      porMil,
      ancho: porMil === null || maximo === 0 ? 0 : Math.max(porMil > 0 ? 2 : 0, Math.round((porMil / maximo) * 100)),
      texto: textoDeBarra(lectura, porMil),
      cifra: muestraDeBarra(lectura, porMil) === null || porMil === null ? null : numero(porMil),
      unidad: UNIDAD_DE_BARRA,
      muestra: muestraDeBarra(lectura, porMil),
      reelsDelTema: pieza.pilar ? (reelsPorTema.get(pieza.pilar) ?? 0) : 0,
    }))

  const semanas = agruparPorSemana({
    reels: visibles.map((pieza) => reelMedido(pieza, ultimas.get(pieza.piezaId) ?? SIN_LECTURA)),
    consultas: entrada.consultas,
    clics: entrada.clics,
    zona,
  }).filter((semana) => semana.lunes >= desde)

  const ultimoDia = entrada.lecturas.reduce<string | null>(
    (ultimo, l) => (ultimo === null || l.dia > ultimo ? l.dia : ultimo),
    null,
  )
  const alDia = metricasAlDia({ ultimoDia, ahora, zona })
  const sinNingunaLectura =
    ultimoDia === null && reels.some((pieza) => Date.parse(pieza.publicadoEn) < ahora - 2 * 86_400_000)

  return {
    mes: mes.nombre,
    resumen: `${plural(reelsDelMes, "reel publicado", "reels publicados")} · ${plural(consultasDelMes, "consulta", "consultas")} · ${plural(clicsDelMes, "toque", "toques")} en tu link`,
    vacio: reels.length === 0,
    aviso: sinNingunaLectura
      ? "Todavía no tengo números de tus reels. Si mañana sigue igual, avísale a Federico."
      : alDia || ultimoDia === null
        ? null
        : `No pude traer las métricas de hoy; muestro las del ${etiquetaDelDia(ultimoDia)}.`,
    barras,
    comparacion: reels.length === 0 ? null : panelDeComparacion(comparacion, entrada.pilares),
    semanas: semanas.map((semana) => ({
      titulo: `Semana del ${semanaDe(instanteLocal({ ...partesDe(semana.lunes), hora: 12, minuto: 0 }, zona), zona)}`,
      reels: semana.reels.map((reel) => ({
        piezaId: reel.piezaId,
        titulo: reel.titulo,
        pilar: pilarVisible(entrada.pilares, reel.pilar),
        meta: metaDeReel(ultimas.get(reel.piezaId)),
      })),
      resumen: resumenDeSemana(semana.consultas, semana.clics),
    })),
  }
}

function partesDe(dia: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, diaDelMes] = dia.split("-").map(Number)
  return { anio: anio ?? 0, mes: mes ?? 0, dia: diaDelMes ?? 0 }
}
