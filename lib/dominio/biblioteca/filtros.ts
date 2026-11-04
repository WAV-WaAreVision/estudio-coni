import { z } from "zod"
import { ROLES, type Rol, TIPOS_DE_MATERIAL, type TipoDeMaterial } from "./modelo"

export const RUTA_DE_MATERIALES = "/biblioteca"

export const ESTADOS_DE_MATERIAL = ["procesando", "listo", "fallido"] as const
export type EstadoDeMaterial = (typeof ESTADOS_DE_MATERIAL)[number]

export interface FiltrosDeMateriales {
  autor?: string
  rol?: Rol
  tipo?: TipoDeMaterial
  estado?: EstadoDeMaterial
}

type Params = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

function leer<T>(esquema: z.ZodType<T>, valor: string | string[] | undefined): T | undefined {
  const leido = esquema.safeParse(primero(valor)?.trim())
  return leido.success ? leido.data : undefined
}

/** The filters of the list from the URL's search params; whatever is not a valid value is ignored, never an error. */
export function leerFiltros(params: Params): FiltrosDeMateriales {
  const filtros: FiltrosDeMateriales = {}
  const autor = leer(z.uuid(), params.autor)
  const rol = leer(z.enum(ROLES), params.rol)
  const tipo = leer(z.enum(TIPOS_DE_MATERIAL), params.tipo)
  const estado = leer(z.enum(ESTADOS_DE_MATERIAL), params.estado)
  if (autor) filtros.autor = autor
  if (rol) filtros.rol = rol
  if (tipo) filtros.tipo = tipo
  if (estado) filtros.estado = estado
  return filtros
}

/** The row open in the desktop side panel: `?m=<id>` on Materiales, `?a=` on Autores, `?t=` on Temas (D4). */
export function leerSeleccion(params: Params, clave = "m"): string | null {
  return leer(z.uuid(), params[clave]) ?? null
}

export function hayFiltros(filtros: FiltrosDeMateriales): boolean {
  return Object.values(filtros).some(Boolean)
}

/** The filters folded under "Más filtros": the state has its own quick buttons. */
export function hayFiltrosPlegados(filtros: FiltrosDeMateriales): boolean {
  return Boolean(filtros.autor || filtros.rol || filtros.tipo)
}

const ORDEN = ["autor", "rol", "tipo", "estado"] as const

/** The list's address with these filters (and the side panel open on `seleccion`): linkable, Back undoes it. */
export function hrefDeLista(filtros: FiltrosDeMateriales, seleccion: string | null = null): string {
  const params = new URLSearchParams()
  for (const clave of ORDEN) {
    const valor = filtros[clave]
    if (valor) params.set(clave, valor)
  }
  if (seleccion) params.set("m", seleccion)
  const consulta = params.toString()
  return consulta ? `${RUTA_DE_MATERIALES}?${consulta}` : RUTA_DE_MATERIALES
}
