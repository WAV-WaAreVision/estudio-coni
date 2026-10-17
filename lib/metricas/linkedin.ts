import { lunesDeLaSemana } from "@/lib/dominio/metricas"

// What WAV has to note on LinkedIn each week, and how its fields are read (spec 2026-10-17, decisions 19 and 20).

/** Posts published in the last four weeks are asked for (amendment A10). */
export const SEMANAS_POR_ANOTAR = 4

export interface PostPorAnotar {
  piezaId: string
  titulo: string
  /** ISO instant. */
  publicadoEn: string
}

/** A post is pending when its newest row is older than this week's Monday. Newest first. */
export function postsPorAnotar(entrada: {
  posts: readonly PostPorAnotar[]
  medidos: readonly { piezaId: string; medidoEn: string }[]
  ahora: number
  zona: string
}): PostPorAnotar[] {
  const semana = lunesDeLaSemana(entrada.ahora, entrada.zona)
  const desde = entrada.ahora - SEMANAS_POR_ANOTAR * 7 * 86_400_000
  const anotados = new Set(entrada.medidos.filter((m) => m.medidoEn >= semana).map((m) => m.piezaId))
  return entrada.posts
    .filter((post) => {
      const instante = Date.parse(post.publicadoEn)
      return instante >= desde && instante <= entrada.ahora && !anotados.has(post.piezaId)
    })
    .sort((a, b) => Date.parse(b.publicadoEn) - Date.parse(a.publicadoEn))
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

export function armarAnotacion(
  posts: readonly { piezaId: string; titulo: string; campos: CamposDePost }[],
  seguidores: string,
): { ok: true; anotacion: Anotacion } | { ok: false; error: string } {
  const listos: NumerosDePost[] = []
  for (const post of posts) {
    if (CAMPOS_DE_POST.every(({ campo }) => post.campos[campo].trim() === "")) continue
    const numeros: Partial<Record<keyof CamposDePost, number>> = {}
    for (const { campo } of CAMPOS_DE_POST) {
      const cifra = leerCifra(post.campos[campo])
      if (typeof cifra === "number") numeros[campo] = cifra
    }
    const { impresiones, reacciones, comentarios, compartidos } = numeros
    if (
      impresiones === undefined ||
      reacciones === undefined ||
      comentarios === undefined ||
      compartidos === undefined
    ) {
      return { ok: false, error: `Completa los cuatro números de «${post.titulo}» o déjalos todos vacíos.` }
    }
    listos.push({ piezaId: post.piezaId, impresiones, reacciones, comentarios, compartidos })
  }
  const cuenta = leerCifra(seguidores)
  if (cuenta === "invalida") return { ok: false, error: "Los seguidores van como un número, sin letras." }
  if (listos.length === 0 && cuenta === null) return { ok: false, error: "Anota al menos un post o los seguidores." }
  return { ok: true, anotacion: { posts: listos, seguidores: cuenta } }
}
