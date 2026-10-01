import type { SupabaseClient } from "@supabase/supabase-js"
import type { SuscripcionPush } from "@/lib/proveedores/push"
import type { Database } from "@/lib/supabase/database.types"

export interface SuscripcionGuardada extends SuscripcionPush {
  id: string
  fallos: number
}

/** Every device Coni subscribed, with its keys: `service_role` only, the sender needs them and nobody else does. */
export async function listarSuscripciones(db: SupabaseClient<Database>): Promise<SuscripcionGuardada[]> {
  const { data, error } = await db.from("suscripciones_push").select("id, endpoint, p256dh, auth, fallos")
  if (error) throw new Error(`No pude leer las suscripciones de push: ${error.message}`, { cause: error })
  return data
}

export async function quitarSuscripcion(db: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await db.from("suscripciones_push").delete().eq("id", id)
  if (error) throw new Error(`No pude quitar una suscripción de push: ${error.message}`, { cause: error })
}

export async function anotarEntrega(db: SupabaseClient<Database>, id: string, ahora: string): Promise<void> {
  const { error } = await db.from("suscripciones_push").update({ fallos: 0, ultimo_ok_en: ahora }).eq("id", id)
  if (error) throw new Error(`No pude anotar una entrega de push: ${error.message}`, { cause: error })
}

export async function anotarFallo(db: SupabaseClient<Database>, suscripcion: SuscripcionGuardada): Promise<void> {
  const { error } = await db
    .from("suscripciones_push")
    .update({ fallos: suscripcion.fallos + 1 })
    .eq("id", suscripcion.id)
  if (error) throw new Error(`No pude anotar un fallo de push: ${error.message}`, { cause: error })
}
