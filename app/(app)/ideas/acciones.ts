"use server"

import Anthropic from "@anthropic-ai/sdk"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  crearIdeaPropia,
  type DepsIdeas,
  descartarIdea,
  descartarIdeas,
  MOTIVOS_DE_DESCARTE,
  type MotivoDeDescarte,
  proponerIdea,
  quitarIdea,
  restaurarIdeas,
  usarIdea,
} from "@/lib/acciones/ideas"
import type { Resultado } from "@/lib/acciones/resultado"
import { clienteDeServicio, conSesionDeConi } from "@/lib/acciones/servidor"
import { baseDe } from "@/lib/proveedores/bases"

// The model answers in a few seconds; a hung call must not hold the screen for the SDK's ten minutes.
const ESPERA_CLAUDE_MS = 60_000

function depsDeIdeas(db: DepsIdeas["db"]): DepsIdeas {
  return {
    db,
    servicio: clienteDeServicio,
    crearClaude: (llave) =>
      new Anthropic({
        apiKey: llave,
        baseURL: baseDe(process.env, "ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
        timeout: ESPERA_CLAUDE_MS,
        maxRetries: 1,
      }),
    ahora: () => new Date().toISOString(),
  }
}

/** A change to the bank changes what Inicio offers. */
async function refrescar<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  if (resultado.ok) revalidatePath("/", "layout")
  return resultado
}

/** For the batch: one that failed halfway may still have moved some of its ideas. */
async function refrescarSiempre<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  revalidatePath("/", "layout")
  return resultado
}

const sobreIdea = z.object({ ideaId: z.uuid() })

export async function usarIdeaAccion(ideaId: string) {
  return refrescar(
    await conSesionDeConi("usarIdea", sobreIdea, { ideaId }, (db, d) => usarIdea(depsDeIdeas(db), d.ideaId)),
  )
}

export async function quitarIdeaAccion(ideaId: string) {
  return refrescar(
    await conSesionDeConi("quitarIdea", sobreIdea, { ideaId }, (db, d) => quitarIdea(depsDeIdeas(db), d.ideaId)),
  )
}

const descarte = z.object({ ideaId: z.uuid(), motivo: z.enum(MOTIVOS_DE_DESCARTE) })

export async function descartarIdeaAccion(ideaId: string, motivo: MotivoDeDescarte) {
  return refrescar(
    await conSesionDeConi("descartarIdea", descarte, { ideaId, motivo }, (db, d) => descartarIdea(depsDeIdeas(db), d)),
  )
}

const descarteDeLote = z.object({ ideaIds: z.array(z.uuid()).max(20), motivo: z.enum(MOTIVOS_DE_DESCARTE) })

export async function descartarIdeasAccion(ideaIds: string[], motivo: MotivoDeDescarte) {
  return refrescarSiempre(
    await conSesionDeConi("descartarIdeas", descarteDeLote, { ideaIds, motivo }, (db, d) =>
      descartarIdeas(depsDeIdeas(db), d),
    ),
  )
}

export async function restaurarIdeasAccion(ideaIds: string[]) {
  return refrescarSiempre(
    await conSesionDeConi("restaurarIdeas", z.object({ ideaIds: z.array(z.uuid()).max(20) }), { ideaIds }, (db, d) =>
      restaurarIdeas(depsDeIdeas(db), d.ideaIds),
    ),
  )
}

const ideaEscrita = z.object({ gancho: z.string().max(2000), tema: z.string().max(2000) })

export async function proponerIdeaAccion(gancho: string, tema: string) {
  return conSesionDeConi("proponerIdea", ideaEscrita, { gancho, tema }, (db, d) => proponerIdea(depsDeIdeas(db), d))
}

const ideaConfirmada = z.object({
  gancho: z.string().max(2000),
  tema: z.string().max(2000),
  formato: z.string().max(200),
  pilar: z.string().max(40),
  alertas: z.array(z.object({ tipo: z.string().max(40), texto: z.string().max(2000) })).max(20),
})

export async function crearIdeaPropiaAccion(idea: z.input<typeof ideaConfirmada>) {
  return refrescar(
    await conSesionDeConi("crearIdeaPropia", ideaConfirmada, idea, (db, d) => crearIdeaPropia(depsDeIdeas(db), d)),
  )
}
