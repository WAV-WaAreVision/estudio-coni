"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { proponerAhora } from "@/lib/acciones/semana"
import { conSesionDeConi, disparosDeBibliotecaDeLaApp } from "@/lib/acciones/servidor"
import { RUTA_DE_SEMANA } from "@/lib/dominio/biblioteca/semana"

/** No input: who asks is what the server checks. The client redraws (`useRedibujar`); never `redirect()`. */
export async function proponerAhoraAccion() {
  const resultado = await conSesionDeConi("proponerAhora", z.object({}), {}, (db) =>
    proponerAhora({ db, disparar: disparosDeBibliotecaDeLaApp(), ahora: () => new Date() }),
  )
  if (resultado.ok) revalidatePath(RUTA_DE_SEMANA)
  return resultado
}
