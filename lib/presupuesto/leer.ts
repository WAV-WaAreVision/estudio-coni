import type { SupabaseClient } from "@supabase/supabase-js"
import { limiteDelMes } from "@/lib/datos/repositorio"
import { aCuatroDecimales, ESTIMADO_POR_GUION_USD } from "@/lib/produccion/comun"
import type { Database } from "@/lib/supabase/database.types"
import { claveDelAvisoDeLimite, mesDelGasto } from "./limite"
import { esProveedor, type PresupuestoDelMes, type Proveedor } from "./presentar"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

/** Reserved money counts at its estimate and confirmed money at its real cost, as `reservar_gasto` counts them. */
function montoDe(gasto: { estado: string; estimado_usd: number; real_usd: number | null }): number {
  return gasto.estado === "confirmado" ? (gasto.real_usd ?? gasto.estimado_usd) : gasto.estimado_usd
}

/**
 * Whether the month's limit notice is still unread. After «Reactivar» only a notice created after `fijado_en` counts:
 * a run whose transaction began before the reactivation can commit its notice just after fijar_limite_del_mes marked
 * the month's notices read, and that stale notice must not pause the screen again. The comparison runs in the
 * database, at full timestamp precision.
 */
async function hayAvisoSinLeer(db: Db, mes: string, fijadoEn: string | null): Promise<boolean> {
  let consulta = db.from("avisos").select("id").eq("clave", claveDelAvisoDeLimite(mes)).is("leido_en", null)
  if (fijadoEn !== null) consulta = consulta.gt("creado_en", fijadoEn)
  const { data, error } = await consulta.maybeSingle()
  if (error) throw fallo("No pude leer el aviso del límite", error)
  return data !== null
}

/**
 * Ajustes › Presupuesto, read through Coni's session (every table here is hers to read), for the Santiago month of
 * `ahora`. The engine's spend is its `motor` step; the nightly merges are the `temas:fusionar:` reservations.
 */
export async function leerPresupuestoDelMes(db: Db, ahora: number): Promise<PresupuestoDelMes> {
  const instante = new Date(ahora).toISOString()
  const mes = mesDelGasto(instante)
  const primerDia = `${mes}-01`
  const [ajustes, gastos, filaDelMes, limite] = await Promise.all([
    db
      .from("ajustes")
      .select("tope_mensual_usd, limite_duro_usd, motor_semanal_activo, fusiones_nocturnas_activas")
      .maybeSingle(),
    db
      .from("gastos")
      .select("proveedor, paso, clave, estado, estimado_usd, real_usd")
      .eq("mes", primerDia)
      .in("estado", ["reservado", "confirmado"]),
    db.from("limites_del_mes").select("fijado_en").eq("mes", primerDia).maybeSingle(),
    limiteDelMes(db, instante),
  ])
  if (ajustes.error) throw fallo("No pude leer los ajustes del presupuesto", ajustes.error)
  if (!ajustes.data) throw new Error("Falta la fila de ajustes.")
  if (gastos.error) throw fallo("No pude leer los gastos del mes", gastos.error)
  if (filaDelMes.error) throw fallo("No pude leer el límite del mes", filaDelMes.error)
  const avisoSinLeer = await hayAvisoSinLeer(db, mes, filaDelMes.data?.fijado_en ?? null)

  const porProveedor: Record<Proveedor, number> = { anthropic: 0, elevenlabs: 0, heygen: 0, voyage: 0 }
  let usado = 0
  let motor = 0
  let fusiones = 0
  for (const gasto of gastos.data) {
    const monto = montoDe(gasto)
    usado += monto
    if (esProveedor(gasto.proveedor)) porProveedor[gasto.proveedor] += monto
    if (gasto.paso === "motor") motor += monto
    if (gasto.clave.startsWith("temas:fusionar:")) fusiones += monto
  }
  return {
    tope: ajustes.data.tope_mensual_usd,
    limiteExplicito: ajustes.data.limite_duro_usd,
    limite,
    reactivado: filaDelMes.data !== null,
    // Summed as floats; rounded once here, at the four decimals the database keeps.
    usado: aCuatroDecimales(usado),
    porProveedor: {
      anthropic: aCuatroDecimales(porProveedor.anthropic),
      elevenlabs: aCuatroDecimales(porProveedor.elevenlabs),
      heygen: aCuatroDecimales(porProveedor.heygen),
      voyage: aCuatroDecimales(porProveedor.voyage),
    },
    motor: { activo: ajustes.data.motor_semanal_activo, usd: aCuatroDecimales(motor) },
    fusiones: { activas: ajustes.data.fusiones_nocturnas_activas, usd: aCuatroDecimales(fusiones) },
    avisoSinLeer,
    margenUsd: ESTIMADO_POR_GUION_USD,
  }
}
