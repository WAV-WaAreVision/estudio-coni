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
import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"

// The Métricas screen as data: every sentence Coni reads is decided here, so it can be tested without a browser.

export interface PiezaPublicada {
  id: string
  titulo: string
  pilar: Pilar | null
  /** The approved publishing time, as an ISO instant. */
  publicadoEn: string
}

export interface LecturaDeReel {
  piezaId: string
  dia: string
  alcance: number | null
  guardados: number | null
  compartidos: number | null
  comentarios: number | null
  tiempoPromedio: number | null
}

export interface EntradaDeMetricas {
  publicadas: readonly PiezaPublicada[]
  /** Any readings; the newest of each reel is the one shown. */
  lecturas: readonly LecturaDeReel[]
  /** When each consultation was noted. */
  consultas: readonly string[]
  /** Clicks on the links of `/l`, by day. */
  clics: readonly { dia: string; clics: number }[]
  zona: string
  ahora: number
}

export interface Barra {
  piezaId: string
  titulo: string
  pilar: Pilar | null
  porMil: number | null
  /** 0 to 100, scaled to the best bar that is visible. */
  ancho: number
  texto: string
  /** The sample size of the reel's theme. */
  reelsDelTema: number
}

export interface TemaEnLista {
  pilar: Pilar
  n: number
}

export type PanelDeComparacion =
  | { tipo: "sin_numeros"; titulo: string; texto: string }
  | { tipo: "temprano"; titulo: string; texto: string; avance: number; meta: number; temas: TemaEnLista[] }
  | {
      tipo: "comparable"
      titulo: string
      temas: { pilar: Pilar; texto: string }[]
      frase: string
      cautela: string
      pendientes: TemaEnLista[]
    }

export interface ReelDeSemana {
  piezaId: string
  titulo: string
  pilar: Pilar | null
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

function reelMedido(pieza: PiezaPublicada, lectura: Omit<LecturaDeReel, "piezaId">): ReelMedido {
  return { piezaId: pieza.id, titulo: pieza.titulo, pilar: pieza.pilar, publicadoEn: pieza.publicadoEn, ...lectura }
}

function textoDeBarra(lectura: LecturaDeReel | undefined, porMil: number | null): string {
  if (!lectura || porMil === null || lectura.guardados === null || lectura.alcance === null) {
    return "Todavía sin números: llegan cada mañana a las 7:00."
  }
  return `${numero(porMil)} cada 1.000 · ${plural(lectura.guardados, "guardado", "guardados")} de ${plural(lectura.alcance, "persona", "personas")}`
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

function panelDeComparacion(comparacion: Comparacion): PanelDeComparacion {
  if (comparacion.estado === "sin_reels") {
    return {
      tipo: "sin_numeros",
      titulo: "Todavía no hay con qué comparar",
      texto: `Cuando lleguen los números de tus reels, aquí verás cuántos hay de cada tema. Comparo temas cuando haya ${UMBRAL_DE_REELS} reels de cada uno.`,
    }
  }
  if (comparacion.estado === "temprano") {
    const [lider, segundo] = comparacion.temas
    const nombre = lider ? NOMBRE_DE_PILAR[lider.pilar] : ""
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
      temas: comparacion.temas.map(({ pilar, n }) => ({ pilar, n })),
    }
  }
  const { diferencia } = comparacion
  const mayor = NOMBRE_DE_PILAR[diferencia.mayor]
  const menor = NOMBRE_DE_PILAR[diferencia.menor]
  const gap = `${numero(diferencia.valor)} cada 1.000 (entre ${numero(diferencia.desde)} y ${numero(diferencia.hasta)})`
  return {
    tipo: "comparable",
    titulo: "Comparación de temas",
    temas: comparacion.temas.map((tema) => ({
      pilar: tema.pilar,
      texto: `${NOMBRE_DE_PILAR[tema.pilar]} · ${plural(tema.n, "reel", "reels")} · promedio ${numero(tema.media)} cada 1.000 (entre ${numero(tema.desde)} y ${numero(tema.hasta)})`,
    })),
    frase: diferencia.distinguible
      ? `${mayor} va por delante de ${menor} por ${gap}. La diferencia es mayor que lo que varían tus reels entre sí.`
      : `${mayor} va por delante de ${menor} por ${gap}. Todavía no es mayor que lo que varían tus reels entre sí.`,
    cautela:
      "Es una comparación de lo ya publicado: entre un tema y otro cambian también el gancho y el día. No entran los reels de los últimos 7 días, que aún están sumando guardados.",
    pendientes: comparacion.pendientes,
  }
}

function resumenDeSemana(consultas: number, clics: number): string {
  return `${plural(consultas, "consulta", "consultas")} · ${plural(clics, "toque", "toques")} en tu link`
}

export function construirMetricas(entrada: EntradaDeMetricas): ModeloDeMetricas {
  const { zona, ahora } = entrada
  const mes = limitesDelMes(ahora, zona)
  const ultimas = newestReadings(entrada.lecturas)

  const enElMes = (instante: number) => instante >= mes.desde && instante < mes.hasta
  const reelsDelMes = entrada.publicadas.filter((pieza) => enElMes(Date.parse(pieza.publicadoEn))).length
  const consultasDelMes = contarEnMes(entrada.consultas, mes.clave, zona)
  const clicsDelMes = entrada.clics
    .filter((clic) => clic.dia.startsWith(`${mes.clave}-`))
    .reduce((suma, clic) => suma + clic.clics, 0)

  const desde = sumarDias(lunesDeLaSemana(ahora, zona), -7 * (SEMANAS_A_MOSTRAR - 1))
  const reciente = (pieza: PiezaPublicada) => lunesDeLaSemana(Date.parse(pieza.publicadoEn), zona) >= desde

  const medidos: ReelMedido[] = []
  for (const pieza of entrada.publicadas) {
    const lectura = ultimas.get(pieza.id)
    if (lectura) medidos.push(reelMedido(pieza, lectura))
  }
  const corte = ahora - DIAS_PARA_COMPARAR * 86_400_000
  const comparacion = compararTemas(medidos.filter((reel) => Date.parse(reel.publicadoEn) <= corte))
  const reelsPorTema = new Map<Pilar, number>()
  for (const reel of medidos) {
    if (reel.pilar !== null && guardadosPorMil(reel.guardados, reel.alcance) !== null) {
      reelsPorTema.set(reel.pilar, (reelsPorTema.get(reel.pilar) ?? 0) + 1)
    }
  }

  const visibles = entrada.publicadas.filter(reciente)
  const conBarra = visibles.map((pieza) => {
    const lectura = ultimas.get(pieza.id)
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
      piezaId: pieza.id,
      titulo: pieza.titulo,
      pilar: pieza.pilar,
      porMil,
      ancho: porMil === null || maximo === 0 ? 0 : Math.max(porMil > 0 ? 2 : 0, Math.round((porMil / maximo) * 100)),
      texto: textoDeBarra(lectura, porMil),
      reelsDelTema: pieza.pilar ? (reelsPorTema.get(pieza.pilar) ?? 0) : 0,
    }))

  const semanas = agruparPorSemana({
    reels: visibles.map((pieza) => reelMedido(pieza, ultimas.get(pieza.id) ?? SIN_LECTURA)),
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
    ultimoDia === null && entrada.publicadas.some((pieza) => Date.parse(pieza.publicadoEn) < ahora - 2 * 86_400_000)

  return {
    mes: mes.nombre,
    resumen: `${plural(reelsDelMes, "reel publicado", "reels publicados")} · ${plural(consultasDelMes, "consulta", "consultas")} · ${plural(clicsDelMes, "toque", "toques")} en tu link`,
    vacio: entrada.publicadas.length === 0,
    aviso: sinNingunaLectura
      ? "Todavía no tengo números de tus reels. Si mañana sigue igual, avísale a Federico."
      : alDia || ultimoDia === null
        ? null
        : `No pude traer las métricas de hoy; muestro las del ${etiquetaDelDia(ultimoDia)}.`,
    barras,
    comparacion: entrada.publicadas.length === 0 ? null : panelDeComparacion(comparacion),
    semanas: semanas.map((semana) => ({
      titulo: `Semana del ${semanaDe(instanteLocal({ ...partesDe(semana.lunes), hora: 12, minuto: 0 }, zona), zona)}`,
      reels: semana.reels.map((reel) => ({
        piezaId: reel.piezaId,
        titulo: reel.titulo,
        pilar: reel.pilar,
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
