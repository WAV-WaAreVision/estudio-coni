/** A pillar as `categorias` stores it (`es_pilar`). Inactive ones stay for the ideas, materials and topics that use them. */
export interface DatosDePilar {
  slug: string
  nombre: string
  nombreCorto: string
  /** The one-line description the prompts read; null only for a retired pillar. */
  descripcion: string | null
  activa: boolean
  orden: number
}

export type CatalogoDePilares = readonly DatosDePilar[]

/** What a screen shows of a pillar: the slug stays for `data-pilar`, the names are for reading. */
export interface PilarVisible {
  slug: string
  nombre: string
  nombreCorto: string
}

export function soloActivos(catalogo: CatalogoDePilares): DatosDePilar[] {
  return catalogo.filter((pilar) => pilar.activa).toSorted((a, b) => a.orden - b.orden)
}

function buscar(catalogo: CatalogoDePilares, slug: string): DatosDePilar {
  const pilar = catalogo.find((candidato) => candidato.slug === slug)
  if (!pilar) throw new Error(`Pilar desconocido: ${slug}`)
  return pilar
}

/** Ideas point at pillar rows only (FK and trigger), so an unknown slug is a bug, not data to hide. */
export function pilarVisible(catalogo: CatalogoDePilares, slug: string): PilarVisible
export function pilarVisible(catalogo: CatalogoDePilares, slug: string | null | undefined): PilarVisible | null
export function pilarVisible(catalogo: CatalogoDePilares, slug: string | null | undefined): PilarVisible | null {
  if (slug == null) return null
  const { nombre, nombreCorto } = buscar(catalogo, slug)
  return { slug, nombre, nombreCorto }
}

export function nombreDePilar(catalogo: CatalogoDePilares, slug: string): string {
  return buscar(catalogo, slug).nombre
}

/** For `z.enum` and the tolerant enums of the prompts, which need at least one value. */
export function slugsActivos(catalogo: CatalogoDePilares): [string, ...string[]] {
  const [primero, ...resto] = soloActivos(catalogo).map((pilar) => pilar.slug)
  if (primero === undefined) throw new Error("No hay pilares activos.")
  return [primero, ...resto]
}
