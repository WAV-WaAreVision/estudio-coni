import { NOMBRE_DE_RED, REDES, type Red } from "@/lib/dominio/pilares"
import {
  type Certeza,
  type FilaDeVocabulario,
  type Lista,
  MARCAS,
  type Marca,
  type ValorDeLista,
} from "@/lib/dominio/vocabulario"
import type { Ubicacion } from "./ficha"
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

export type Origen = "extraccion" | "traduccion" | "coni"
export const ACCIONES = ["confirma", "corrige", "agrega", "quita"] as const
export type Accion = (typeof ACCIONES)[number]

export interface MarcaLeida {
  id: string
  marca: Marca
  red: RedDeEtiqueta
  valor: string
  frase: string | null
  certeza: Certeza
  porQue: string | null
  origen: Origen
}

export interface GanchoLeido {
  fraseExacta: string
  fraseSinGancho: string
  tipo: string
  certeza: Certeza
  origen: Origen
}

export interface CorreccionLeida {
  campo: CampoDeEtiqueta
  red: RedDeEtiqueta
  accion: Accion
  creadaEn: string
}

/** A claim as its page shows it (spec 6c-1). */
export interface AfirmacionLeida {
  id: string
  texto: string
  cita: string
  tipo: string
  evidencia: string
  ubicacion: Ubicacion | null
  material: { id: string; titulo: string | null }
  autor: { id: string; nombre: string } | null
  tema: { id: string; nombre: string } | null
  /** Marked once by 20261114000800: it existed before 6c-1 with no marks and no hook row (change 7 turns it off). */
  etiquetasAntiguas: boolean
  /** The free text from before 6a: an old claim's only reference until change 7 fills its marks. */
  textoAntiguo: { publico: string | null; dolor: string | null; emocion: string | null; gancho: string | null }
  marcas: MarcaLeida[]
  gancho: GanchoLeido | null
  correcciones: CorreccionLeida[]
}

/** Old only when the migration marked it so; every claim extracted after 6c-1 is new, even with zero marks (decision 3). */
export const esAfirmacionNueva = (afirmacion: Pick<AfirmacionLeida, "etiquetasAntiguas">): boolean =>
  !afirmacion.etiquetasAntiguas

export type MarcasDeRed = Record<MarcaPorRed, MarcaLeida[]>

export interface MarcasAgrupadas {
  linkedin: MarcasDeRed
  instagram: MarcasDeRed
  dato: MarcaLeida[]
  caso: MarcaLeida[]
}

const sinMarcas = (): MarcasDeRed => ({ problema: [], solucion: [], emocion: [], publico: [] })

export function agruparMarcas(marcas: readonly MarcaLeida[]): MarcasAgrupadas {
  const grupos: MarcasAgrupadas = { linkedin: sinMarcas(), instagram: sinMarcas(), dato: [], caso: [] }
  for (const marca of marcas) {
    if (marca.marca === "dato" || marca.marca === "caso") grupos[marca.marca].push(marca)
    // The extraction splits a per-network mark in one per network (marcasNormalizadas): a `todas` row has no place.
    else if (marca.red !== "todas") grupos[marca.red][marca.marca].push(marca)
  }
  return grupos
}

export const CORREGIDA_POR_TI = "Corregida por ti"
export const CONFIRMADA_POR_TI = "Confirmada por ti"

/** What the latest of her actions on that field and network says; a removal says nothing (the row is gone). */
export function revisionDe(
  correcciones: readonly CorreccionLeida[],
  campo: CampoDeEtiqueta,
  red: RedDeEtiqueta,
): string | null {
  const ultima = correcciones
    .filter((c) => c.campo === campo && c.red === red && c.accion !== "quita")
    .reduce<CorreccionLeida | null>(
      (masNueva, c) => (masNueva === null || Date.parse(c.creadaEn) > Date.parse(masNueva.creadaEn) ? c : masNueva),
      null,
    )
  if (ultima === null) return null
  return ultima.accion === "confirma" ? CONFIRMADA_POR_TI : CORREGIDA_POR_TI
}

export interface EmocionDeIdea {
  afirmacionId: string
  red: RedDeEtiqueta
  valor: string
  certeza: Certeza
  origen: Origen
}

/** The short badges of an idea in a list (spec 6c-1): tipo, evidencia and one emotion per network. */
export interface Insignias {
  tipo: string
  evidencia: string
  emociones: { red: Red; etiqueta: string }[]
}

const RANGO_DE_CERTEZA: Record<Certeza, number> = { alta: 0, media: 1, baja: 2 }

/** Per network, Coni's own emotion first, then the most certain, then the oldest (plan decision 10). */
export function insigniasDeIdea(
  idea: { tipo: string; evidencia: string },
  emociones: readonly EmocionDeIdea[],
  catalogo: CatalogoDeEtiquetas,
): Insignias {
  return {
    tipo: etiquetaDe(catalogo, "tipo", "todas", idea.tipo),
    evidencia: etiquetaDe(catalogo, "evidencia", "todas", idea.evidencia),
    emociones: REDES.flatMap((red) => {
      const elegida = emociones
        .filter((emocion) => emocion.red === red)
        .toSorted(
          (a, b) =>
            Number(b.origen === "coni") - Number(a.origen === "coni") ||
            RANGO_DE_CERTEZA[a.certeza] - RANGO_DE_CERTEZA[b.certeza],
        )[0]
      return elegida ? [{ red, etiqueta: etiquetaDe(catalogo, "emocion", red, elegida.valor) }] : []
    }),
  }
}

export function insigniasPorIdea(
  ideas: readonly { id: string; tipo: string; evidencia: string }[],
  emociones: readonly EmocionDeIdea[],
  catalogo: CatalogoDeEtiquetas,
): Map<string, Insignias> {
  return new Map(
    ideas.map((idea) => [
      idea.id,
      insigniasDeIdea(
        idea,
        emociones.filter((emocion) => emocion.afirmacionId === idea.id),
        catalogo,
      ),
    ]),
  )
}

export const RUTA_DE_AFIRMACIONES = "/biblioteca/afirmaciones"

export const hrefDeAfirmacion = (id: string, desde?: string): string =>
  desde ? `${RUTA_DE_AFIRMACIONES}/${id}?desde=${encodeURIComponent(desde)}` : `${RUTA_DE_AFIRMACIONES}/${id}`

// Only a Biblioteca page of one author, topic, material or hook: anything else in the address is ignored.
const DESDE = /^\/biblioteca\/(autores|temas|materiales|ganchos)\/[0-9a-f-]{36}$/
const VOLVER_A: Readonly<Record<string, string>> = {
  autores: "Autor",
  temas: "Tema",
  materiales: "Material",
  ganchos: "Gancho",
}

/** «Volver» to the page that opened the claim, else to its material (plan decision 11). */
export function volverDesde(
  consulta: Record<string, string | string[] | undefined>,
  materialId: string,
): { href: string; texto: string } {
  const pedido = Array.isArray(consulta.desde) ? consulta.desde[0] : consulta.desde
  const seccion = pedido ? DESDE.exec(pedido)?.[1] : undefined
  const texto = seccion ? VOLVER_A[seccion] : undefined
  return pedido && texto ? { href: pedido, texto } : { href: `/biblioteca/materiales/${materialId}`, texto: "Material" }
}

export const ELIGE_UN_VALOR = "Elige un valor de la lista."
export const FALTA_FRASE = "Escribe la frase."
export const FALTA_POR_QUE = "Escribe en una línea por qué."
export const CERTEZA_BAJA = "Certeza baja"
export const AVISO_DE_REPROCESO = "Llegan al reprocesar la Biblioteca"

/**
 * The refusals of corregir_etiqueta, confirmar_etiqueta and quitar_marca she can cause, in her words.
 * `solo_coni_corrige` is the session's (ERROR_SOLO_CONI); `campo_desconocido` and `red_invalida` only a bug causes.
 */
export const RECHAZOS_DE_ETIQUETA: Readonly<Record<string, string>> = {
  afirmacion_antigua: "Las marcas de esta idea llegan al reprocesar la Biblioteca.",
  afirmacion_inexistente: "Esa idea ya no está en la Biblioteca.",
  valor_fuera_de_lista: "Ese valor ya no está en la lista. Recarga la página.",
  falta_por_que: FALTA_POR_QUE,
  falta_frase: FALTA_FRASE,
  sin_gancho: "Esta idea no tiene gancho.",
  sin_marca: "Esa marca ya no está. Recarga la página.",
  marca_ambigua: "Hay más de una marca así. Recarga la página.",
}
