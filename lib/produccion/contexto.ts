import type { SupabaseClient } from "@supabase/supabase-js"
import { leerPilares } from "@/lib/datos/pilares"
import { type FilaDePieza, type IdeaLeida, leerGuiaVigente, leerIdea } from "@/lib/datos/repositorio"
import { cargarRespaldoDeIdea } from "@/lib/datos/respaldo"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveIdempotencia, hashTexto } from "@/lib/dominio/puertas"
import type { Respaldo } from "@/lib/dominio/respaldo"
import type { Database } from "@/lib/supabase/database.types"

/**
 * One key per piece, step and script round (`intento` goes up when Coni asks for changes), so a Trigger.dev retry
 * of the same round finds its own reservation and a new round gets a new one.
 */
export function claveDeGasto(fila: FilaDePieza, que: string): string {
  return claveIdempotencia({
    piezaId: fila.id,
    paso: "producir",
    hash: hashTexto(que),
    intento: fila.intento,
  })
}

export interface Contexto {
  idea: IdeaLeida
  /** The idea's pillar as the writer reads it. */
  pilar: { nombre: string; descripcion: string | null }
  guia: string
  respaldo: Respaldo | null
}

// Everything that can be wrong with the setup is checked before any money is reserved.
export async function cargarContexto(deps: { db: SupabaseClient<Database> }, fila: FilaDePieza): Promise<Contexto> {
  const { db } = deps
  if (!fila.idea_id) {
    throw new FallaDeConfiguracion(`La pieza ${fila.id} no tiene idea: no hay de qué escribir el guion.`)
  }
  const idea = await leerIdea(db, fila.idea_id)
  if (!idea) {
    throw new FallaDeConfiguracion(`No existe la idea ${fila.idea_id} de la pieza ${fila.id}.`)
  }
  const pilares = await leerPilares(db)
  const datosDelPilar = pilares.find((candidato) => candidato.slug === idea.pilar)
  if (!datosDelPilar) {
    throw new FallaDeConfiguracion(`La idea ${idea.id} apunta a un pilar que no existe: ${idea.pilar}.`)
  }
  // A retired pillar keeps its name for the idea, but its description no longer guides what gets written.
  const pilar = { nombre: datosDelPilar.nombre, descripcion: datosDelPilar.activa ? datosDelPilar.descripcion : null }
  const respaldo = await cargarRespaldoDeIdea(db, idea.id)
  const guia = await leerGuiaVigente(db)
  if (!guia) {
    throw new FallaDeConfiguracion("No hay una guía editorial vigente.")
  }
  return { idea, pilar, guia: guia.texto, respaldo }
}
