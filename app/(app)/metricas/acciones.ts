"use server"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { anotarNumerosDeLinkedin, ESQUEMA_DE_ANOTACION } from "@/lib/acciones/metricas-linkedin"
import { comoConi } from "@/lib/acciones/servidor"

export async function anotarNumerosDeLinkedinAccion(entrada: z.input<typeof ESQUEMA_DE_ANOTACION>) {
  const resultado = await comoConi("anotarNumerosDeLinkedin", ESQUEMA_DE_ANOTACION, entrada, (deps, datos) =>
    anotarNumerosDeLinkedin(deps, datos),
  )
  if (resultado.ok) revalidatePath("/metricas")
  return resultado
}
