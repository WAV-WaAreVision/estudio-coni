"use server"

import { z } from "zod"
import { avisarAFederico } from "@/lib/acciones/avisar-a-federico"
import type { Resultado } from "@/lib/acciones/resultado"
import { clienteDeServicio, conSesionDeConi } from "@/lib/acciones/servidor"
import { avisosReales } from "@/lib/proveedores/avisos"

const SobreAviso = z.object({ tipo: z.enum(["pieza", "material"]), id: z.uuid() })

/**
 * «Avisar a Federico» (spec 2026-11-07, decision 6). Coni's session is checked, then the service client reads the
 * piece or material and claims the email: the claim functions answer only to `service_role`.
 */
export async function avisarAFedericoAccion(entrada: { tipo: string; id: string }): Promise<Resultado> {
  return conSesionDeConi("avisarAFederico", SobreAviso, entrada, (_db, datos) =>
    avisarAFederico({ db: clienteDeServicio(), avisos: () => avisosReales() }, datos),
  )
}
