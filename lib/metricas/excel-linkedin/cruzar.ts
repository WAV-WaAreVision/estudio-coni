import { diaLocal } from "@/lib/dominio/fechas"
import { sumarDias } from "@/lib/dominio/metricas"
import type { ExcelDeLinkedin, PostDelExcel } from "./leer"

// Which Excel post is which Conidolly piece (spec 2026-11-09, decision 2). Pure: the publications and the zone come in.

export interface PublicacionDeLinkedin {
  piezaId: string
  titulo: string
  /** `urn:li:share:<n>` or `urn:li:ugcPost:<n>` when Conidolly published it; null when she uploaded it herself. */
  postUrn: string | null
  /** ISO instant: the signed publishing time or, without one, when the row was marked. */
  publicadoEn: string
}

export interface NumerosDelExcel {
  piezaId: string
  impresiones: number | null
  interacciones: number | null
}

export interface OpcionDelExcel {
  /** `share:<n>` or `ugcPost:<n>`. */
  clave: string
  fecha: string | null
  impresiones: number | null
  interacciones: number | null
}

export interface Dudoso {
  piezaId: string
  titulo: string
  /** The piece's day in the app's zone. */
  fecha: string
  opciones: OpcionDelExcel[]
}

export interface Cruce {
  seguros: NumerosDelExcel[]
  dudosos: Dudoso[]
  /** Excel posts that are not Conidolly's: ignored. */
  ajenas: number
  /** Conidolly posts published inside the period that the file does not bring. */
  faltanEnElPeriodo: number
}

const URN = /^urn:li:(share|ugcPost):(\d+)$/
/**
 * A hand upload is dated by its signed time or by when she marked it, which can trail the real post by a day: a
 * doubtful one is offered the free posts of the day before and after too.
 */
const DIAS_DE_HOLGURA = 1

export const claveDePost = (post: Pick<PostDelExcel, "tipo" | "numero">): string => `${post.tipo}:${post.numero}`

const numerosDe = (piezaId: string, post: PostDelExcel): NumerosDelExcel => ({
  piezaId,
  impresiones: post.impresiones,
  interacciones: post.interacciones,
})

interface SubidaAMano {
  piezaId: string
  titulo: string
  dia: string
}

export function cruzarConPiezas(
  excel: ExcelDeLinkedin,
  publicaciones: readonly PublicacionDeLinkedin[],
  zona: string,
): Cruce {
  const { desde, hasta } = excel.periodo
  const enElPeriodo = (dia: string) => dia >= desde && dia <= hasta
  const porClave = new Map(excel.publicaciones.map((post) => [claveDePost(post), post]))
  const usadas = new Set<string>()
  const seguros: NumerosDelExcel[] = []
  const aMano: SubidaAMano[] = []
  let faltanEnElPeriodo = 0

  // 1. The URN Conidolly kept when it published names the post exactly.
  for (const publicacion of publicaciones) {
    const dia = diaLocal(Date.parse(publicacion.publicadoEn), zona)
    const urn = publicacion.postUrn ? URN.exec(publicacion.postUrn) : null
    if (!urn) {
      if (enElPeriodo(dia)) aMano.push({ piezaId: publicacion.piezaId, titulo: publicacion.titulo, dia })
      continue
    }
    const clave = `${urn[1]}:${urn[2]}`
    const post = porClave.get(clave)
    if (post) {
      usadas.add(clave)
      seguros.push(numerosDe(publicacion.piezaId, post))
    } else if (enElPeriodo(dia)) {
      faltanEnElPeriodo += 1
    }
  }

  // 2. A day with exactly one hand upload and exactly one free Excel post pairs them on its own.
  const porDia = new Map<string, SubidaAMano[]>()
  for (const subida of aMano) porDia.set(subida.dia, [...(porDia.get(subida.dia) ?? []), subida])
  const pendientes: SubidaAMano[] = []
  for (const [dia, subidas] of porDia) {
    const libres = excel.publicaciones.filter((post) => post.fecha === dia && !usadas.has(claveDePost(post)))
    const [subida] = subidas
    const [post] = libres
    if (subidas.length === 1 && libres.length === 1 && subida && post) {
      usadas.add(claveDePost(post))
      seguros.push(numerosDe(subida.piezaId, post))
    } else {
      pendientes.push(...subidas)
    }
  }

  // 3. Anything else is doubtful: Coni picks among the free posts of that day and the ones beside it.
  const dudosos: Dudoso[] = []
  const ofrecidas = new Set<string>()
  for (const subida of pendientes) {
    const cerca = new Set([sumarDias(subida.dia, -DIAS_DE_HOLGURA), subida.dia, sumarDias(subida.dia, DIAS_DE_HOLGURA)])
    const opciones = excel.publicaciones
      .filter((post) => post.fecha !== null && cerca.has(post.fecha) && !usadas.has(claveDePost(post)))
      .sort(
        (a, b) =>
          Number(b.fecha === subida.dia) - Number(a.fecha === subida.dia) ||
          (a.fecha ?? "").localeCompare(b.fecha ?? ""),
      )
      .map((post) => ({
        clave: claveDePost(post),
        fecha: post.fecha,
        impresiones: post.impresiones,
        interacciones: post.interacciones,
      }))
    if (opciones.length === 0) {
      faltanEnElPeriodo += 1
      continue
    }
    for (const opcion of opciones) ofrecidas.add(opcion.clave)
    dudosos.push({ piezaId: subida.piezaId, titulo: subida.titulo, fecha: subida.dia, opciones })
  }

  const libres = excel.publicaciones.filter((post) => {
    const clave = claveDePost(post)
    return !usadas.has(clave) && !ofrecidas.has(clave)
  })
  return {
    seguros,
    dudosos: dudosos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    ajenas: libres.length + excel.sinIdentificar,
    faltanEnElPeriodo,
  }
}
