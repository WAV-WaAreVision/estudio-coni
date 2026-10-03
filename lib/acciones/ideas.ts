import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  confirmarGasto,
  leerGuiaVigente,
  leerSecreto,
  liberarGasto,
  reservarGastoGeneral,
} from "@/lib/datos/repositorio"
import { Falla } from "@/lib/dominio/falla"
import { PILARES } from "@/lib/dominio/pilares"
import { TIPOS_DE_ALERTA } from "@/lib/dominio/revision"
import { dolares } from "@/lib/formato"
import { clasificarIdea, costoClaude, MODELO_POR_TAREA, type PropuestaDeIdea } from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsIdeas {
  /** Coni's session: row level security decides who can change the bank. */
  db: Db
  /** A `service_role` client, for what only the server may read (her keys) and the spend of the month. */
  servicio: () => Db
  crearClaude: (llave: string) => Anthropic
  ahora: () => string
}

const MAXIMO_GANCHO = 220
const MAXIMO_TEMA = 600
// Classifying a hook with the guide cached is a few thousand tokens; the real cost is confirmed afterwards.
const ESTIMADO_CLASIFICAR_USD = 0.1

const NoDisponible = new Falla("Esa idea ya no está disponible.")

async function cambiarFijada(deps: DepsIdeas, ideaId: string, fijada: boolean): Promise<void> {
  const { data, error } = await deps.db
    .from("ideas")
    .update({ fijada_en: fijada ? deps.ahora() : null })
    // Only a plain idea can be added to the week: one already used or discarded is gone from the bank.
    .eq("id", ideaId)
    .eq("estado", "idea")
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`No pude cambiar la idea: ${error.message}`, { cause: error })
  if (!data) throw NoDisponible
}

/** "Usar esta": the idea goes to the front of the week's ideas on Inicio. Nothing is written and nothing is spent. */
export function usarIdea(deps: DepsIdeas, ideaId: string): Promise<Resultado> {
  return aResultado("usarIdea", async () => {
    await cambiarFijada(deps, ideaId, true)
    return {}
  })
}

/** "Deshacer" of the toast. */
export function quitarIdea(deps: DepsIdeas, ideaId: string): Promise<Resultado> {
  return aResultado("quitarIdea", async () => {
    await cambiarFijada(deps, ideaId, false)
    return {}
  })
}

const EntradaDeIdea = z.object({
  gancho: z.string().trim().min(1).max(MAXIMO_GANCHO),
  tema: z.string().trim().max(MAXIMO_TEMA),
})
const ERROR_ENTRADA = `Escribe tu idea en una o dos frases (hasta ${MAXIMO_GANCHO} letras).`

/**
 * Claude proposes the pillar, format and alerts of an idea Coni wrote (design A12); the call is paid, so it goes through
 * the monthly cap like every other spend. She confirms or corrects the proposal before anything is saved.
 */
export function proponerIdea(deps: DepsIdeas, entrada: unknown): Promise<Resultado<{ propuesta: PropuestaDeIdea }>> {
  return aResultado("proponerIdea", async () => {
    const idea = EntradaDeIdea.safeParse(entrada)
    if (!idea.success) throw new Falla(ERROR_ENTRADA)
    const servicio = deps.servicio()

    const llave = await leerSecreto(servicio, "anthropic")
    if (!llave) {
      throw new Falla(
        "Para proponerte el pilar necesito tu llave de Anthropic. Agrégala en Ajustes o elige el pilar tú.",
      )
    }
    const guia = await leerGuiaVigente(servicio)
    if (!guia) throw new Error("No hay una guía editorial vigente para clasificar la idea.")

    const clave = `idea_propia:${crypto.randomUUID()}`
    const reserva = await reservarGastoGeneral(servicio, {
      proveedor: "anthropic",
      paso: "idea_propia",
      estimadoUsd: ESTIMADO_CLASIFICAR_USD,
      clave,
      ahora: deps.ahora(),
    })
    if (reserva.tope) {
      const { data } = await deps.db.from("ajustes").select("tope_mensual_usd").maybeSingle()
      const tope = data ? ` de ${dolares(data.tope_mensual_usd)}` : ""
      throw new Falla(`Llegaste al tope${tope} de este mes. Súbelo en Ajustes para seguir.`)
    }

    try {
      const { propuesta, uso } = await clasificarIdea({
        cliente: deps.crearClaude(llave),
        guia: guia.texto,
        gancho: idea.data.gancho,
        tema: idea.data.tema,
      })
      await confirmarGasto(servicio, clave, Number(costoClaude(uso, MODELO_POR_TAREA.clasificarIdea.modelo).toFixed(4)))
      return { propuesta }
    } catch (error) {
      // Nothing was proposed, so nothing was spent that she should pay against the cap.
      await liberarGasto(servicio, clave)
      console.error("No pude clasificar la idea con Claude", error)
      throw new Falla("No pude proponerte el pilar ahora. Elígelo tú y confirma las alertas.")
    }
  })
}

const IdeaConfirmada = EntradaDeIdea.extend({
  formato: z.string().trim().max(80),
  pilar: z.enum(PILARES),
  alertas: z.array(z.object({ tipo: z.enum(TIPOS_DE_ALERTA), texto: z.string().trim().min(1).max(400) })).max(8),
})

/** Saves the idea with what she confirmed; it joins the week's ideas and, like any idea, the same review later. */
export function crearIdeaPropia(deps: DepsIdeas, entrada: unknown): Promise<Resultado<{ id: string }>> {
  return aResultado("crearIdeaPropia", async () => {
    const idea = IdeaConfirmada.safeParse(entrada)
    if (!idea.success) throw new Falla(ERROR_ENTRADA)
    const { data, error } = await deps.db
      .from("ideas")
      .insert({
        pilar: idea.data.pilar,
        gancho: idea.data.gancho,
        tema: idea.data.tema,
        formato: idea.data.formato,
        // She wrote it to use it: it goes first among equals.
        fuerza: "alta",
        alertas: idea.data.alertas,
        fuentes: ["Idea de Coni"],
        fijada_en: deps.ahora(),
      })
      .select("id")
      .single()
    if (error) throw new Error(`No pude guardar la idea: ${error.message}`, { cause: error })
    return { id: data.id }
  })
}
