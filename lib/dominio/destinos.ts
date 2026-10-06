export const DESTINOS = ["instagram", "linkedin"] as const
export type Destino = (typeof DESTINOS)[number]
export const ESTADOS_DE_PUBLICACION = ["esperando", "para_subir", "subido_a_mano", "publicado"] as const
export type EstadoDePublicacion = (typeof ESTADOS_DE_PUBLICACION)[number]

export interface Publicacion {
  destino: Destino
  estado: EstadoDePublicacion
}

/** A row of `publicaciones` as the screens read it: where the post is, when she pasted its link. */
export interface PublicacionConEnlace extends Publicacion {
  enlace: string | null
}

const NOMBRE: Record<Destino, string> = { instagram: "Instagram", linkedin: "LinkedIn" }

export function esDestino(valor: string): valor is Destino {
  return (DESTINOS as readonly string[]).includes(valor)
}

export function esEstadoDePublicacion(valor: string): valor is EstadoDePublicacion {
  return (ESTADOS_DE_PUBLICACION as readonly string[]).includes(valor)
}

export function destinosValidos(valores: readonly string[]): valores is readonly Destino[] {
  return valores.length > 0 && valores.every(esDestino) && new Set(valores).size === valores.length
}

/** The stored order, also the order inside the gate-2 hash: Instagram first. */
export function canonicos(destinos: readonly Destino[]): Destino[] {
  return DESTINOS.filter((destino) => destinos.includes(destino))
}

export function nombreDeDestino(destino: Destino): string {
  return NOMBRE[destino]
}

export function nombreDeDestinos(destinos: readonly Destino[]): string {
  return canonicos(destinos).map(nombreDeDestino).join(" y ")
}

/** What still waits for Coni among the rows of a piece, and whether any destination goes by hand. */
export function resumenDePublicaciones(publicaciones: readonly Publicacion[]) {
  const pendientes = canonicos(
    publicaciones.filter((p) => p.estado === "esperando" || p.estado === "para_subir").map((p) => p.destino),
  )
  return {
    pendientes,
    todosListos: pendientes.length === 0,
    algunoAMano: publicaciones.some((p) => p.estado === "subido_a_mano" || p.estado === "para_subir"),
  }
}
