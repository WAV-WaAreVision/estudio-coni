"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { guardarAjuste, guardarLlave } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import { conSesionDeConi } from "@/lib/acciones/servidor"

const deps = (db: Parameters<typeof guardarAjuste>[0]["db"]) => ({ db, ahora: () => new Date().toISOString() })

/** What the settings change is read by Inicio (the next dates) and the screens that propose one. */
async function refrescar<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  if (resultado.ok) revalidatePath("/", "layout")
  return resultado
}

// Validated by `guardarAjuste` itself; here it only has to be an object.
const cualquierCambio = z.object({ campo: z.string().max(40), valor: z.unknown() })

export async function guardarAjusteAccion(cambio: z.input<typeof cualquierCambio>) {
  return refrescar(
    await conSesionDeConi("guardarAjuste", cualquierCambio, cambio, (db, d) => guardarAjuste(deps(db), d)),
  )
}

const llave = z.object({ cuenta: z.string().max(40), llave: z.string().max(2000) })

export async function guardarLlaveAccion(cuenta: string, valor: string) {
  return refrescar(
    await conSesionDeConi("guardarLlave", llave, { cuenta, llave: valor }, (db, d) => guardarLlave(deps(db), d)),
  )
}
