"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { anotarNumerosDeLinkedin } from "@/lib/acciones/metricas-linkedin"
import { comoConi } from "@/lib/acciones/servidor"

const CIFRA = z.number().int().min(0).max(999_999_999)
const anotacion = z.object({
  posts: z
    .array(
      z.object({ piezaId: z.uuid(), impresiones: CIFRA, reacciones: CIFRA, comentarios: CIFRA, compartidos: CIFRA }),
    )
    .max(50),
  seguidores: CIFRA.nullable(),
})

export async function anotarNumerosDeLinkedinAccion(entrada: z.input<typeof anotacion>) {
  const resultado = await comoConi("anotarNumerosDeLinkedin", anotacion, entrada, (deps, datos) =>
    anotarNumerosDeLinkedin(deps, datos),
  )
  if (resultado.ok) revalidatePath("/metricas")
  return resultado
}
