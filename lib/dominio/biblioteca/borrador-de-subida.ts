import type { Rol, TipoDeMaterial } from "./modelo"
import {
  DEMASIADAS_IMAGENES,
  EXTENSIONES_POR_TIPO,
  extensionDe,
  MAXIMO_DE_IMAGENES,
  PESA_DEMASIADO,
  TAMANO_MAXIMO_BYTES,
} from "./subir"
import { esYoutube } from "./youtube"

export const RUTA_DE_SUBIR = "/biblioteca/subir"
/** The list reads `subido=1` and says the notice; every filter link drops it (D6). */
export const HREF_TRAS_SUBIR = "/biblioteca?subido=1"
export const AVISO_TRAS_SUBIR = "Lo estoy procesando."
export const PREPARANDO = "Preparando…"
export const GUARDANDO = "Guardando…"

/** A picked file as the form sees it: a `File` in the browser, a plain object in tests. */
export interface ArchivoElegido {
  name: string
  size: number
}

/** Everything the form holds, before it becomes the entry `leerEntrada` reads. */
export interface Borrador<A extends ArchivoElegido> {
  tipo: TipoDeMaterial
  /** The main field: a link, or a post's text. */
  texto: string
  archivos: readonly A[]
  videoDelPost: A | null
  transcripcion: string
  referencia: string
  titulo: string
  autorId: string
  rol: Rol | ""
  declaracion: boolean
}

/** The shape `leerEntrada` reads; the server receives exactly this. */
export interface EntradaDeSubida {
  tipo: TipoDeMaterial
  titulo: string
  autorId: string
  rol: Rol | ""
  declaracion: boolean
  url: string
  textoPegado: string
  referencia: string
  archivos: { nombre: string; tamano: number }[]
}

/** Only what the type uses is sent; `aSubir` is in the order of the signed uploads. */
export function armarEntrada<A extends ArchivoElegido>(
  borrador: Borrador<A>,
): { entrada: EntradaDeSubida; aSubir: A[] } {
  const { tipo } = borrador
  const aSubir =
    tipo === "post"
      ? borrador.videoDelPost
        ? [borrador.videoDelPost]
        : []
      : tipo === "link"
        ? []
        : [...borrador.archivos]
  const url = tipo === "link" ? borrador.texto.trim() : ""
  const textoPegado = tipo === "post" ? borrador.texto : tipo === "link" && esYoutube(url) ? borrador.transcripcion : ""
  return {
    entrada: {
      tipo,
      titulo: borrador.titulo,
      autorId: borrador.autorId,
      rol: borrador.rol,
      declaracion: borrador.declaracion,
      url,
      textoPegado,
      referencia: tipo === "video" || tipo === "imagen" ? borrador.referencia : "",
      archivos: aSubir.map((archivo) => ({ nombre: archivo.name, tamano: archivo.size })),
    },
    aSubir,
  }
}

const sonImagenes = (archivos: readonly ArchivoElegido[]) =>
  archivos.length > 0 && archivos.every((archivo) => EXTENSIONES_POR_TIPO.imagen.includes(extensionDe(archivo.name)))

/**
 * Images picked again join the ones there (up to 20); anything else replaces them. A file over 2 GB never enters,
 * and a pick where nothing fits leaves what she had. When both limits are hit she reads both.
 */
export function juntarArchivos<A extends ArchivoElegido>(
  actuales: readonly A[],
  elegidos: readonly A[],
): { archivos: A[]; error: string | null } {
  const caben = elegidos.filter((archivo) => archivo.size <= TAMANO_MAXIMO_BYTES)
  const pesaDemasiado = caben.length < elegidos.length
  if (caben.length === 0) return { archivos: [...actuales], error: pesaDemasiado ? PESA_DEMASIADO : null }
  const juntos = sonImagenes(actuales) && sonImagenes(caben) ? [...actuales, ...caben] : caben
  const sobran = juntos.length > MAXIMO_DE_IMAGENES && sonImagenes(juntos)
  const errores = [sobran ? DEMASIADAS_IMAGENES : null, pesaDemasiado ? PESA_DEMASIADO : null].filter(
    (error): error is string => error !== null,
  )
  return {
    archivos: sobran ? juntos.slice(0, MAXIMO_DE_IMAGENES) : juntos,
    error: errores.length > 0 ? errores.join(" ") : null,
  }
}

/** The images keep the order she gives them: that order is `orden` 1..20 in the store. */
export function moverArchivo<T>(lista: readonly T[], indice: number, hacia: -1 | 1): T[] {
  const destino = indice + hacia
  const copia = [...lista]
  if (destino < 0 || destino >= lista.length) return copia
  const [movido] = copia.splice(indice, 1)
  if (movido !== undefined) copia.splice(destino, 0, movido)
  return copia
}

export function progresoDeSubida(hechos: number, total: number): string {
  return total === 0 ? GUARDANDO : `Subiendo ${Math.min(hechos + 1, total)} de ${total}`
}

export function vieneDeSubir(params: Record<string, string | string[] | undefined>): boolean {
  const valor = params.subido
  return (Array.isArray(valor) ? valor[0] : valor) === "1"
}
