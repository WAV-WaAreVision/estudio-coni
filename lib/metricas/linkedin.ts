import { lunesDeLaSemana } from "@/lib/dominio/metricas"

// What WAV has to note on LinkedIn each week, and how its fields are read (spec 2026-10-17, decisions 19 and 20).

/** Posts published in the last four weeks are asked for (amendment A10). */
export const SEMANAS_POR_ANOTAR = 4

export interface PublicacionEnLinkedin {
  piezaId: string
  titulo: string
  /** ISO instant. */
  publicadoEn: string
}

export interface NumerosDeLaSemana {
  impresiones: number | null
  reacciones: number | null
  comentarios: number | null
  compartidos: number | null
}

export interface PostPorAnotar extends PublicacionEnLinkedin {
  /** What she noted this week, to correct; null when this week has no row yet. */
  estaSemana: NumerosDeLaSemana | null
}

/**
 * The posts of the last four weeks (amendment A10), newest first. One noted by hand this week stays, with its numbers,
 * to be corrected; one whose row of this week came from the API or Metricool is not hers to change and leaves the list.
 */
export function postsPorAnotar(entrada: {
  posts: readonly PublicacionEnLinkedin[]
  /** The newest row of each post. */
  medidos: readonly ({ piezaId: string; medidoEn: string; origen: string } & NumerosDeLaSemana)[]
  ahora: number
  zona: string
}): PostPorAnotar[] {
  const semana = lunesDeLaSemana(entrada.ahora, entrada.zona)
  const desde = entrada.ahora - SEMANAS_POR_ANOTAR * 7 * 86_400_000
  const deEstaSemana = new Map(entrada.medidos.filter((m) => m.medidoEn >= semana).map((m) => [m.piezaId, m]))
  return entrada.posts
    .flatMap((post): PostPorAnotar[] => {
      const instante = Date.parse(post.publicadoEn)
      if (instante < desde || instante > entrada.ahora) return []
      const fila = deEstaSemana.get(post.piezaId)
      if (!fila) return [{ ...post, estaSemana: null }]
      if (fila.origen !== "manual") return []
      const { impresiones, reacciones, comentarios, compartidos } = fila
      return [{ ...post, estaSemana: { impresiones, reacciones, comentarios, compartidos } }]
    })
    .sort((a, b) => Date.parse(b.publicadoEn) - Date.parse(a.publicadoEn))
}

/** The posts still waiting for this week's numbers: what the Monday reminder counts. */
export function sinNumerosEstaSemana(posts: readonly PostPorAnotar[]): PostPorAnotar[] {
  return posts.filter((post) => post.estaSemana === null)
}

export function asuntoDelRecordatorio(cuantos: number): string {
  return `Anota los números de LinkedIn (${cuantos} ${cuantos === 1 ? "post" : "posts"})`
}

export interface CamposDePost {
  impresiones: string
  reacciones: string
  comentarios: string
  compartidos: string
}

export const CAMPOS_DE_POST: readonly { campo: keyof CamposDePost; etiqueta: string }[] = [
  { campo: "impresiones", etiqueta: "Impresiones" },
  { campo: "reacciones", etiqueta: "Reacciones" },
  { campo: "comentarios", etiqueta: "Comentarios" },
  { campo: "compartidos", etiqueta: "Compartidos" },
]

export interface NumerosDePost {
  piezaId: string
  impresiones: number
  reacciones: number
  comentarios: number
  compartidos: number
}

export interface Anotacion {
  posts: NumerosDePost[]
  seguidores: number | null
}

/** Plain digits ("1200") or dot thousands groups ("1.200", as LinkedIn and Chile write them). */
const CIFRA = /^(\d{1,9}|\d{1,3}(\.\d{3}){1,2})$/

/** "1200" or "1.200" is 1200; empty is null; anything else ("1.2", "1 200", "-3") is not a count. */
export function leerCifra(texto: string): number | null | "invalida" {
  const limpio = texto.trim()
  if (limpio === "") return null
  if (!CIFRA.test(limpio)) return "invalida"
  return Number(limpio.replaceAll(".", ""))
}

/** The field an error points at: one figure of a post, or the followers. */
export type CampoConError = { piezaId: string; campo: keyof CamposDePost } | "seguidores"

export function armarAnotacion(
  posts: readonly { piezaId: string; titulo: string; campos: CamposDePost }[],
  seguidores: string,
): { ok: true; anotacion: Anotacion } | { ok: false; error: string; campo?: CampoConError } {
  const listos: NumerosDePost[] = []
  for (const post of posts) {
    if (CAMPOS_DE_POST.every(({ campo }) => post.campos[campo].trim() === "")) continue
    const numeros: Partial<Record<keyof CamposDePost, number>> = {}
    let vacio: keyof CamposDePost | null = null
    for (const { campo } of CAMPOS_DE_POST) {
      const cifra = leerCifra(post.campos[campo])
      if (cifra === "invalida") {
        return {
          ok: false,
          error: `Las cifras de «${post.titulo}» van como número, sin letras ni signos.`,
          campo: { piezaId: post.piezaId, campo },
        }
      }
      if (cifra === null) vacio ??= campo
      else numeros[campo] = cifra
    }
    const { impresiones, reacciones, comentarios, compartidos } = numeros
    if (
      vacio !== null ||
      impresiones === undefined ||
      reacciones === undefined ||
      comentarios === undefined ||
      compartidos === undefined
    ) {
      return {
        ok: false,
        error: `Completa los cuatro números de «${post.titulo}» o déjalos todos vacíos.`,
        campo: { piezaId: post.piezaId, campo: vacio ?? "impresiones" },
      }
    }
    listos.push({ piezaId: post.piezaId, impresiones, reacciones, comentarios, compartidos })
  }
  const cuenta = leerCifra(seguidores)
  if (cuenta === "invalida") {
    return { ok: false, error: "Los seguidores van como un número, sin letras.", campo: "seguidores" }
  }
  if (listos.length === 0 && cuenta === null) return { ok: false, error: "Anota al menos un post o los seguidores." }
  return { ok: true, anotacion: { posts: listos, seguidores: cuenta } }
}
