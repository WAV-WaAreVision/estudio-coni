import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { CAMPOS, RECHAZOS_DE_ETIQUETA } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { Falla } from "@/lib/dominio/falla"
import { MARCAS } from "@/lib/dominio/vocabulario"
import type { Database } from "@/lib/supabase/database.types"
import { exigirConi } from "./biblioteca"
import { aResultado, ERROR_SOLO_CONI, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

const RED = z.enum(["linkedin", "instagram", "todas"])
const TEXTO_CORTO = z.string().max(500)

export const CorreccionDeEtiqueta = z.object({
  afirmacionId: z.uuid(),
  campo: z.enum(CAMPOS),
  red: RED,
  valor: z.string().max(120),
  frase: TEXTO_CORTO,
  porQue: TEXTO_CORTO,
  marcaId: z.uuid().nullable(),
})
export const ConfirmacionDeEtiqueta = z.object({
  afirmacionId: z.uuid(),
  campo: z.enum(CAMPOS),
  red: RED,
  marcaId: z.uuid().nullable(),
})
export const RetiroDeMarca = z.object({
  afirmacionId: z.uuid(),
  marca: z.enum(MARCAS),
  red: RED,
  marcaId: z.uuid().nullable(),
})

/** A database refusal in her words, or the error as it came for WAV's log. */
export function rechazo(que: string, error: { message: string }): Error {
  if (error.message === "solo_coni_corrige") return new Falla(ERROR_SOLO_CONI)
  // Own keys only: a message such as `toString` must not read the prototype.
  const texto = Object.hasOwn(RECHAZOS_DE_ETIQUETA, error.message) ? RECHAZOS_DE_ETIQUETA[error.message] : undefined
  return texto ? new Falla(texto) : new Error(`${que}: ${error.message}`, { cause: error })
}

// The functions check everything again; the mark's row goes only when the screen names one (plan decision 1).
const conMarca = (marcaId: string | null) => (marcaId ? { p_marca_id: marcaId } : {})

/** «Cambiar», «Guardar» after «Agregar»: corregir_etiqueta logs corrige, agrega or confirma. */
export function corregirEtiqueta(deps: { db: Db }, c: z.output<typeof CorreccionDeEtiqueta>): Promise<Resultado> {
  return aResultado("corregirEtiqueta", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("corregir_etiqueta", {
      p_afirmacion: c.afirmacionId,
      p_campo: c.campo,
      p_red: c.red,
      p_valor: c.valor,
      p_frase: c.frase,
      p_por_que: c.porQue,
      ...conMarca(c.marcaId),
    })
    if (error) throw rechazo(`No pude corregir ${c.campo} de la idea ${c.afirmacionId}`, error)
    return {}
  })
}

/** «Está bien». */
export function confirmarEtiqueta(deps: { db: Db }, c: z.output<typeof ConfirmacionDeEtiqueta>): Promise<Resultado> {
  return aResultado("confirmarEtiqueta", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("confirmar_etiqueta", {
      p_afirmacion: c.afirmacionId,
      p_campo: c.campo,
      p_red: c.red,
      ...conMarca(c.marcaId),
    })
    if (error) throw rechazo(`No pude confirmar ${c.campo} de la idea ${c.afirmacionId}`, error)
    return {}
  })
}

/** «Quitar», after its confirmation. */
export function quitarMarca(deps: { db: Db }, r: z.output<typeof RetiroDeMarca>): Promise<Resultado> {
  return aResultado("quitarMarca", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("quitar_marca", {
      p_afirmacion: r.afirmacionId,
      p_marca: r.marca,
      p_red: r.red,
      ...conMarca(r.marcaId),
    })
    if (error) throw rechazo(`No pude quitar ${r.marca} de la idea ${r.afirmacionId}`, error)
    return {}
  })
}
