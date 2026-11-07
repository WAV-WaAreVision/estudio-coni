import type { SupabaseClient } from "@supabase/supabase-js"
import { yaAvisado } from "@/lib/acciones/avisar-a-federico"
import { claveDeAviso, type TipoDeAviso } from "@/lib/dominio/avisar-a-federico"
import type { Database } from "@/lib/supabase/database.types"

/**
 * For a server page, after Coni's session, with the service client: null when there is no failure for WAV
 * (`explicacion` is what `fallaParaFederico` answered), else whether its email already went out, so the screen shows
 * the button or «Le avisé a Federico.».
 */
export async function leerAvisoAFederico(
  servicio: SupabaseClient<Database>,
  entrada: { tipo: TipoDeAviso; id: string; explicacion: string | null },
): Promise<{ avisado: boolean } | null> {
  if (entrada.explicacion === null) return null
  const clave = await claveDeAviso({ tipo: entrada.tipo, id: entrada.id, explicacion: entrada.explicacion })
  return { avisado: await yaAvisado(servicio, clave) }
}
