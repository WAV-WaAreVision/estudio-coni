import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { diaLocal, etiquetaDeDia } from "@/lib/dominio/fechas"
import { NOMBRE_DE_RED, REDES } from "@/lib/dominio/pilares"

/** Spec 2026-11-09 (issue 22): what Claude can answer about two similar topics. «parte de» is not «mismo». */
export const VEREDICTOS_DE_FUSION = ["mismo", "parte_de", "distintos"] as const
export type VeredictoDeFusion = (typeof VEREDICTOS_DE_FUSION)[number]

/** A topic's main pillar in a network (`tema_pilares`, `fuerza = 'alta'`, not a layer). */
export interface PrincipalDeRed {
  red: string
  pilarId: string
}

export type Delicadeza = { delicada: false; motivo: null } | { delicada: true; motivo: string }

const enumerar = (partes: readonly string[]) =>
  partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`

/** Two 'alta' rows in one network are possible: the smallest pillar id stands, so the answer never depends on order. */
const principalEn = (principales: readonly PrincipalDeRed[], red: string): string | undefined =>
  principales
    .filter((p) => p.red === red)
    .map((p) => p.pilarId)
    .sort()[0]

/**
 * Decision 1 of the spec: a merge waits for Coni when the two topics have a different main pillar in some network,
 * or when Claude is not sure. The reason is said to her on the page.
 */
export function esDelicada(a: readonly PrincipalDeRed[], b: readonly PrincipalDeRed[], seguro: boolean): Delicadeza {
  const distintas = REDES.filter((red) => {
    const deA = principalEn(a, red)
    const deB = principalEn(b, red)
    return deA !== undefined && deB !== undefined && deA !== deB
  })
  const motivos: string[] = []
  if (distintas.length > 0) {
    motivos.push(`Tienen distinto pilar principal en ${enumerar(distintas.map((red) => NOMBRE_DE_RED[red]))}.`)
  }
  if (!seguro) motivos.push("Claude no está seguro de que sean el mismo tema.")
  return motivos.length === 0 ? { delicada: false, motivo: null } : { delicada: true, motivo: motivos.join(" ") }
}

/** Up to `cuantas` claims, one per author first (in order of first appearance), then round by round. */
export function elegirVariadas<T extends { autorId: string }>(filas: readonly T[], cuantas: number): T[] {
  const porAutor = new Map<string, T[]>()
  for (const fila of filas) porAutor.set(fila.autorId, [...(porAutor.get(fila.autorId) ?? []), fila])
  const elegidas: T[] = []
  for (let vuelta = 0; elegidas.length < cuantas; vuelta++) {
    const deEstaVuelta = [...porAutor.values()].flatMap((lista) => {
      const fila = lista[vuelta]
      return fila ? [fila] : []
    })
    if (deEstaVuelta.length === 0) break
    elegidas.push(...deEstaVuelta.slice(0, cuantas - elegidas.length))
  }
  return elegidas
}

export const RUTA_DE_FUSIONES = `${RUTA_DE_TEMAS}/fusiones`

/** What the page lists (`lib/datos/fusiones.ts` reads it). */
export interface PropuestaDeFusion {
  id: string
  ganador: string
  perdedor: string
  razon: string | null
  /** Why it waits for her (`esDelicada`). */
  motivo: string | null
}
export interface FusionReciente {
  id: string
  ganador: string
  perdedor: string
  razon: string | null
  aplicadaEn: string
}
export interface ParRechazado {
  a: string
  b: string
  nombreA: string
  nombreB: string
  origen: "claude" | "coni"
  razon: string | null
}
export interface FusionesLeidas {
  propuestas: PropuestaDeFusion[]
  recientes: FusionReciente[]
  rechazadas: ParRechazado[]
}

export const TEXTOS_DE_FUSIONES = {
  titulo: "Fusiones",
  propuestas: "Para que decidas",
  recientes: "Fusiones recientes",
  rechazadas: "Pares que no uní",
  vacio: "Todavía no hay fusiones.",
  deshacer: "Deshacer",
  confirmarDeshacer: "Sí, deshacer",
  volver: "Cancelar",
  unirIgual: "Unir igual",
} as const

export const BOTONES_DE_VEREDICTO: readonly { veredicto: VeredictoDeFusion; etiqueta: string }[] = [
  { veredicto: "mismo", etiqueta: "Son el mismo" },
  { veredicto: "parte_de", etiqueta: "Uno es parte del otro" },
  { veredicto: "distintos", etiqueta: "Son distintos" },
]

export const tituloDePar = (uno: string, otro: string) => `«${uno}» y «${otro}»`

export function lineaDeFusionReciente(
  fusion: Pick<FusionReciente, "ganador" | "perdedor" | "aplicadaEn">,
  zona: string,
): string {
  const dia = etiquetaDeDia(diaLocal(Date.parse(fusion.aplicadaEn), zona), zona)
  return `Uní «${fusion.perdedor}» con «${fusion.ganador}» el ${dia}.`
}

export const razonDeClaude = (razon: string | null) => (razon ? `Razón: ${razon}` : null)

export function razonDeRechazo(par: Pick<ParRechazado, "origen" | "razon">): string {
  if (par.origen === "coni") return "Tú dijiste que son distintos."
  return razonDeClaude(par.razon) ?? "Claude dijo que son distintos."
}

export const preguntaDeDeshacer = (ganador: string, perdedor: string) =>
  `¿Deshacer la fusión de «${perdedor}» con «${ganador}»? Los dos temas vuelven a separarse y no te los vuelvo a proponer.`

export const tambienSeLlamo = (alias: readonly string[]) => `También se llamó: ${alias.join(", ")}.`
export const subtemaDe = (nombre: string) => `Subtema de «${nombre}»`

export const AVISOS_DE_FUSION = {
  "fusion-unida": "Uní los dos temas. Puedes deshacerlo en Fusiones recientes.",
  "fusion-subtema": "Guardé que uno es parte del otro. Quedan como temas separados.",
  "fusion-separada": "Guardé que son distintos. No te los vuelvo a proponer.",
  "fusion-deshecha": "Deshice la fusión. Los dos temas quedaron como antes.",
} as const
export type AvisoDeFusion = keyof typeof AVISOS_DE_FUSION

const esAvisoDeFusion = (valor: unknown): valor is AvisoDeFusion =>
  typeof valor === "string" && Object.hasOwn(AVISOS_DE_FUSION, valor)

export function leerAvisoDeFusion(params: Record<string, string | string[] | undefined>): string | null {
  const pedido = Array.isArray(params.aviso) ? params.aviso[0] : params.aviso
  return esAvisoDeFusion(pedido) ? AVISOS_DE_FUSION[pedido] : null
}

export const conAvisoDeFusion = (href: string, aviso: AvisoDeFusion) =>
  `${href}${href.includes("?") ? "&" : "?"}aviso=${aviso}`

/** The refusals of `decidir_fusion`, `deshacer_fusion` and `unir_temas_a_mano`, in her words. */
export const RECHAZOS_DE_FUSION: Record<string, string> = {
  fusion_inexistente: "Esa fusión ya no existe. Recarga la página.",
  fusion_ya_decidida: "Esa fusión ya se decidió. Recarga la página.",
  fusion_no_aplicada: "Esa fusión ya no está aplicada. Recarga la página.",
  fusion_superada: "Después de esta fusión hubo otra con el mismo tema, así que no la puedo deshacer.",
  fusion_sin_ideas: "Uno de los dos temas quedaría sin ideas, así que no la puedo deshacer.",
  tema_ya_fusionado: "Uno de esos temas ya se unió con otro. Recarga la página.",
  tema_inexistente: "Uno de esos temas ya no existe. Recarga la página.",
  par_no_rechazado: "Ese par ya no está en la lista. Recarga la página.",
}

/**
 * Refusal `pilares_cambiados` of `deshacer_fusion`: it names the winner, so it is not in the static map.
 * Federico's decision 2026-11-09: undo never overwrites pillar changes Coni made after the merge.
 */
export const pilaresCambiadosDe = (nombre: string) =>
  `Los pilares de «${nombre}» cambiaron después de unirlos. Para separarlos, deja primero los pilares como estaban.`
