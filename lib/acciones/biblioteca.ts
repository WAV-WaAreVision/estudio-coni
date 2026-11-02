import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"
import { leerEdicion } from "@/lib/dominio/biblioteca/ficha"
import { ROLES, TIPOS_DE_AUTOR_NUEVO } from "@/lib/dominio/biblioteca/modelo"
import { Falla } from "@/lib/dominio/falla"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import type { DisparosDeBiblioteca } from "./disparos"
import { aResultado, ERROR_SOLO_CONI, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsBiblioteca {
  /** Coni's client: row level security applies, and `es_coni` is checked again here (spec A6). */
  db: Db
  disparar: Pick<DisparosDeBiblioteca, "material">
  /** The attempt of each new run (D2): a fresh key, so the failed run is never reused. */
  nuevoId: () => string
  almacen: Pick<Almacen, "urlDeTexto">
}

export const SobreMaterial = z.object({ materialId: z.uuid() })
export const EdicionDeMaterial = z.object({ materialId: z.uuid(), autorId: z.uuid(), rol: z.enum(ROLES) })
export const AutorNuevo = z.object({
  nombre: z.string().max(200),
  credencial: z.string().max(200),
  tipo: z.enum(TIPOS_DE_AUTOR_NUEVO),
})

const NO_PUDE_INICIAR = "No pude iniciar el procesamiento. Toca Reintentar en un rato."
export const NO_ENCONTRE = "No encontré ese material."
const NO_ES_EL_ESTADO = "22023"
const CLAVE_FORANEA = "23503"
/** A download link is for one tap. */
const SEGUNDOS_DE_DESCARGA = 5 * 60

/** Row level security lets WAV act on materials (F5); only Coni does it from Conidolly. */
async function exigirConi(db: Db): Promise<void> {
  const { data, error } = await db.rpc("es_coni")
  if (error) throw new Error(`No pude comprobar quién es: ${error.message}`, { cause: error })
  if (!data) throw new Falla(ERROR_SOLO_CONI)
}

/**
 * Starts the run under a new attempt. When it cannot start, the material gets a reason so it stops polling and can be
 * retried; if even that fails the log says which material is stuck.
 */
async function iniciar(deps: DepsBiblioteca, materialId: string, cuando: string): Promise<void> {
  try {
    await deps.disparar.material(materialId, deps.nuevoId())
  } catch (error) {
    console.error(`No pude iniciar el procesamiento del material ${materialId} al ${cuando}`, error)
    const { error: errorAlMarcar } = await deps.db.rpc("marcar_disparo_fallido", { p_id: materialId })
    if (errorAlMarcar) {
      console.error(`El material ${materialId} quedó procesando sin motivo: no pude marcarlo`, errorAlMarcar)
    }
    throw new Falla(NO_PUDE_INICIAR)
  }
}

type RpcDeMaterial = "reintentar_material" | "reprocesar_material" | "confirmar_costo_material"

/** The database goes first: it is what refuses a second tap. Then the run starts under its own attempt. */
function moverYProcesar(nombre: string, rpc: RpcDeMaterial, siNoCorresponde: string, cuando: string) {
  return (deps: DepsBiblioteca, materialId: string): Promise<Resultado> =>
    aResultado(nombre, async () => {
      await exigirConi(deps.db)
      const { error } = await deps.db.rpc(rpc, { p_id: materialId })
      if (error) {
        if (error.code === NO_ES_EL_ESTADO) throw new Falla(siNoCorresponde)
        throw new Error(`No pude ${cuando} el material ${materialId}: ${error.message}`, { cause: error })
      }
      await iniciar(deps, materialId, cuando)
      return {}
    })
}

/** A failed material, or one paused with a reason, back to processing. */
export const reintentarMaterial = moverYProcesar(
  "reintentarMaterial",
  "reintentar_material",
  "Ese material ya no se puede reintentar.",
  "reintentar",
)

/** A ready material through the whole process again; `reprocesar_material` drops what the old run derived. */
export const reprocesarMaterial = moverYProcesar(
  "reprocesarMaterial",
  "reprocesar_material",
  "Ese material no se puede reprocesar ahora.",
  "reprocesar",
)

/** "Procesar por ~US$ X": the task already stored the extraction, so it only spends on what is left. */
export const confirmarCosto = moverYProcesar(
  "confirmarCosto",
  "confirmar_costo_material",
  "Ese material ya no espera confirmación.",
  "confirmar el costo de",
)

/** Changes who a material is by and who it is for her. The column grants allow only these two. */
export function editarMaterial(deps: DepsBiblioteca, edicion: z.output<typeof EdicionDeMaterial>): Promise<Resultado> {
  return aResultado("editarMaterial", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("materiales")
      .update({ autor_id: edicion.autorId, rol: edicion.rol })
      .eq("id", edicion.materialId)
      .select("id")
    if (error) {
      if (error.code === CLAVE_FORANEA) throw new Falla("Ese autor ya no existe. Elígelo de nuevo.")
      throw new Error(`No pude cambiar el material ${edicion.materialId}: ${error.message}`, { cause: error })
    }
    if (data.length === 0) throw new Falla(NO_ENCONTRE)
    return {}
  })
}

/** Saves what she changed on a card: only the four fields, validated with her words. */
export function editarFicha(deps: DepsBiblioteca, entrada: unknown): Promise<Resultado> {
  return aResultado("editarFicha", async () => {
    await exigirConi(deps.db)
    const leida = leerEdicion(entrada)
    if (!leida.ok) throw new Falla(leida.error)
    const { materialId, resumen, ideasClave, citas, fuente } = leida.datos
    const { data, error } = await deps.db
      .from("fichas")
      .update({ resumen, ideas_clave: ideasClave, citas, fuente })
      .eq("material_id", materialId)
      .select("material_id")
    if (error)
      throw new Error(`No pude guardar la ficha del material ${materialId}: ${error.message}`, { cause: error })
    if (data.length === 0) throw new Falla("Ese material todavía no tiene ficha.")
    return {}
  })
}

/** "Autor nuevo": `crear_autor` answers the existing one when the name or an alias was already taken. */
export function crearAutor(
  deps: Pick<DepsBiblioteca, "db">,
  nuevo: z.output<typeof AutorNuevo>,
): Promise<Resultado<{ autor: AutorDeLista }>> {
  return aResultado("crearAutor", async () => {
    await exigirConi(deps.db)
    const nombre = nuevo.nombre.trim()
    if (nombre === "") throw new Falla("Escribe el nombre del autor.")
    const { data: id, error } = await deps.db.rpc("crear_autor", {
      p_nombre: nombre,
      p_credencial: nuevo.credencial.trim(),
      p_tipo: nuevo.tipo,
    })
    if (error) throw new Error(`No pude crear el autor: ${error.message}`, { cause: error })
    const { data: autor, error: errorDeLectura } = await deps.db
      .from("autores")
      .select("id, nombre, credencial, tipo, alias")
      .eq("id", id)
      .single()
    if (errorDeLectura)
      throw new Error(`No pude leer el autor ${id}: ${errorDeLectura.message}`, { cause: errorDeLectura })
    return { autor }
  })
}

/** A five-minute link to the original text (the extraction, never a translation). The file never passes through here. */
export function pedirTextoOriginal(
  deps: Pick<DepsBiblioteca, "db" | "almacen">,
  materialId: string,
): Promise<Resultado<{ url: string }>> {
  return aResultado("pedirTextoOriginal", async () => {
    await exigirConi(deps.db)
    // R2 can outlive the row (a deleted material): only a material she can read through row level security is signed.
    const { data, error } = await deps.db.from("materiales").select("id").eq("id", materialId).maybeSingle()
    if (error) throw new Error(`No pude leer el material ${materialId}: ${error.message}`, { cause: error })
    if (!data) throw new Falla(NO_ENCONTRE)
    const url = await deps.almacen.urlDeTexto(materialId, SEGUNDOS_DE_DESCARGA)
    if (url === null) throw new Falla("Ese texto todavía no está disponible.")
    return { url }
  })
}
