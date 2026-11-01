import { execFileSync } from "node:child_process"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { Database } from "@/lib/supabase/database.types"
import { clienteDeServicio, credencialesDeServicio } from "./servicio"

const Estado = z.object({ ANON_KEY: z.string().min(1) })
let anon: string | undefined

function claveAnonima(): string {
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anon) {
    anon = Estado.parse(JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf-8" }))).ANON_KEY
  }
  return anon
}

/**
 * A client signed in as a seed user through the real Auth flow: the admin API mints the emailed code, `verifyOtp`
 * exchanges it for a session, so PostgREST sees the same JWT a browser would send. Row level security applies.
 */
export async function clienteDeUsuario(correo: string): Promise<SupabaseClient<Database>> {
  const { data, error } = await clienteDeServicio().auth.admin.generateLink({ type: "magiclink", email: correo })
  if (error) throw new Error(`No pude generar el código de ${correo}: ${error.message}`, { cause: error })
  const cliente = createClient<Database>(credencialesDeServicio().url, claveAnonima(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const sesion = await cliente.auth.verifyOtp({ email: correo, token: data.properties.email_otp, type: "email" })
  if (sesion.error) throw new Error(`No pude entrar como ${correo}: ${sesion.error.message}`, { cause: sesion.error })
  // GoTrue stamps the token with its own clock and PostgREST rejects a token "issued at future" when it checks it in
  // the same second; the local stack's containers disagree by a fraction of a second.
  await new Promise((resolver) => setTimeout(resolver, 1100))
  return cliente
}

export const clienteDeConi = () => clienteDeUsuario("coni@estudio.test")
export const clienteDelMantenedor = () => clienteDeUsuario("wav@estudio.test")

/** A client with the anon key and no session: what a visitor of a public page has. */
export function clienteAnonimoDePrueba(): SupabaseClient<Database> {
  return createClient<Database>(credencialesDeServicio().url, claveAnonima(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
