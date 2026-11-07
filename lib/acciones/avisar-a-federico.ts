import type { SupabaseClient } from "@supabase/supabase-js"
import {
  asuntoDeAviso,
  claveDeAviso,
  cuerpoDeAviso,
  fallaParaFederico,
  TEXTO_YA_NO_FALLA,
  type TipoDeAviso,
} from "@/lib/dominio/avisar-a-federico"
import { Falla } from "@/lib/dominio/falla"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsAvisar {
  /** A `service_role` client: the action reads the entity itself and calls the claim functions. */
  db: Db
  /** Resolved on use, like the other actions (a missing Resend key must not break the screen). */
  avisos: () => Notificador
}

export type EntradaAvisar = { tipo: TipoDeAviso; id: string }

type FallaLeida = { titulo: string; explicacion: string }

async function fallaDeLaPieza(db: Db, id: string): Promise<FallaLeida | null> {
  const { data, error } = await db.from("piezas").select("titulo, estado, explicacion").eq("id", id).maybeSingle()
  if (error) throw new Error(`No pude leer la pieza ${id}: ${error.message}`, { cause: error })
  if (!data) return null
  const explicacion = fallaParaFederico({ tipo: "pieza", estado: data.estado, explicacion: data.explicacion })
  return explicacion === null ? null : { titulo: data.titulo, explicacion }
}

async function fallaDelMaterial(db: Db, id: string): Promise<FallaLeida | null> {
  const { data, error } = await db
    .from("materiales")
    .select("titulo, estado, rol, fichas ( resumen, ideas_clave, citas, fuente )")
    .eq("id", id)
    .is("borrar_desde", null)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el material ${id}: ${error.message}`, { cause: error })
  if (!data) return null
  const filaDeFicha = (Array.isArray(data.fichas) ? data.fichas[0] : data.fichas) ?? null
  const explicacion = fallaParaFederico({ tipo: "material", estado: data.estado, rol: data.rol, filaDeFicha })
  return explicacion === null ? null : { titulo: data.titulo ?? "Sin título", explicacion }
}

/**
 * Spec 2026-11-07, decision 6 and amendment A11: Coni tells WAV about a failure only WAV can fix. The entity is read
 * here (never the screen's text) and a failure that is gone is refused. One email per failure: only the caller that
 * claims its row sends it, the row is marked once sent, and a failed send lets go so her next tap sends it. A tap on a
 * failure already told (or being told) answers ok: the screen says Federico knows.
 */
export function avisarAFederico(deps: DepsAvisar, entrada: EntradaAvisar): Promise<Resultado> {
  return aResultado("avisarAFederico", async () => {
    const falla =
      entrada.tipo === "pieza" ? await fallaDeLaPieza(deps.db, entrada.id) : await fallaDelMaterial(deps.db, entrada.id)
    if (falla === null) throw new Falla(TEXTO_YA_NO_FALLA)
    const clave = await claveDeAviso({ tipo: entrada.tipo, id: entrada.id, explicacion: falla.explicacion })

    const { data: avisar, error } = await deps.db.rpc("reclamar_aviso_a_federico", {
      p_clave: clave,
      p_tipo: entrada.tipo,
      p_entidad_id: entrada.id,
    })
    if (error) throw new Error(`No pude reclamar el aviso ${clave}: ${error.message}`, { cause: error })
    if (!avisar) return {}

    try {
      await deps.avisos().aWav(asuntoDeAviso(falla.titulo), cuerpoDeAviso({ ...entrada, ...falla }))
    } catch (errorAlAvisar) {
      // The send's error is the one to answer; a claim that could not be let go is handed on after five minutes.
      const { error: errorAlSoltar } = await deps.db.rpc("soltar_aviso_a_federico", { p_clave: clave })
      if (errorAlSoltar) console.error(`No pude soltar el aviso ${clave}`, errorAlSoltar)
      throw errorAlAvisar
    }
    const { error: errorAlMarcar } = await deps.db.rpc("marcar_aviso_a_federico_enviado", { p_clave: clave })
    if (errorAlMarcar) {
      throw new Error(`No pude marcar como enviado el aviso ${clave}: ${errorAlMarcar.message}`, {
        cause: errorAlMarcar,
      })
    }
    return {}
  })
}

/** Whether WAV's email for this failure went out: the screen then says «Le avisé a Federico.» instead of the button. */
export async function yaAvisado(db: Db, clave: string): Promise<boolean> {
  const { data, error } = await db.from("avisos_a_federico").select("enviado_en").eq("clave", clave).maybeSingle()
  if (error) throw new Error(`No pude leer el aviso ${clave}: ${error.message}`, { cause: error })
  return data?.enviado_en != null
}
