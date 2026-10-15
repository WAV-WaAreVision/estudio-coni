import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { z } from "zod"
import { exigirEnv } from "@/lib/env"
import { createActionClient } from "@/lib/supabase/action"
import type { Database } from "@/lib/supabase/database.types"
import type { Disparos } from "./disparos"
import { disparosDeEntorno } from "./disparos-entorno"
import type { DepsAcciones } from "./piezas"
import { ERROR_GENERICO, ERROR_SESION_VENCIDA, type Resultado } from "./resultado"

const ERROR_SOLICITUD = "No entendí esa solicitud. Vuelve a abrir la pantalla."

type Db = SupabaseClient<Database>

/** A `service_role` client, for what only the server may do: read Coni's keys and the spend of the month. */
export function clienteDeServicio(): Db {
  return createClient<Database>(
    exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL),
    exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/**
 * Runs a Server Action as the signed-in Coni, with her own client. A Server Action is a public endpoint, so the
 * session is checked here again (the proxy only does the optimistic check) and `entrada` is validated before anything
 * reads the database.
 */
export async function conSesionDeConi<E extends z.ZodType, T extends object>(
  nombre: string,
  esquema: E,
  entrada: unknown,
  trabajo: (db: Db, datos: z.output<E>) => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  const datos = esquema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: ERROR_SOLICITUD }

  let db: Db
  try {
    db = await createActionClient()
    const { data } = await db.auth.getUser()
    if (!data.user) return { ok: false, error: ERROR_SESION_VENCIDA }
    const { data: esConi, error } = await db.rpc("es_coni")
    if (error) throw new Error(`No pude comprobar quién es: ${error.message}`, { cause: error })
    if (!esConi) return { ok: false, error: "Esta app es solo para Coni." }
  } catch (error) {
    console.error(`La acción ${nombre} no pudo abrir la sesión`, error)
    return { ok: false, error: ERROR_GENERICO }
  }
  return trabajo(db, datos.data)
}

/**
 * The starters of the background runs, resolved on use: a missing Trigger.dev key must not stop an action that starts
 * none.
 */
export function disparosDeLaApp(): Disparos {
  return {
    producir: (piezaId, clave) => disparosDeEntorno().producir(piezaId, clave),
    grabar: (piezaId, clave, retraso) => disparosDeEntorno().grabar(piezaId, clave, retraso),
    voz: (piezaId, clave, nueva) => disparosDeEntorno().voz(piezaId, clave, nueva),
  }
}

/** The actions on pieces: Coni's client plus the starters of the background runs. */
export function comoConi<E extends z.ZodType, T extends object>(
  nombre: string,
  esquema: E,
  entrada: unknown,
  trabajo: (deps: DepsAcciones, datos: z.output<E>) => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  return conSesionDeConi(nombre, esquema, entrada, (db, datos) =>
    trabajo(
      {
        db,
        disparar: disparosDeLaApp(),
        ahora: () => new Date().toISOString(),
      },
      datos,
    ),
  )
}
