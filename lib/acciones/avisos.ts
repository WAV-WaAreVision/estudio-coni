import type { SupabaseClient } from "@supabase/supabase-js"
import { TITULO_DE_PUSH } from "@/lib/avisos/tipos"
import { Falla } from "@/lib/dominio/falla"
import type { ServicioPush } from "@/lib/proveedores/push"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsAvisos {
  /** Coni's session client: row level security makes every row hers. */
  db: Db
  /** Resolved on use: a missing VAPID key must not break saving or removing a device. */
  push: () => ServicioPush
}

export interface SuscripcionDelNavegador {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

function fallo(que: string, error: { message: string }): Error {
  return new Error(`No pude ${que}: ${error.message}`, { cause: error })
}

/**
 * Saves the device that just subscribed. The same device subscribing again (new keys, same endpoint) replaces its row:
 * she may only insert and delete her own rows, so it is a delete and an insert.
 */
export function guardarSuscripcion(deps: DepsAvisos, entrada: SuscripcionDelNavegador): Promise<Resultado> {
  return aResultado("guardarSuscripcion", async () => {
    const { error: errorAlQuitar } = await deps.db.from("suscripciones_push").delete().eq("endpoint", entrada.endpoint)
    if (errorAlQuitar) throw fallo("reemplazar la suscripción", errorAlQuitar)
    const { error } = await deps.db.from("suscripciones_push").insert({
      endpoint: entrada.endpoint,
      p256dh: entrada.p256dh,
      auth: entrada.auth,
      user_agent: entrada.userAgent ?? null,
    })
    if (error) throw fallo("guardar la suscripción", error)
    return {}
  })
}

export function quitarSuscripcion(deps: DepsAvisos, endpoint: string): Promise<Resultado> {
  return aResultado("quitarSuscripcion", async () => {
    const { error } = await deps.db.from("suscripciones_push").delete().eq("endpoint", endpoint)
    if (error) throw fallo("quitar la suscripción", error)
    return {}
  })
}

const MENSAJE_DE_PRUEBA = {
  titulo: TITULO_DE_PUSH,
  cuerpo: "Este es un aviso de prueba. Si lo ves, todo funciona.",
  url: "/ajustes",
}

/** "Enviar uno de prueba": the same push the notices use, to each of her devices, so she sees it arrive. */
export function enviarPrueba(deps: DepsAvisos): Promise<Resultado<{ enviados: number }>> {
  return aResultado("enviarPrueba", async () => {
    const { data, error } = await deps.db.from("suscripciones_push").select("id, endpoint, p256dh, auth")
    if (error) throw fallo("leer tus aparatos", error)
    if (data.length === 0) throw new Falla("Primero activa los avisos en este celular.")

    const servicio = deps.push()
    let enviados = 0
    let caducadas = 0
    for (const suscripcion of data) {
      const resultado = await servicio.enviar(suscripcion, MENSAJE_DE_PRUEBA, { urgente: false })
      if (resultado.estado === "enviado") enviados += 1
      if (resultado.estado === "caducada") {
        caducadas += 1
        const { error: errorAlQuitar } = await deps.db.from("suscripciones_push").delete().eq("id", suscripcion.id)
        if (errorAlQuitar) throw fallo("quitar un aparato que ya no recibe avisos", errorAlQuitar)
      }
    }
    if (enviados > 0) return { enviados }
    if (caducadas === data.length) throw new Falla("Este celular ya no recibe avisos. Actívalos de nuevo.")
    throw new Falla("No pude mandarlo ahora. Inténtalo en unos minutos.")
  })
}

/** "Así se ve tu avatar": she saw it once. Only the first time counts, and only she can mark it. */
export function marcarAvatarVisto(db: Db): Promise<Resultado> {
  return aResultado("marcarAvatarVisto", async () => {
    const { error } = await db
      .from("ajustes")
      .update({ avatar_visto_en: new Date().toISOString() })
      .is("avatar_visto_en", null)
    if (error) throw fallo("marcar el mensaje de primera vez", error)
    return {}
  })
}

/** She opened a notice. Only the first time counts. */
export function marcarAvisoLeido(db: Db, id: string): Promise<Resultado> {
  return aResultado("marcarAvisoLeido", async () => {
    const { error } = await db
      .from("avisos")
      .update({ leido_en: new Date().toISOString() })
      .eq("id", id)
      .is("leido_en", null)
    if (error) throw fallo("marcar el aviso como leído", error)
    return {}
  })
}
