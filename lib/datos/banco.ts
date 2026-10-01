import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { sugerirIdeas } from "@/lib/dominio/ideas"
import { esPilar, type Pilar } from "@/lib/dominio/pilares"
import type { IdeaDeBanco } from "@/lib/ideas/mazo"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

const DIAS_RECIENTES_MS = 30 * 24 * 60 * 60 * 1000
const Alertas = z.array(z.object({ tipo: z.string(), texto: z.string() }))

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

function fuerzaDe(valor: string): IdeaDeBanco["fuerza"] {
  if (valor === "alta" || valor === "media" || valor === "baja") return valor
  throw new Error(`Fuerza de idea desconocida: ${valor}`)
}

function estadoDe(valor: string): IdeaDeBanco["estado"] {
  if (valor === "idea" || valor === "usada" || valor === "descartada") return valor
  throw new Error(`Estado de idea desconocido: ${valor}`)
}

/**
 * The whole bank for the Banco screen, through Coni's session, in the order the deck shows it: the ideas still free in
 * the order Inicio would offer them (the ones she added first, then the pillars that came out least), and the used
 * ones after them. Discarded ideas are not shown.
 */
export async function leerBanco(db: Db, ahora: number): Promise<IdeaDeBanco[]> {
  const [ideas, piezas] = await Promise.all([
    db
      .from("ideas")
      .select("id, numero, pilar, gancho, tema, formato, fuerza, alertas, estado, fijada_en")
      .neq("estado", "descartada"),
    db
      .from("piezas")
      .select("creada_en, ideas(pilar)")
      .gte("creada_en", new Date(ahora - DIAS_RECIENTES_MS).toISOString()),
  ])
  if (ideas.error) throw fallo("No pude leer el banco de ideas", ideas.error)
  if (piezas.error) throw fallo("No pude leer lo que salió últimamente", piezas.error)

  const banco = ideas.data.flatMap((fila): IdeaDeBanco[] => {
    if (!esPilar(fila.pilar)) throw new Error(`Pilar de idea desconocido: ${fila.pilar}`)
    const alertas = Alertas.safeParse(fila.alertas)
    if (!alertas.success) throw new Error(`Las alertas de la idea ${fila.id} no tienen el formato esperado.`)
    return [
      {
        id: fila.id,
        numero: fila.numero,
        pilar: fila.pilar,
        gancho: fila.gancho,
        tema: fila.tema,
        formato: fila.formato,
        fuerza: fuerzaDe(fila.fuerza),
        alertas: alertas.data,
        estado: estadoDe(fila.estado),
        fijada: fila.fijada_en !== null,
      },
    ]
  })

  const libres = banco.filter((idea) => idea.estado === "idea")
  const recientes: Pilar[] = piezas.data.flatMap((pieza) => (pieza.ideas ? [pieza.ideas.pilar] : []))
  const enOrden = sugerirIdeas({ banco: libres, recientes, cuantas: libres.length })
  const porId = new Map(libres.map((idea) => [idea.id, idea]))
  const usadas = banco.filter((idea) => idea.estado !== "idea").sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
  return [...enOrden.flatMap((idea) => porId.get(idea.id) ?? []), ...usadas]
}
