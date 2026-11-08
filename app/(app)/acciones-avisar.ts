"use server"

import { z } from "zod"
import { avisarAFederico } from "@/lib/acciones/avisar-a-federico"
import { avisarErrorDePantalla } from "@/lib/acciones/error-de-pantalla"
import type { Resultado } from "@/lib/acciones/resultado"
import { clienteDeServicio, conSesionDeConi } from "@/lib/acciones/servidor"
import { avisosReales } from "@/lib/proveedores/avisos"

// `motivo`: a balance block at gate 1 (issue 101, decision 1); only a piece has one.
const SobreAviso = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("pieza"), id: z.uuid(), motivo: z.enum(["saldo_voz", "saldo_video"]).optional() }),
  z.object({ tipo: z.literal("material"), id: z.uuid() }),
])

/**
 * «Avisar a Federico» (spec 2026-11-07, decision 6). Coni's session is checked, then the service client reads the
 * piece or material and claims the email: the claim functions answer only to `service_role`.
 */
export async function avisarAFedericoAccion(entrada: {
  tipo: string
  id: string
  motivo?: string
}): Promise<Resultado> {
  return conSesionDeConi("avisarAFederico", SobreAviso, entrada, (_db, datos) =>
    avisarAFederico({ db: clienteDeServicio(), avisos: () => avisosReales() }, datos),
  )
}

// The registro is one of the fixed lines the error screens pass; the digest is Next's, hex.
const SobreErrorDePantalla = z.object({
  registro: z.string().min(1).max(120),
  digest: z
    .string()
    .regex(/^[\w-]{1,64}$/)
    .optional(),
})

/** Issue 111: a screen that could not load tells WAV by itself. Only Coni's session can send it. */
export async function avisarErrorDePantallaAccion(entrada: { registro: string; digest?: string }): Promise<Resultado> {
  return conSesionDeConi("avisarErrorDePantalla", SobreErrorDePantalla, entrada, (_db, datos) =>
    avisarErrorDePantalla(
      { avisos: () => avisosReales(), ahora: () => new Date().toISOString() },
      datos.digest ? { registro: datos.registro, digest: datos.digest } : { registro: datos.registro },
    ),
  )
}
