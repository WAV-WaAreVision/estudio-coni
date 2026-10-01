"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { anotarConsulta, deshacerConsulta } from "@/lib/acciones/consultas"
import type { Resultado } from "@/lib/acciones/resultado"
import { comoConi } from "@/lib/acciones/servidor"

async function refrescar<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  if (resultado.ok) revalidatePath("/", "layout")
  return resultado
}

export async function anotarConsultaAccion() {
  return refrescar(await comoConi("anotarConsulta", z.object({}), {}, (deps) => anotarConsulta(deps)))
}

export async function deshacerConsultaAccion(id: string) {
  return refrescar(
    await comoConi("deshacerConsulta", z.object({ id: z.uuid() }), { id }, (deps, d) => deshacerConsulta(deps, d.id)),
  )
}
