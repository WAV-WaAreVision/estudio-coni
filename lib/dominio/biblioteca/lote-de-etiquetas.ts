import {
  type AfirmacionLeida,
  type CampoDeEtiqueta,
  type CatalogoDeEtiquetas,
  esMarca,
  etiquetaDe,
  type GrupoDeOpciones,
  hrefDeAfirmacion,
  opcionesDe,
  type RedDeEtiqueta,
  revisionDe,
  tituloDeEtiqueta,
} from "./etiquetas-de-afirmacion"

/** Change 6c-2: why a tag is in the week's batch, in the order a batch is filled (20261114000900). */
export const MOTIVOS_DE_DUDA = ["sin_clasificar", "otro", "gancho", "certeza_baja"] as const
export type MotivoDeDuda = (typeof MOTIVOS_DE_DUDA)[number]

/** One row of `lote_de_la_semana()`. */
export interface ItemDeLote {
  posicion: number
  afirmacionId: string
  campo: CampoDeEtiqueta
  red: RedDeEtiqueta
  /** The mark's row; null for tipo, evidencia and the hook, and for a mark that was removed. */
  marcaId: string | null
  motivo: MotivoDeDuda
  /** No longer doubtful: Coni confirmed or corrected it, the mark was removed, or the tipo left sin_clasificar. */
  hecha: boolean
}

export const RUTA_DE_REVISION_DE_ETIQUETAS = "/biblioteca/etiquetas/revisar"

export const TEXTOS_DE_REVISION = {
  titulo: "Etiquetas para revisar",
  listo: "Listo por esta semana. El próximo lote llega el lunes.",
  vacio: "No hay etiquetas dudosas esta semana.",
  error: "No pude cargar las etiquetas. Vuelve a intentarlo en un rato.",
  verAfirmacion: "Ver la afirmación",
  yaNoEsta: "Ya no está",
  yaNoEstaPendiente: "Ya no está pendiente",
} as const

export function porQueEstaAqui(motivo: MotivoDeDuda, porQue: string | null): string {
  switch (motivo) {
    case "certeza_baja":
      return "Claude no estaba segura"
    case "otro":
      return porQue ? `Quedó en Otro: ${porQue}` : "Quedó en Otro"
    case "gancho":
      return "Tipo de gancho sugerido"
    case "sin_clasificar":
      return "Quedó sin clasificar"
  }
}

/** Inicio's count, on cards like the page: a pending item without a card (its claim hidden) is not counted. */
export const pendientesDeLote = (tarjetas: readonly TarjetaDeEtiqueta[]): number =>
  tarjetas.filter((t) => t.estado === "pendiente").length

/**
 * «2 de 5»: the done cards over the cards drawn. Counted on cards, not items: a done item without a card (its claim
 * hidden after the batch was built) would make the counter disagree with the page.
 */
export function progresoDeLote(tarjetas: readonly TarjetaDeEtiqueta[]): string {
  return `${tarjetas.filter((t) => t.estado === "hecha").length} de ${tarjetas.length}`
}

export function lineaDeEtiquetasPorRevisar(pendientes: number): string {
  return pendientes === 1 ? "Tienes 1 etiqueta para revisar" : `Tienes ${pendientes} etiquetas para revisar`
}

interface Comun {
  posicion: number
  afirmacionId: string
  /** The claim's text; the card shortens it with CSS. */
  texto: string
  autor: string | null
  /** «Emoción en LinkedIn»: names the tag and, for a per-network mark, its network. */
  titulo: string
  frase: string | null
  /** The claim's page, with the way back to the batch. */
  href: string
}

export interface TarjetaPendiente extends Comun {
  estado: "pendiente"
  campo: CampoDeEtiqueta
  red: RedDeEtiqueta
  marcaId: string | null
  valor: string
  etiqueta: string
  porQue: string | null
  certezaBaja: boolean
  /** Why it is here, in her words. */
  motivo: string
  opciones: GrupoDeOpciones[]
  conFrase: boolean
  /** A value the list no longer offers (sin_clasificar, a retired one) cannot be confirmed: only «Cambiar». */
  confirmable: boolean
}

export interface TarjetaHecha extends Comun {
  estado: "hecha"
  /** Null when the mark was removed. */
  etiqueta: string | null
  revision: string
}

export type TarjetaDeEtiqueta = TarjetaPendiente | TarjetaHecha

interface Actual {
  valor: string
  frase: string | null
  porQue: string | null
  certezaBaja: boolean
}

/** What the tag says now on the claim; null when its mark or hook is gone. */
function actualDe(item: ItemDeLote, afirmacion: AfirmacionLeida): Actual | null {
  if (esMarca(item.campo)) {
    const marca = item.marcaId ? afirmacion.marcas.find((m) => m.id === item.marcaId) : undefined
    return marca
      ? { valor: marca.valor, frase: marca.frase, porQue: marca.porQue, certezaBaja: marca.certeza === "baja" }
      : null
  }
  if (item.campo === "tipo_de_gancho") {
    const gancho = afirmacion.gancho
    return gancho
      ? { valor: gancho.tipo, frase: gancho.fraseExacta, porQue: null, certezaBaja: gancho.certeza === "baja" }
      : null
  }
  const valor = item.campo === "tipo" ? afirmacion.tipo : afirmacion.evidencia
  return { valor, frase: null, porQue: null, certezaBaja: false }
}

/** One card of the batch (spec 6c-2); null when there is nothing to show (claim gone, pending mark gone). */
export function tarjetaDeItem(
  item: ItemDeLote,
  afirmacion: AfirmacionLeida | null,
  catalogo: CatalogoDeEtiquetas,
): TarjetaDeEtiqueta | null {
  if (afirmacion === null) return null
  const actual = actualDe(item, afirmacion)
  const comun: Comun = {
    posicion: item.posicion,
    afirmacionId: afirmacion.id,
    texto: afirmacion.texto,
    autor: afirmacion.autor?.nombre ?? null,
    titulo: tituloDeEtiqueta(item.campo, item.red),
    frase: actual?.frase ?? null,
    href: hrefDeAfirmacion(afirmacion.id, RUTA_DE_REVISION_DE_ETIQUETAS),
  }
  if (item.hecha) {
    if (actual === null) return { ...comun, estado: "hecha", etiqueta: null, revision: TEXTOS_DE_REVISION.yaNoEsta }
    return {
      ...comun,
      estado: "hecha",
      etiqueta: etiquetaDe(catalogo, item.campo, item.red, actual.valor),
      revision:
        revisionDe(afirmacion.correcciones, item.campo, item.red, item.marcaId) ?? TEXTOS_DE_REVISION.yaNoEstaPendiente,
    }
  }
  if (actual === null) return null
  const opciones = opcionesDe(catalogo, item.campo, item.red)
  return {
    ...comun,
    estado: "pendiente",
    campo: item.campo,
    red: item.red,
    marcaId: item.marcaId,
    valor: actual.valor,
    etiqueta: etiquetaDe(catalogo, item.campo, item.red, actual.valor),
    porQue: actual.porQue,
    certezaBaja: actual.certezaBaja,
    motivo: porQueEstaAqui(item.motivo, actual.porQue),
    opciones,
    conFrase: esMarca(item.campo),
    confirmable:
      opciones.length === 0 || opciones.some((grupo) => grupo.opciones.some((o) => o.valor === actual.valor)),
  }
}
