import { leerDatosDeMetricas } from "@/lib/datos/metricas"
import { construirMetricas, TEXTO_SIN_NUMEROS } from "@/lib/metricas/modelo"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { DepsMetricas } from "./diarias"

/**
 * Issue 111: while Métricas tells Coni that not one reel has numbers, WAV hears it every morning. The check is the
 * screen's own notice, so the two cannot drift. A send that fails throws: the run fails and its own alert reaches WAV.
 */
export async function avisarSiFaltanNumeros(deps: {
  avisos: () => Notificador
  ahora: () => string
  leerAviso: () => Promise<string | null>
}): Promise<boolean> {
  if ((await deps.leerAviso()) !== TEXTO_SIN_NUMEROS) return false
  await deps
    .avisos()
    .aWav(
      "Coni no tiene números de sus reels",
      "Hay reels publicados hace más de dos días y ninguno tiene métricas. Revisa la corrida de hoy de metricas-diarias en Trigger.dev y la conexión de Instagram.",
      `metricas-sin-numeros:${deps.ahora().slice(0, 10)}`,
    )
  return true
}

/** What Métricas shows right now, read the way its page reads it. */
export async function avisoDeMetricas(deps: DepsMetricas): Promise<string | null> {
  return construirMetricas(await leerDatosDeMetricas(deps.db, Date.parse(deps.ahora()))).aviso
}
