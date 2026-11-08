import type { SupabaseClient } from "@supabase/supabase-js"
import { yaAvisado } from "@/lib/acciones/avisar-a-federico"
import {
  claveDeAviso,
  claveDeAvisoDeSaldo,
  type MotivoDeSaldo,
  type TipoDeAviso,
} from "@/lib/dominio/avisar-a-federico"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

async function avisadoOFalso(db: Db, clave: string): Promise<{ avisado: boolean }> {
  try {
    return { avisado: await yaAvisado(db, clave) }
  } catch (error) {
    // A passing read error must not take gate 1 or the Biblioteca down: she sees the button, and the action still
    // sends one email at most.
    console.error(`No pude leer el aviso ${clave}; muestro el botón`, error)
    return { avisado: false }
  }
}

/**
 * For a server page, with the page's own session (RLS lets Coni and WAV select the rows): null when there is no failure
 * for WAV (`explicacion` is what `fallaParaFederico` answered, `ocurrencia` the piece's attempt or the card's
 * fingerprint, as the action reads them), else whether its email already went out, so the screen shows the button or
 * «Le avisé a Federico.».
 */
export async function leerAvisoAFederico(
  db: Db,
  entrada: { tipo: TipoDeAviso; id: string; explicacion: string | null; ocurrencia: string },
): Promise<{ avisado: boolean } | null> {
  if (entrada.explicacion === null) return null
  return avisadoOFalso(db, await claveDeAviso({ ...entrada, explicacion: entrada.explicacion }))
}

/** The same for a balance block at gate 1 (issue 101, decision 1), with the key the action claims. */
export function leerAvisoDeSaldo(
  db: Db,
  entrada: { id: string; motivo: MotivoDeSaldo; intento: number },
): Promise<{ avisado: boolean }> {
  return avisadoOFalso(db, claveDeAvisoDeSaldo(entrada))
}
