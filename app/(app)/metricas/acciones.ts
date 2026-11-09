"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ESQUEMA_DE_DUDOSOS, guardarDudososDeLinkedin, importarExcelDeLinkedin } from "@/lib/acciones/excel-linkedin"
import { anotarNumerosDeLinkedin, ESQUEMA_DE_ANOTACION } from "@/lib/acciones/metricas-linkedin"
import { comoConi } from "@/lib/acciones/servidor"
import { avisosReales } from "@/lib/proveedores/avisos"

export async function anotarNumerosDeLinkedinAccion(entrada: z.input<typeof ESQUEMA_DE_ANOTACION>) {
  const resultado = await comoConi("anotarNumerosDeLinkedin", ESQUEMA_DE_ANOTACION, entrada, (deps, datos) =>
    anotarNumerosDeLinkedin(deps, datos),
  )
  if (resultado.ok) revalidatePath("/metricas")
  return resultado
}

const SobreElExcel = z.object({ archivo: z.file() })

/** Decision 1: the importer is Coni's. The numbers show on Métricas and clear the reminder on Inicio. */
export async function importarExcelDeLinkedinAccion(formulario: FormData) {
  const resultado = await comoConi(
    "importarExcelDeLinkedin",
    SobreElExcel,
    { archivo: formulario.get("archivo") },
    (deps, datos) =>
      importarExcelDeLinkedin({ db: deps.db, ahora: deps.ahora, avisos: () => avisosReales() }, datos.archivo),
  )
  if (resultado.ok) {
    revalidatePath("/metricas")
    revalidatePath("/")
  }
  return resultado
}

export async function guardarDudososDeLinkedinAccion(entrada: z.input<typeof ESQUEMA_DE_DUDOSOS>) {
  const resultado = await comoConi("guardarDudososDeLinkedin", ESQUEMA_DE_DUDOSOS, entrada, (deps, datos) =>
    guardarDudososDeLinkedin({ db: deps.db, ahora: deps.ahora, avisos: () => avisosReales() }, datos),
  )
  if (resultado.ok) {
    revalidatePath("/metricas")
    revalidatePath("/")
  }
  return resultado
}
