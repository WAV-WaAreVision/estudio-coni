"use server"

import { redirect } from "next/navigation"
import { correoDeConi, pedirCodigo, type ResultadoIngreso, verificarCodigo } from "@/lib/acciones/ingreso"
import { createActionClient } from "@/lib/supabase/action"

async function dependencias() {
  const db = await createActionClient()
  return { auth: db.auth, correoConi: correoDeConi(process.env) }
}

export async function pedirCodigoAccion(): Promise<ResultadoIngreso> {
  return pedirCodigo(await dependencias())
}

export async function verificarCodigoAccion(codigo: string): Promise<ResultadoIngreso> {
  const resultado = await verificarCodigo(await dependencias(), codigo)
  if (resultado.ok) redirect("/")
  return resultado
}
