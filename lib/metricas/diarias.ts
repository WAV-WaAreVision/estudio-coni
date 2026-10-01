import type { SupabaseClient } from "@supabase/supabase-js"
import {
  guardarLecturaDeCuenta,
  guardarLecturaDeReel,
  leerReelsPublicados,
  leerZona,
  olvidarVisitasDeClics,
} from "@/lib/datos/metricas"
import { leerCuentaMeta, leerSecreto } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { diaLocal, instanteLocal } from "@/lib/dominio/fechas"
import { sumarDias } from "@/lib/dominio/metricas"
import { enSerie } from "@/lib/mantenimiento/ejecutar"
import { TokenVencido } from "@/lib/proveedores/instagram"
import { leerMetricasDeReel, leerToquesDePerfil } from "@/lib/proveedores/instagram-metricas"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsMetricas {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  ahora: () => string
}

export type ResultadoMetricas =
  | { estado: "sin_cuenta" }
  /** `sinLectura` counts reels Instagram refuses for good (deleted, no insights): they show "sin números". */
  | { estado: "leidas"; reels: number; sinLectura: number; dias: number }

/**
 * The account figure lags up to 48 hours (Meta's docs), so each run reads the last three complete days: a number that
 * arrives late replaces the empty one.
 */
const DIAS_DE_CUENTA = 3

async function leerReels(deps: DepsMetricas, token: string, dia: string) {
  const reels = await leerReelsPublicados(deps.db)
  const pasajeras: Error[] = []
  let leidos = 0
  let sinLectura = 0
  for (const reel of reels) {
    try {
      const metricas = await leerMetricasDeReel({ token, mediaId: reel.mediaId })
      await guardarLecturaDeReel(deps.db, { piezaId: reel.piezaId, dia, ...metricas })
      leidos += 1
    } catch (error) {
      // A dead token fails every reel the same way: stop, the message is the same for all of them.
      if (error instanceof TokenVencido) throw error
      if (!(error instanceof Error)) throw error
      if (error instanceof FallaDeConfiguracion) {
        // Instagram refuses this reel for good (deleted, no insights): asking again every day will not change it, and
        // failing the run would alert WAV daily about one reel. It is reported and shows as "sin números".
        console.error(`Instagram no da métricas del reel ${reel.mediaId}`, error)
        sinLectura += 1
        continue
      }
      pasajeras.push(new Error(`Reel ${reel.mediaId}: ${error.message}`, { cause: error }))
    }
  }
  if (pasajeras.length > 0) {
    throw new AggregateError(
      pasajeras,
      `No pude leer ${pasajeras.length} reels: ${pasajeras.map((e) => e.message).join(" | ")}`,
    )
  }
  return { leidos, sinLectura }
}

async function leerCuenta(deps: DepsMetricas, token: string, cuentaId: string, zona: string, hoy: string) {
  let guardados = 0
  for (let atras = 1; atras <= DIAS_DE_CUENTA; atras += 1) {
    const dia = sumarDias(hoy, -atras)
    const siguiente = sumarDias(dia, 1)
    const limite = (texto: string) => {
      const [anio, mes, diaDelMes] = texto.split("-").map(Number)
      return instanteLocal({ anio: anio ?? 0, mes: mes ?? 0, dia: diaDelMes ?? 0, hora: 0, minuto: 0 }, zona)
    }
    const toques = await leerToquesDePerfil({ token, cuentaId, desde: limite(dia), hasta: limite(siguiente) })
    if (toques === null) continue
    await guardarLecturaDeCuenta(deps.db, dia, toques)
    guardados += 1
  }
  return guardados
}

/**
 * The daily reading (design T15): the insights of every published reel and the account's profile taps, saved as one
 * snapshot per day in the app's zone. Jobs run independently, so a reel that fails does not cost the account figure.
 */
export async function registrarMetricasDiarias(deps: DepsMetricas): Promise<ResultadoMetricas> {
  const [token, cuentaId] = await Promise.all([leerSecreto(deps.db, "meta"), leerCuentaMeta(deps.db)])
  if (!token || !cuentaId) return { estado: "sin_cuenta" }

  const zona = await leerZona(deps.db)
  const hoy = diaLocal(Date.parse(deps.ahora()), zona)
  let tokenMuerto = false
  const hecho = await enSerie({
    reels: async () => {
      try {
        return await leerReels(deps, token, hoy)
      } catch (error) {
        tokenMuerto = error instanceof TokenVencido
        throw error
      }
    },
    // The account call would fail the same way with a dead token.
    cuenta: async () => (tokenMuerto ? 0 : leerCuenta(deps, token, cuentaId, zona, hoy)),
    // The click counter keeps a visitor's hash for the day only; this makes sure it goes even on a quiet page.
    visitas: () => olvidarVisitasDeClics(deps.db, sumarDias(hoy, -1)),
  })
  return { estado: "leidas", reels: hecho.reels.leidos, sinLectura: hecho.reels.sinLectura, dias: hecho.cuenta }
}
