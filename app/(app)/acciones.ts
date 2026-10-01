"use server"

import { redirect } from "next/navigation"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function cerrarSesionAccion(): Promise<void> {
  const db = await createActionClient()
  // This device only: her phone and the computer where WAV helps her are separate sessions.
  await db.auth.signOut({ scope: "local" })
  redirect(RUTA_DE_INGRESO)
}
