import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { type ContextoDePago, falloDeBase, pagadoAntesEn, pagarPaso, redondear } from "@/lib/ingesta/gasto-material"
import { MOTIVO_TOPE } from "@/lib/ingesta/procesar"
import { leerFichas } from "@/lib/ingesta/vincular"
import { detalleTecnico } from "@/lib/produccion/fallas"
import type { Almacen } from "@/lib/proveedores/almacen"
import {
  costoClaude,
  type FichaParaVincular,
  MODELO_POR_TAREA,
  MOTIVO_TEORIA_SIN_SUSTENTO,
  RechazoDeClaude,
  sintetizarTeoria,
  TeoriaSinSustento,
} from "@/lib/proveedores/anthropic"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

export interface DepsTeoria {
  /** A `service_role` client: only the service writes the synthesis. */
  db: Db
  almacen: Almacen
  claude: Anthropic
  ahora: () => string
}

export type ResultadoTeoria =
  | { resultado: "borrador" }
  | { resultado: "ya_resuelta" }
  | { resultado: "borrada" }
  | { resultado: "tope" }
  | { resultado: "fallida"; motivo: string }

export const MOTIVO_GENERICO_TEORIA = "No pude armar la teoría. WAV ya está revisando."
const MOTIVO_RECHAZO_TEORIA = "Claude no quiso armar esta teoría. Prueba con otras fuentes."
const MOTIVO_SIN_FUENTES = "Quedan menos de dos fuentes con ficha. Arma la teoría de nuevo con otros materiales."

// Over-estimates, like every reservation: the real cost replaces them on confirming.
const TOKENS_FIJOS_TEORIA = 2_000
const TOKENS_DE_SALIDA_TEORIA = 3_000
const CARACTERES_POR_TOKEN = 3

/** The theory was deleted while the run was working: not an error, nothing to retry and nobody to alert. */
class TeoriaBorrada extends Error {
  constructor() {
    super("La teoría fue borrada mientras se armaba.")
    this.name = "TeoriaBorrada"
  }
}

/** Fewer than two of the sources still have a card (a material was deleted): trying again will not change that. */
class TeoriaSinFuentes extends Falla {
  constructor() {
    super(MOTIVO_SIN_FUENTES)
    this.name = "TeoriaSinFuentes"
  }
}

const Sintesis = z.union([
  z.object({ sinSustento: z.literal(true) }),
  z.object({
    titulo: z.string(),
    tesis: z.string(),
    argumentos: z.array(
      z.object({ materialId: z.string(), aporte: z.string(), cita: z.string(), ubicacion: z.string() }),
    ),
    contradicciones: z.array(z.object({ materialIds: z.array(z.string()), descripcion: z.string() })),
  }),
])

export function estimarTeoria(fichas: readonly FichaParaVincular[]): number {
  const caracteres = fichas.reduce(
    (total, f) => total + [f.titulo, f.resumen, ...f.ideas, ...f.citas].join("").length,
    0,
  )
  return redondear(
    costoClaude(
      {
        input_tokens: Math.ceil(caracteres / CARACTERES_POR_TOKEN) + TOKENS_FIJOS_TEORIA,
        output_tokens: TOKENS_DE_SALIDA_TEORIA,
      },
      MODELO_POR_TAREA.sintetizarTeoria.modelo,
    ),
  )
}

async function existeTeoria(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.from("teorias").select("id").eq("id", id).maybeSingle()
  if (error) throw falloDeBase("No pude leer la teoría", error)
  return data !== null
}

async function fichasDeLasFuentes(db: Db, teoriaId: string): Promise<FichaParaVincular[]> {
  const { data, error } = await db.from("teoria_fuentes").select("material_id").eq("teoria_id", teoriaId)
  if (error) throw falloDeBase("No pude leer las fuentes de la teoría", error)
  const fichas = await leerFichas(
    db,
    data.map((f) => f.material_id),
  )
  return [...fichas.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Why a theory failed, as the retry reads it: `sin_sustento` is final (the verdict is kept in the store, so trying
 * again would only repeat it), `tope` and `error` may pass by retrying. The cap is never stored as a verdict.
 */
export type MotivoCodigoTeoria = "sin_sustento" | "tope" | "error"

/** Only a theory still waiting is touched: a late failure of an old run must not undo a result. Says whether it was. */
async function marcarFallida(db: Db, id: string, motivo: string, codigo: MotivoCodigoTeoria): Promise<boolean> {
  const { data, error } = await db
    .from("teorias")
    .update({ estado: "fallida", motivo_fallo: motivo, motivo_codigo: codigo })
    .eq("id", id)
    .eq("estado", "sintetizando")
    .select("id")
  if (error) throw falloDeBase(`No pude marcar la teoría ${id} como fallida`, error)
  return data.length > 0
}

async function sintetizar(deps: DepsTeoria, teoriaId: string): Promise<ResultadoTeoria> {
  const { db, almacen, claude, ahora } = deps
  const fichas = await fichasDeLasFuentes(db, teoriaId)
  if (fichas.length < 2) throw new TeoriaSinFuentes()

  const pago: ContextoDePago = {
    db,
    almacen,
    ahora,
    clave: () => `teoria:${teoriaId}:${crypto.randomUUID()}`,
    verificar: async () => {
      if (!(await existeTeoria(db, teoriaId))) throw new TeoriaBorrada()
    },
  }
  const archivo = `teorias/${teoriaId}/sintesis.json`
  let sintesis = await pagadoAntesEn(pago, archivo, Sintesis)
  if (!sintesis) {
    const pagado = await pagarPaso<z.infer<typeof Sintesis>>(pago, {
      archivo,
      proveedor: "anthropic",
      paso: "teoria",
      estimadoUsd: estimarTeoria(fichas),
      llamar: async () => {
        const modelo = MODELO_POR_TAREA.sintetizarTeoria.modelo
        try {
          const { uso, ...teoria } = await sintetizarTeoria({ cliente: claude, fichas })
          return { datos: teoria, realUsd: costoClaude(uso, modelo) }
        } catch (falla) {
          // The call was paid for and keeping its verdict means a retry does not pay again.
          if (!(falla instanceof TeoriaSinSustento)) throw falla
          return { datos: { sinSustento: true as const }, realUsd: costoClaude(falla.uso, modelo) }
        }
      },
    })
    if (pagado.tope) {
      await marcarFallida(db, teoriaId, MOTIVO_TOPE, "tope")
      return { resultado: "tope" }
    }
    sintesis = pagado.datos
  }
  if ("sinSustento" in sintesis) {
    await marcarFallida(db, teoriaId, MOTIVO_TEORIA_SIN_SUSTENTO, "sin_sustento")
    return { resultado: "fallida", motivo: MOTIVO_TEORIA_SIN_SUSTENTO }
  }
  const { data, error } = await db
    .from("teorias")
    .update({
      titulo: sintesis.titulo,
      tesis: sintesis.tesis,
      argumentos: sintesis.argumentos,
      contradicciones: sintesis.contradicciones,
      estado: "borrador",
      motivo_fallo: null,
      motivo_codigo: null,
    })
    .eq("id", teoriaId)
    .eq("estado", "sintetizando")
    .select("id")
  if (error) throw falloDeBase("No pude guardar la teoría", error)
  return { resultado: data.length > 0 ? "borrador" : "ya_resuelta" }
}

/** The reason when the error is final, null when it may pass by retrying. */
function motivoDefinitivo(error: unknown): string | null {
  if (error instanceof RechazoDeClaude) return MOTIVO_RECHAZO_TEORIA
  if (error instanceof TeoriaSinFuentes) return error.message
  return null
}

/**
 * Weaves the cards of a theory's sources into a draft: one Claude call paid against the cap, its result kept in the
 * store so a retry never pays twice. A theory that is deleted or already resolved is left alone. Final errors mark
 * the theory fallida with a reason Coni can read; anything else throws so Trigger.dev retries.
 */
export async function armarTeoria(deps: DepsTeoria, teoriaId: string): Promise<ResultadoTeoria> {
  const { data, error } = await deps.db.from("teorias").select("estado").eq("id", teoriaId).maybeSingle()
  if (error) throw falloDeBase("No pude leer la teoría", error)
  if (!data) return { resultado: "borrada" }
  if (data.estado !== "sintetizando") return { resultado: "ya_resuelta" }
  try {
    return await sintetizar(deps, teoriaId)
  } catch (falla) {
    if (falla instanceof TeoriaBorrada) return { resultado: "borrada" }
    const motivo = motivoDefinitivo(falla)
    if (motivo === null) throw falla
    await marcarFallida(deps.db, teoriaId, motivo, "error")
    return { resultado: "fallida", motivo }
  }
}

export interface DepsFallaTeoria {
  db: Db
  avisos: Notificador
}

/**
 * The `onFailure` of `sintetizar-teoria`: the retries are over, so the theory says why in words Coni can read and
 * WAV gets the technical detail. A theory that already has its result stays as it is, and WAV is not bothered.
 */
export async function alFallarTeoria(
  deps: DepsFallaTeoria,
  entrada: { teoriaId: string; corrida: string; error: unknown },
): Promise<void> {
  const motivo = entrada.error instanceof Falla ? entrada.error.message : MOTIVO_GENERICO_TEORIA
  if (!(await marcarFallida(deps.db, entrada.teoriaId, motivo, "error"))) return
  await deps.avisos.aWav(
    "Falló sintetizar-teoria",
    [`Corrida: ${entrada.corrida}`, `Teoría: ${entrada.teoriaId}`, detalleTecnico(entrada.error)].join("\n"),
  )
}
