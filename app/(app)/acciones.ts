"use server"

import { redirect } from "next/navigation"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function cerrarSesionAccion(): Promise<void> {
  const db = await createActionClient()
  await db.auth.signOut()
  redirect(RUTA_DE_INGRESO)
}
