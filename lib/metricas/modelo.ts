import { type Destino, nombreDeDestino } from "@/lib/dominio/destinos"
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
  /** What the bar measures: saves per 1,000 on Instagram, impressions on LinkedIn. Null without numbers. */
  valor: number | null
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

export interface GrupoDeBarras {
  red: Destino
  /** "Instagram". */
  titulo: string
  /** "3 reels", "1 post". */
  cifra: string
  /** What the bars measure, in her words. */
  medida: string
  barras: Barra[]
}

const SIN_NUMEROS = "sin números"
const MEDIDA: Record<Destino, string> = {
  instagram: "Guardados cada 1.000 personas que lo vieron.",
  linkedin: "Impresiones: las veces que LinkedIn lo mostró.",
}

function muestraDeLinkedin(lectura: LecturaDeLinkedin): string | null {
  const partes: string[] = []
  if (lectura.reacciones !== null) partes.push(plural(lectura.reacciones, "reacción", "reacciones"))
  if (lectura.comentarios !== null) partes.push(plural(lectura.comentarios, "comentario", "comentarios"))
  if (lectura.compartidos !== null) partes.push(plural(lectura.compartidos, "vez compartido", "veces compartido"))
  return partes.length > 0 ? partes.join(" · ") : null
}

function anchoDe(valor: number | null, maximo: number): number {
  if (valor === null || maximo === 0) return 0
  return Math.max(valor > 0 ? 2 : 0, Math.round((valor / maximo) * 100))
}

const ordenDeBarras = (a: Barra & { publicadoEn: string }, b: Barra & { publicadoEn: string }) =>
  (b.valor ?? -1) - (a.valor ?? -1) || Date.parse(b.publicadoEn) - Date.parse(a.publicadoEn)

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

export interface ModeloDeMetricas {
  mes: string
  /** "Este mes: 2 reels en Instagram · 1 post en LinkedIn". */
  resumen: string
  /** "Este mes también: 2 consultas · 15 toques en tu link". */
  contacto: string
  /** The window of "Lo que sirvió" and "Semana a semana". */
  periodo: string
  vacio: boolean
  aviso: string | null
  grupos: GrupoDeBarras[]
  comparacion: PanelDeComparacion | null
  semanas: Semana[]
}

const SEMANAS_A_MOSTRAR = 12
/** Decision 16: every number says its period. */
export const PERIODO = `Últimas ${SEMANAS_A_MOSTRAR} semanas`

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

export interface FilaDeSemana {
  /** `instagram:<piece>`: a piece on both networks is two rows. */
  clave: string
  titulo: string
  pilar: PilarVisible | null
  meta: string
}

export interface Semana {
  titulo: string
  publicaciones: FilaDeSemana[]
  resumen: string
}

function metaDeFila(
  publicacion: PublicacionMedible,
  ultimas: Map<string, LecturaDeReel>,
  ultimasLinkedin: Map<string, LecturaDeLinkedin>,
): string {
  const red = nombreDeDestino(publicacion.red)
  if (publicacion.red === "linkedin") {
    const lectura = ultimasLinkedin.get(publicacion.piezaId)
    if (!lectura || lectura.impresiones === null) return `${red} · ${SIN_NUMEROS}`
    const muestra = muestraDeLinkedin(lectura)
    return `${red} · ${numero(lectura.impresiones)} impresiones${muestra ? ` · ${muestra}` : ""}`
  }
  if (publicacion.aMano) return `${red} · ${SIN_NUMEROS}`
  return `${red} · ${metaDeReel(ultimas.get(publicacion.piezaId))}`
}

const ORDEN_DE_RED: Record<Destino, number> = { instagram: 0, linkedin: 1 }

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
  const delMes = (red: Destino) =>
    entrada.publicaciones.filter((p) => p.red === red && enElMes(Date.parse(p.publicadoEn))).length
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

  const recientes = entrada.publicaciones.filter(reciente)
  const ultimasLinkedin = new Map(entrada.lecturasLinkedin.map((l) => [l.piezaId, l]))

  const deInstagram = recientes.filter((p) => p.red === "instagram")
  const valoresDeInstagram = deInstagram.map((pieza) => {
    const lectura = pieza.aMano ? undefined : ultimas.get(pieza.piezaId)
    return { pieza, lectura, valor: lectura ? guardadosPorMil(lectura.guardados, lectura.alcance) : null }
  })
  const maximoInstagram = Math.max(0, ...valoresDeInstagram.map((fila) => fila.valor ?? 0))
  const barrasDeInstagram = valoresDeInstagram
    .map(({ pieza, lectura, valor }) => {
      const muestra = muestraDeBarra(lectura, valor)
      return {
        publicadoEn: pieza.publicadoEn,
        piezaId: pieza.piezaId,
        titulo: pieza.titulo,
        pilar: pilarVisible(entrada.pilares, pieza.pilar),
        valor,
        ancho: anchoDe(valor, maximoInstagram),
        texto: pieza.aMano ? SIN_NUMEROS : textoDeBarra(lectura, valor),
        cifra: muestra === null || valor === null ? null : numero(valor),
        unidad: UNIDAD_DE_BARRA,
        muestra,
        reelsDelTema: pieza.pilar ? (reelsPorTema.get(pieza.pilar) ?? 0) : 0,
      }
    })
    .sort(ordenDeBarras)

  const deLinkedin = recientes.filter((p) => p.red === "linkedin")
  const maximoLinkedin = Math.max(0, ...deLinkedin.map((p) => ultimasLinkedin.get(p.piezaId)?.impresiones ?? 0))
  const barrasDeLinkedin = deLinkedin
    .map((pieza) => {
      const lectura = ultimasLinkedin.get(pieza.piezaId)
      const valor = lectura?.impresiones ?? null
      const muestra = lectura && valor !== null ? muestraDeLinkedin(lectura) : null
      return {
        publicadoEn: pieza.publicadoEn,
        piezaId: pieza.piezaId,
        titulo: pieza.titulo,
        pilar: pilarVisible(entrada.pilares, pieza.pilar),
        valor,
        ancho: anchoDe(valor, maximoLinkedin),
        texto: valor === null ? SIN_NUMEROS : `${numero(valor)} impresiones${muestra ? ` · ${muestra}` : ""}`,
        cifra: valor === null ? null : numero(valor),
        unidad: "impresiones",
        muestra,
        reelsDelTema: 0,
      }
    })
    .sort(ordenDeBarras)

  const sinFecha = ({ publicadoEn: _, ...barra }: Barra & { publicadoEn: string }): Barra => barra
  const grupos: GrupoDeBarras[] = []
  if (barrasDeInstagram.length > 0) {
    grupos.push({
      red: "instagram",
      titulo: "Instagram",
      cifra: plural(barrasDeInstagram.length, "reel", "reels"),
      medida: MEDIDA.instagram,
      barras: barrasDeInstagram.map(sinFecha),
    })
  }
  if (barrasDeLinkedin.length > 0) {
    grupos.push({
      red: "linkedin",
      titulo: "LinkedIn",
      cifra: plural(barrasDeLinkedin.length, "post", "posts"),
      medida: MEDIDA.linkedin,
      barras: barrasDeLinkedin.map(sinFecha),
    })
  }

  // Consultations and clicks come grouped by week; publications are added to the same weeks, both networks.
  const porLunes = new Map(
    agruparPorSemana({ reels: [], consultas: entrada.consultas, clics: entrada.clics, zona }).map((s) => [
      s.lunes,
      { lunes: s.lunes, consultas: s.consultas, clics: s.clics, publicaciones: [] as PublicacionMedible[] },
    ]),
  )
  for (const publicacion of recientes) {
    const lunes = lunesDeLaSemana(Date.parse(publicacion.publicadoEn), zona)
    const semana = porLunes.get(lunes) ?? { lunes, consultas: 0, clics: 0, publicaciones: [] }
    semana.publicaciones.push(publicacion)
    porLunes.set(lunes, semana)
  }
  const semanas = [...porLunes.values()]
    .filter((semana) => semana.lunes >= desde)
    .sort((a, b) => b.lunes.localeCompare(a.lunes))

  const ultimoDia = entrada.lecturas.reduce<string | null>(
    (ultimo, l) => (ultimo === null || l.dia > ultimo ? l.dia : ultimo),
    null,
  )
  const alDia = metricasAlDia({ ultimoDia, ahora, zona })
  const sinNingunaLectura =
    ultimoDia === null && reels.some((pieza) => Date.parse(pieza.publicadoEn) < ahora - 2 * 86_400_000)

  return {
    mes: mes.nombre,
    resumen: `Este mes: ${plural(delMes("instagram"), "reel", "reels")} en Instagram · ${plural(delMes("linkedin"), "post", "posts")} en LinkedIn`,
    contacto: `Este mes también: ${plural(consultasDelMes, "consulta", "consultas")} · ${plural(clicsDelMes, "toque", "toques")} en tu link`,
    periodo: PERIODO,
    vacio: entrada.publicaciones.length === 0,
    aviso: sinNingunaLectura
      ? "Todavía no tengo números de tus reels. Si mañana sigue igual, avísale a Federico."
      : alDia || ultimoDia === null
        ? null
        : `No pude traer las métricas de hoy; muestro las del ${etiquetaDelDia(ultimoDia)}.`,
    grupos,
    comparacion: reels.length === 0 ? null : panelDeComparacion(comparacion, entrada.pilares),
    semanas: semanas.map((semana) => ({
      titulo: `Semana del ${semanaDe(instanteLocal({ ...partesDe(semana.lunes), hora: 12, minuto: 0 }, zona), zona)}`,
      publicaciones: [...semana.publicaciones]
        .sort(
          (a, b) => Date.parse(a.publicadoEn) - Date.parse(b.publicadoEn) || ORDEN_DE_RED[a.red] - ORDEN_DE_RED[b.red],
        )
        .map((publicacion) => ({
          clave: `${publicacion.red}:${publicacion.piezaId}`,
          titulo: publicacion.titulo,
          pilar: pilarVisible(entrada.pilares, publicacion.pilar),
          meta: metaDeFila(publicacion, ultimas, ultimasLinkedin),
        })),
      resumen: resumenDeSemana(semana.consultas, semana.clics),
    })),
  }
}

function partesDe(dia: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, diaDelMes] = dia.split("-").map(Number)
  return { anio: anio ?? 0, mes: mes ?? 0, dia: diaDelMes ?? 0 }
}
