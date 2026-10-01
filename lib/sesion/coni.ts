import { notFound, redirect } from "next/navigation"
import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { RUTA_DE_INGRESO } from "./rutas"

export type SesionLeida =
  | { estado: "coni"; db: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { estado: "sin_sesion" }
  | { estado: "otra_persona" }

/** Who is looking: nobody, someone who is not Coni (the maintainer included), or Coni. Once per request. */
export const leerSesion = cache(async (): Promise<SesionLeida> => {
  const db = await createClient()
  const { data } = await db.auth.getUser()
  if (!data.user) return { estado: "sin_sesion" }
  const { data: esConi, error } = await db.rpc("es_coni")
  if (error) throw new Error(`No pude comprobar quién entró: ${error.message}`, { cause: error })
  return esConi ? { estado: "coni", db, userId: data.user.id } : { estado: "otra_persona" }
})

/** For pages: the signed-in Coni, or a redirect to sign in. Anyone else gets a 404 (the layout already says why). */
export async function exigirConi() {
  const sesion = await leerSesion()
  if (sesion.estado === "sin_sesion") redirect(RUTA_DE_INGRESO)
  if (sesion.estado === "otra_persona") notFound()
  return sesion
}
