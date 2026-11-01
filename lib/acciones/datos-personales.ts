import type { SupabaseClient } from "@supabase/supabase-js"
import { Falla } from "@/lib/dominio/falla"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

/**
 * The refusals of the RPCs that Coni can fix herself. Anything else (`solo_coni_*`, which her own session never hits,
 * or a database error) is WAV's: logged, generic notice.
 */
const PARA_CONI = new Map([
  ["texto_fuera_de_largo", "El texto tiene que tener entre 300 y 6.000 caracteres."],
  ["falta_motivo", "Escribe en pocas palabras por qué lo cambias."],
  ["motivo_largo", "El motivo puede tener hasta 300 caracteres. Acórtalo un poco."],
  ["version_desconocida", "Esa versión ya no existe. Vuelve a abrir la pantalla."],
  ["no_publicada", "Esa versión nunca estuvo publicada. Elige una del historial."],
])

function falloDeRpc(que: string, error: { message: string }): Error {
  const paraConi = PARA_CONI.get(error.message)
  return paraConi ? new Falla(paraConi) : new Error(`No pude ${que}: ${error.message}`, { cause: error })
}

/** «Lo revisé» in Ajustes › Datos personales. */
export function marcarInventarioRevisado(db: Db): Promise<Resultado<{ revisadoEn: string }>> {
  return aResultado("marcarInventarioRevisado", async () => {
    const { data, error } = await db.rpc("marcar_inventario_revisado")
    if (error) throw falloDeRpc("anotar la revisión del registro", error)
    return { revisadoEn: data }
  })
}

/** «Publicar» in Ajustes › Página de IA: a new version that is the public page from now on. */
export function publicarTransparencia(
  db: Db,
  entrada: { texto: string; motivo: string },
): Promise<Resultado<{ version: number }>> {
  return aResultado("publicarTransparencia", async () => {
    const { data, error } = await db.rpc("publicar_transparencia", { p_texto: entrada.texto, p_motivo: entrada.motivo })
    if (error) throw falloDeRpc("publicar la página de IA", error)
    return { version: data }
  })
}

/** «Volver a esta»: the text of an earlier version, published again as a new one. */
export function volverATransparencia(db: Db, version: number): Promise<Resultado<{ version: number }>> {
  return aResultado("volverATransparencia", async () => {
    const { data, error } = await db.rpc("volver_a_transparencia", { p_version: version })
    if (error) throw falloDeRpc("volver a una versión de la página de IA", error)
    return { version: data }
  })
}
