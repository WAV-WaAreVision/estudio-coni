import { NOMBRE_DE_RED, type Red } from "@/lib/dominio/pilares"
import { type FilaDeVocabulario, type Lista, MARCAS, type Marca, type ValorDeLista } from "@/lib/dominio/vocabulario"
import { ETIQUETA_SIN_CLASIFICAR } from "./ganchos"
import { PALABRAS } from "./palabras"

/** Change 6c-1: the tags Coni sees and corrects on a claim's page, named as 20261114000800's functions name them. */
export const CAMPOS = [
  "tipo",
  "evidencia",
  "problema",
  "solucion",
  "emocion",
  "publico",
  "dato",
  "caso",
  "tipo_de_gancho",
] as const
export type CampoDeEtiqueta = (typeof CAMPOS)[number]
export type RedDeEtiqueta = Red | "todas"

/** The marks read per network; dato and caso are one for both networks (red `todas`). */
export const MARCAS_POR_RED = ["problema", "solucion", "emocion", "publico"] as const
export type MarcaPorRed = (typeof MARCAS_POR_RED)[number]

const MARCAS_COMO_TEXTO: readonly string[] = MARCAS
export const esMarca = (campo: CampoDeEtiqueta): campo is Marca => MARCAS_COMO_TEXTO.includes(campo)

/** Evidencia is a word for WAV only (palabras.ts): Coni reads «Qué la respalda». */
export const NOMBRE_DE_CAMPO: Record<CampoDeEtiqueta, string> = {
  tipo: PALABRAS.tiposDeAfirmacion,
  evidencia: "Qué la respalda",
  problema: "Problema",
  solucion: "Solución",
  emocion: "Emoción",
  publico: "Público",
  dato: "Dato",
  caso: "Caso",
  tipo_de_gancho: "Tipo de gancho",
}

export function tituloDeEtiqueta(campo: CampoDeEtiqueta, red: RedDeEtiqueta): string {
  return red === "todas" ? NOMBRE_DE_CAMPO[campo] : `${NOMBRE_DE_CAMPO[campo]} en ${NOMBRE_DE_RED[red]}`
}

/** A value of a vigente list; a retired one stays, inactive, so the tags that still carry it keep their label. */
export interface ValorDeCatalogo extends ValorDeLista {
  activo: boolean
}

export interface CatalogoDeEtiquetas {
  tipo: ValorDeCatalogo[]
  evidencia: ValorDeCatalogo[]
  publico: Record<Red, ValorDeCatalogo[]>
  dolor: Record<Red, ValorDeCatalogo[]>
  emocion: ValorDeCatalogo[]
  gancho: ValorDeCatalogo[]
}

export function catalogoDeFilas(filas: readonly FilaDeVocabulario[]): CatalogoDeEtiquetas {
  const buscar = (lista: Lista, red: RedDeEtiqueta): ValorDeCatalogo[] => {
    const fila = filas.find((f) => f.lista === lista && f.red === red)
    if (!fila) throw new Error(`No hay una lista vigente de ${lista} para ${red}`)
    return fila.valores.map(({ valor, etiqueta, descripcion, grupo, activacion, retirado }) => ({
      valor,
      etiqueta,
      ...(descripcion != null && { descripcion }),
      ...(grupo != null && { grupo }),
      ...(activacion != null && { activacion }),
      activo: !retirado,
    }))
  }
  return {
    tipo: buscar("tipo", "todas"),
    evidencia: buscar("evidencia", "todas"),
    publico: { linkedin: buscar("publico", "linkedin"), instagram: buscar("publico", "instagram") },
    dolor: { linkedin: buscar("dolor", "linkedin"), instagram: buscar("dolor", "instagram") },
    emocion: buscar("emocion", "todas"),
    gancho: buscar("gancho", "todas"),
  }
}

// The only labels in code: values that are not list values (spec 6b and 6a's fallbacks).
const ETIQUETA_OTRO = "Otro"
const ETIQUETA_NINGUNO = "Ninguno de la lista"
const FUERA_DE_LISTA: Readonly<Record<string, string>> = {
  sin_clasificar: ETIQUETA_SIN_CLASIFICAR,
  otro: ETIQUETA_OTRO,
  ninguno: ETIQUETA_NINGUNO,
}
export const YA_NO_ESTA = "Un valor que ya no está en la lista"

function valoresDe(catalogo: CatalogoDeEtiquetas, campo: CampoDeEtiqueta, red: RedDeEtiqueta): ValorDeCatalogo[] {
  const deRed = (porRed: Record<Red, ValorDeCatalogo[]>) => (red === "instagram" ? porRed.instagram : porRed.linkedin)
  switch (campo) {
    case "tipo":
      return catalogo.tipo
    case "evidencia":
      return catalogo.evidencia
    case "emocion":
      return catalogo.emocion
    case "tipo_de_gancho":
      return catalogo.gancho
    case "problema":
    case "solucion":
      return deRed(catalogo.dolor)
    case "publico":
      return deRed(catalogo.publico)
    case "dato":
    case "caso":
      return []
  }
}

/** What a tag says: the list's label, a fixed one for the values outside the lists; dato and caso say their own. */
export function etiquetaDe(
  catalogo: CatalogoDeEtiquetas,
  campo: CampoDeEtiqueta,
  red: RedDeEtiqueta,
  valor: string,
): string {
  if (campo === "dato" || campo === "caso") return valor
  return valoresDe(catalogo, campo, red).find((v) => v.valor === valor)?.etiqueta ?? FUERA_DE_LISTA[valor] ?? YA_NO_ESTA
}

export interface OpcionDeEtiqueta {
  valor: string
  etiqueta: string
  detalle: string | null
}

export interface GrupoDeOpciones {
  /** Null when the list is one group: the editor uses the tag's own name. */
  titulo: string | null
  opciones: OpcionDeEtiqueta[]
}

// Coni's four emotion groups (emociones.md); the vocabulary has the group of each value, not a title.
const GRUPOS_DE_EMOCION = [
  ["problema", "Problema"],
  ["puente", "Puente"],
  ["solucion", "Solución"],
  ["respaldo", "Respaldo"],
] as const

function comoOpcion(v: ValorDeCatalogo): OpcionDeEtiqueta {
  const partes = [v.activacion ? `Activación ${v.activacion}.` : null, v.descripcion ?? null].filter(
    (parte): parte is string => parte !== null,
  )
  return { valor: v.valor, etiqueta: v.etiqueta, detalle: partes.length > 0 ? partes.join(" ") : null }
}

/** What she can choose: the active values (retired ones never), emotions by group, plus the fallbacks the field takes. */
export function opcionesDe(
  catalogo: CatalogoDeEtiquetas,
  campo: CampoDeEtiqueta,
  red: RedDeEtiqueta,
): GrupoDeOpciones[] {
  const activos = valoresDe(catalogo, campo, red).filter((v) => v.activo)
  if (campo === "dato" || campo === "caso") return []
  if (campo === "emocion")
    return GRUPOS_DE_EMOCION.flatMap(([grupo, titulo]) => {
      const opciones = activos.filter((v) => v.grupo === grupo).map(comoOpcion)
      return opciones.length > 0 ? [{ titulo, opciones }] : []
    })
  const opciones = activos.map(comoOpcion)
  if (campo === "problema" || campo === "solucion" || campo === "publico")
    opciones.push({ valor: "otro", etiqueta: ETIQUETA_OTRO, detalle: "Cuando nada calza. Pide una línea de por qué." })
  if (campo === "tipo_de_gancho") opciones.push({ valor: "ninguno", etiqueta: ETIQUETA_NINGUNO, detalle: null })
  return [{ titulo: null, opciones }]
}

export const pidePorQue = (valor: string): boolean => valor === "otro" || valor === "otra"
