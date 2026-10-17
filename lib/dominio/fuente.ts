import { AVISO_AVATAR } from "@/lib/dominio/revision"

/** Where a claim comes from: its author and, when WAV loaded them, the work's title and year. */
export interface Fuente {
  autor: string
  titulo: string | null
  anio: number | null
}

/** A claim as far as its source goes; `fuente` is absent on backings stored before sources existed. */
export interface ApoyoConFuente {
  deConi: boolean
  fuente?: Fuente | null
}

export const DE_CONI = "De Coni"
/** How many sources the line names before "y N más", and how many the texts may cite. */
export const FUENTES_NOMBRADAS = 2

const clave = (f: Fuente) => JSON.stringify([f.autor, f.titulo, f.anio])

/** Third-party sources, once each, in the order of the claims. */
export function fuentesAjenas(apoyos: readonly ApoyoConFuente[]): Fuente[] {
  const vistas = new Map<string, Fuente>()
  for (const apoyo of apoyos) {
    if (apoyo.deConi || !apoyo.fuente) continue
    if (!vistas.has(clave(apoyo.fuente))) vistas.set(clave(apoyo.fuente), apoyo.fuente)
  }
  return [...vistas.values()]
}

export function fuentesCitadas(apoyos: readonly ApoyoConFuente[]): Fuente[] {
  return fuentesAjenas(apoyos).slice(0, FUENTES_NOMBRADAS)
}

export function describirFuente({ autor, titulo, anio }: Fuente): string {
  if (titulo === null) return autor
  return anio === null ? `${autor} · ${titulo}` : `${autor} · ${titulo} (${anio})`
}

/** The line Coni reads under a hook or a script (spec decision 7, amendment 9). */
export function lineaDeFuente(apoyos: readonly ApoyoConFuente[]): string | null {
  if (apoyos.length === 0) return null
  const ajenas = fuentesAjenas(apoyos)
  if (ajenas.length === 0) return apoyos.every((a) => a.deConi) ? DE_CONI : null
  const nombradas = ajenas.slice(0, FUENTES_NOMBRADAS).map(describirFuente).join("; ")
  if (ajenas.length === 1) return `Fuente: ${nombradas}`
  const resto = ajenas.length - FUENTES_NOMBRADAS
  return `Fuentes: ${nombradas}${resto > 0 ? ` y ${resto} más` : ""}`
}

/** The caption carries the line right before the avatar notice, which must stay last (amendment 8). */
export function conLineaDeFuente(texto: string, linea: string | null): string {
  if (linea === null || linea === DE_CONI || texto.includes(linea)) return texto
  const aviso = texto.lastIndexOf(AVISO_AVATAR)
  if (aviso < 0) return `${texto.trimEnd()}\n\n${linea}`
  return `${texto.slice(0, aviso)}${linea}\n\n${texto.slice(aviso)}`
}
