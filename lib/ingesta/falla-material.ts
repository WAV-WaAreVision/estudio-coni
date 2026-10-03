import type { SupabaseClient } from "@supabase/supabase-js"
import { Falla } from "@/lib/dominio/falla"
import { DemasiadoLargo, SinTexto } from "@/lib/ingesta/extraer"
import { MedioIlegible } from "@/lib/ingesta/medios"
import { EnlaceDemasiadoGrande, EnlaceNoPermitido } from "@/lib/ingesta/red-segura"
import { detalleTecnico } from "@/lib/produccion/fallas"
import { RechazoDeClaude } from "@/lib/proveedores/anthropic"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

/** The material cannot be processed and trying again will not change that: Coni sees the message as-is. */
export class MaterialNoProcesable extends Falla {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "MaterialNoProcesable"
  }
}

export const MOTIVO_GENERICO = "No pude procesar el material. WAV ya está revisando."
const MOTIVO_DE_RECHAZO = "Claude no quiso procesar este material. Prueba con otro."

/** What Coni reads: her own message when the error was written for her, a generic notice when it was written for WAV. */
export function motivoParaConi(error: unknown): string {
  if (error instanceof RechazoDeClaude) return MOTIVO_DE_RECHAZO
  return error instanceof Falla ? error.message : MOTIVO_GENERICO
}

/**
 * The reason when the error is final, null when it may pass by retrying. A failed translation is a Falla too, but
 * "reintenta" is its own advice: it goes back to Trigger.dev and only shows up here once the retries are over.
 */
export function motivoDefinitivo(error: unknown): string | null {
  const definitivo =
    error instanceof SinTexto ||
    error instanceof DemasiadoLargo ||
    error instanceof EnlaceNoPermitido ||
    error instanceof EnlaceDemasiadoGrande ||
    error instanceof MaterialNoProcesable ||
    error instanceof MedioIlegible ||
    error instanceof RechazoDeClaude
  return definitivo ? motivoParaConi(error) : null
}

type Db = SupabaseClient<Database>

/** A material that is already ready stays ready: a late failure of an old run must not undo it. */
export async function marcarFallido(db: Db, materialId: string, motivo: string): Promise<void> {
  const { error } = await db
    .from("materiales")
    .update({ estado: "fallido", motivo_fallo: motivo, corrida_id: null, corrida_desde: null })
    .eq("id", materialId)
    .neq("estado", "listo")
  if (error) throw new Error(`No pude marcar el material ${materialId} como fallido: ${error.message}`)
}

export interface DepsFallaMaterial {
  db: Db
  avisos: Notificador
}

/**
 * The `onFailure` of `procesar-material`: the retries are over, so the material says why in words Coni can read and
 * WAV gets the technical detail.
 */
export async function alFallarMaterial(
  deps: DepsFallaMaterial,
  entrada: { materialId: string; corrida: string; error: unknown },
): Promise<void> {
  await marcarFallido(deps.db, entrada.materialId, motivoParaConi(entrada.error))
  // Deleted meanwhile: there is nothing left to fix, so WAV is not bothered.
  const { data, error } = await deps.db.from("materiales").select("id").eq("id", entrada.materialId).maybeSingle()
  if (error) throw new Error(`No pude leer el material ${entrada.materialId}: ${error.message}`)
  if (!data) return
  await deps.avisos.aWav(
    "Falló procesar-material",
    [`Corrida: ${entrada.corrida}`, `Material: ${entrada.materialId}`, detalleTecnico(entrada.error)].join("\n"),
  )
}
