import type { SupabaseClient } from "@supabase/supabase-js"
import {
  asuntoDeAviso,
  claveDeAviso,
  cuerpoDeAviso,
  fallaParaFederico,
  ocurrenciaDeFicha,
  ocurrenciaDePieza,
  TEXTO_AVISANDO,
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

/** `ocurrencia` tells this failure apart from the same text on another attempt or run (`claveDeAviso`). */
type FallaLeida = { titulo: string; explicacion: string; ocurrencia: string }

async function fallaDeLaPieza(db: Db, id: string): Promise<FallaLeida | null> {
  const { data, error } = await db
    .from("piezas")
    .select("titulo, estado, explicacion, intento")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`No pude leer la pieza ${id}: ${error.message}`, { cause: error })
  if (!data) return null
  const explicacion = fallaParaFederico({ tipo: "pieza", estado: data.estado, explicacion: data.explicacion })
  return explicacion === null ? null : { titulo: data.titulo, explicacion, ocurrencia: ocurrenciaDePieza(data.intento) }
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
  if (explicacion === null || filaDeFicha === null) return null
  return { titulo: data.titulo ?? "Sin título", explicacion, ocurrencia: await ocurrenciaDeFicha(filaDeFicha) }
}

/**
 * Spec 2026-11-07, decision 6 and amendment A11: Coni tells WAV about a failure only WAV can fix. The entity is read
 * here (never the screen's text) and a failure that is gone is refused. One email per failure: only the caller that
 * claims its row sends it, the row is marked once sent, and a failed send lets go so her next tap sends it. A tap on a
 * failure already told answers ok (the screen says Federico knows); one while another tap is still sending asks her to
 * try again in a moment.
 */
export function avisarAFederico(deps: DepsAvisar, entrada: EntradaAvisar): Promise<Resultado> {
  return aResultado("avisarAFederico", async () => {
    const falla =
      entrada.tipo === "pieza" ? await fallaDeLaPieza(deps.db, entrada.id) : await fallaDelMaterial(deps.db, entrada.id)
    if (falla === null) throw new Falla(TEXTO_YA_NO_FALLA)
    const clave = await claveDeAviso({
      tipo: entrada.tipo,
      id: entrada.id,
      explicacion: falla.explicacion,
      ocurrencia: falla.ocurrencia,
    })

    const { data: estado, error } = await deps.db.rpc("reclamar_aviso_a_federico", {
      p_clave: clave,
      p_tipo: entrada.tipo,
      p_entidad_id: entrada.id,
    })
    if (error) throw new Error(`No pude reclamar el aviso ${clave}: ${error.message}`, { cause: error })
    if (estado === "enviado") return {}
    // Another tap holds it and nothing went out yet: an ok now would say Federico knows before he does.
    if (estado === "en_curso") throw new Falla(TEXTO_AVISANDO)
    if (estado !== "tuyo") throw new Error(`reclamar_aviso_a_federico respondió «${estado}» para ${clave}`)

    try {
      await deps
        .avisos()
        .aWav(
          asuntoDeAviso(falla.titulo),
          cuerpoDeAviso({ ...entrada, titulo: falla.titulo, explicacion: falla.explicacion }),
          clave,
        )
    } catch (errorAlAvisar) {
      // The send's error is the one to answer; a claim that could not be let go is handed on after five minutes.
      const { error: errorAlSoltar } = await deps.db.rpc("soltar_aviso_a_federico", { p_clave: clave })
      if (errorAlSoltar) console.error(`No pude soltar el aviso ${clave}`, errorAlSoltar)
      throw errorAlAvisar
    }
    const { error: errorAlMarcar } = await deps.db.rpc("marcar_aviso_a_federico_enviado", { p_clave: clave })
    // The email went out: she hears ok. A retry once the claim is handed on resends under the same Idempotency-Key, which
    // Resend answers without a second email.
    if (errorAlMarcar) console.error(`No pude marcar como enviado el aviso ${clave}`, errorAlMarcar)
    return {}
  })
}

/** Whether WAV's email for this failure went out: the screen then says «Le avisé a Federico.» instead of the button. */
export async function yaAvisado(db: Db, clave: string): Promise<boolean> {
  const { data, error } = await db.from("avisos_a_federico").select("enviado_en").eq("clave", clave).maybeSingle()
  if (error) throw new Error(`No pude leer el aviso ${clave}: ${error.message}`, { cause: error })
  return data?.enviado_en != null
}
