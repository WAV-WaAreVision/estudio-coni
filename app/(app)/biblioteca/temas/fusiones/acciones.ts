"use server"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import {
  DecisionDeFusion,
  decidirFusion,
  deshacerFusion,
  ParDeTemas,
  SobreFusion,
  unirTemasAMano,
} from "@/lib/acciones/fusiones"
import type { Resultado } from "@/lib/acciones/resultado"
import { conSesionDeConi } from "@/lib/acciones/servidor"
import { type AvisoDeFusion, conAvisoDeFusion, RUTA_DE_FUSIONES } from "@/lib/dominio/fusiones"

/** A merge changes Temas, the topic pages and Inicio's attention: the whole app is refreshed. Fusiones opens with its note. */
function hacia(resultado: Resultado<{ aviso: AvisoDeFusion }>): Resultado<{ destino: string }> {
  if (!resultado.ok) return resultado
  revalidatePath("/", "layout")
  return { ok: true, destino: conAvisoDeFusion(RUTA_DE_FUSIONES, resultado.aviso) }
}

// Not `redirect()`: Next 16.2.6 sometimes drops a Server Action's redirect (see borradores/acciones.ts).

export async function decidirFusionAccion(entrada: z.input<typeof DecisionDeFusion>) {
  return hacia(await conSesionDeConi("decidirFusion", DecisionDeFusion, entrada, (db, d) => decidirFusion({ db }, d)))
}

export async function deshacerFusionAccion(entrada: z.input<typeof SobreFusion>) {
  return hacia(await conSesionDeConi("deshacerFusion", SobreFusion, entrada, (db, d) => deshacerFusion({ db }, d)))
}

export async function unirTemasAccion(entrada: z.input<typeof ParDeTemas>) {
  return hacia(await conSesionDeConi("unirTemasAMano", ParDeTemas, entrada, (db, d) => unirTemasAMano({ db }, d)))
}
