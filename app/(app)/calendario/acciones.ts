"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { cambiarPropuesta, repartirFechas } from "@/lib/acciones/fechas"
import type { Resultado } from "@/lib/acciones/resultado"
import { conSesionDeConi } from "@/lib/acciones/servidor"

const ahora = () => new Date().toISOString()

/** A proposal changes the Agenda and both gates' dates. */
async function refrescar<T extends object>(resultado: Resultado<T>): Promise<Resultado<T>> {
  if (resultado.ok) revalidatePath("/", "layout")
  return resultado
}

export async function repartirFechasAccion() {
  return refrescar(await conSesionDeConi("repartirFechas", z.object({}), {}, (db) => repartirFechas({ db, ahora })))
}

const cambio = z.object({ piezaId: z.uuid(), instante: z.iso.datetime({ offset: true }) })

export async function cambiarPropuestaAccion(piezaId: string, instante: string) {
  return refrescar(
    await conSesionDeConi("cambiarPropuesta", cambio, { piezaId, instante }, (db, d) =>
      cambiarPropuesta({ db, ahora }, d.piezaId, d.instante),
    ),
  )
}
