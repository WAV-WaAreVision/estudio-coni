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

/**
 * Decision 1 of the spec: a merge waits for Coni when the two topics have a different main pillar in some network,
 * or when Claude is not sure. The reason is said to her on the page.
 */
export function esDelicada(a: readonly PrincipalDeRed[], b: readonly PrincipalDeRed[], seguro: boolean): Delicadeza {
  const distintas = REDES.filter((red) => {
    const deA = a.find((p) => p.red === red)?.pilarId
    const deB = b.find((p) => p.red === red)?.pilarId
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
