import type { z } from "zod"
import { createActionClient } from "@/lib/supabase/action"
import { disparosDeEntorno } from "./disparos-entorno"
import type { DepsAcciones } from "./piezas"
import { ERROR_GENERICO, ERROR_SESION_VENCIDA, type Resultado } from "./resultado"

const ERROR_SOLICITUD = "No entendí esa solicitud. Vuelve a abrir la pantalla."

/**
 * Runs a Server Action as the signed-in Coni. A Server Action is a public endpoint, so the session is checked here
 * again (the proxy only does the optimistic check) and `entrada` is validated before anything reads the database.
 */
export async function comoConi<E extends z.ZodType, T extends object>(
  nombre: string,
  esquema: E,
  entrada: unknown,
  trabajo: (deps: DepsAcciones, datos: z.output<E>) => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  const datos = esquema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: ERROR_SOLICITUD }

  let deps: DepsAcciones
  try {
    const db = await createActionClient()
    const { data } = await db.auth.getUser()
    if (!data.user) return { ok: false, error: ERROR_SESION_VENCIDA }
    const { data: esConi, error } = await db.rpc("es_coni")
    if (error) throw new Error(`No pude comprobar quién es: ${error.message}`, { cause: error })
    if (!esConi) return { ok: false, error: "Esta app es solo para Coni." }
    deps = {
      db,
      // Resolved on use: a missing Trigger.dev key must not stop an approval that does not start a run.
      disparar: {
        producir: (piezaId, clave) => disparosDeEntorno().producir(piezaId, clave),
        grabar: (piezaId, clave) => disparosDeEntorno().grabar(piezaId, clave),
      },
      ahora: () => new Date().toISOString(),
    }
  } catch (error) {
    console.error(`La acción ${nombre} no pudo abrir la sesión`, error)
    return { ok: false, error: ERROR_GENERICO }
  }
  return trabajo(deps, datos.data)
}
