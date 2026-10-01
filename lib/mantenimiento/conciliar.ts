import type { SupabaseClient } from "@supabase/supabase-js"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, type FilaDePieza, leerPiezasAtascadas, leerSecreto } from "@/lib/datos/repositorio"
import { transicionar } from "@/lib/dominio/estados"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { Notificador } from "@/lib/proveedores/avisos"
import { leerVideo } from "@/lib/proveedores/heygen-api"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsConciliacion {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
  /**
   * Starts `grabar-pieza` for a piece. `clave` is the idempotency key of this reconciliation, so the same piece, step
   * and render are resumed once and not every ten minutes.
   */
  dispararGrabacion: (piezaId: string, clave: string) => Promise<void>
}

export type ResultadoConciliacion = {
  piezaId: string
  resultado: "reanudada" | "esperando" | "falla_produccion"
}

const MINUTO_MS = 60_000
/** Design A10: a render that has had no news for this long is asked about, because its callback may have been lost. */
const MINUTOS_SIN_NOVEDAD = 15
/** Design A10: a piece that has made no progress for this long is given up on and handed back to Coni. */
const MINUTOS_SIN_PROGRESO = 60

const EXPLICACION_RENDER_LENTO = "El video tardó demasiado en estar listo. Puedes volver a intentarlo."
const EXPLICACION_SIN_RENDER = "El video no alcanzó a empezar a grabarse. Puedes volver a intentarlo."
const EXPLICACION_SIN_SUBTITULOS = "El video no alcanzó a quedar listo con sus subtítulos. Puedes volver a intentarlo."

/**
 * Looks at every piece the render has left without news for 15 minutes. A render HeyGen already finished (or failed)
 * whose callback was lost is resumed by running `grabar-pieza` again, which always reads the status by id; one that is
 * still processing is left alone until it has had an hour, and then goes back to Coni as `error_produccion`.
 */
export async function conciliarRenders(deps: DepsConciliacion): Promise<ResultadoConciliacion[]> {
  const ahora = Date.parse(deps.ahora())
  const desde = new Date(ahora - MINUTOS_SIN_NOVEDAD * MINUTO_MS).toISOString()
  const filas = await leerPiezasAtascadas(deps.db, desde)

  let llave: Promise<string> | undefined
  const leerLlave = () => {
    llave ??= leerSecreto(deps.db, "heygen").then((valor) => {
      if (!valor) throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de HeyGen en Ajustes.")
      return valor
    })
    return llave
  }

  const resultados: ResultadoConciliacion[] = []
  const errores: Error[] = []
  for (const fila of filas) {
    const minutos = (ahora - Date.parse(fila.actualizada_en)) / MINUTO_MS
    try {
      const resultado = await conciliar(deps, fila, minutos, leerLlave)
      if (resultado) resultados.push(resultado)
    } catch (error) {
      if (!(error instanceof Error)) throw error
      errores.push(new Error(`pieza ${fila.id}: ${error.message}`, { cause: error }))
    }
  }
  if (errores.length > 0) {
    throw new AggregateError(errores, `La conciliación tuvo problemas: ${errores.map((e) => e.message).join(" | ")}`)
  }
  return resultados
}

async function conciliar(
  deps: DepsConciliacion,
  fila: FilaDePieza,
  minutos: number,
  leerLlave: () => Promise<string>,
): Promise<ResultadoConciliacion | null> {
  const sinProgreso = minutos >= MINUTOS_SIN_PROGRESO
  const subtitulando = fila.estado === "subtitulando"

  if (fila.render_id === null) {
    // Waiting for Coni to raise the spending cap leaves a reason on the piece, and nothing else to do.
    if (fila.explicacion !== null) return null
    if (!sinProgreso) return null
    return fallar(deps, fila, subtitulando ? EXPLICACION_SIN_SUBTITULOS : EXPLICACION_SIN_RENDER, "no tiene render_id")
  }

  if (subtitulando) {
    // The render is delivered and stored: what is missing is burning the subtitles, which only a new run can do.
    if (sinProgreso) return fallar(deps, fila, EXPLICACION_SIN_SUBTITULOS, "lleva una hora en subtitulando")
    await deps.dispararGrabacion(fila.id, claveDeConciliacion(fila))
    return { piezaId: fila.id, resultado: "reanudada" }
  }

  const video = await leerVideo({ clave: await leerLlave(), videoId: fila.render_id })
  if (video.estado === "listo" || video.estado === "fallido") {
    await deps.dispararGrabacion(fila.id, claveDeConciliacion(fila))
    return { piezaId: fila.id, resultado: "reanudada" }
  }
  if (sinProgreso) {
    return fallar(deps, fila, EXPLICACION_RENDER_LENTO, `HeyGen sigue en ${video.estado} tras una hora`)
  }
  return { piezaId: fila.id, resultado: "esperando" }
}

function claveDeConciliacion(fila: FilaDePieza): string {
  return `conciliar:${fila.id}:${fila.intento}:${fila.estado}:${fila.render_id ?? "sin-render"}`
}

async function fallar(
  deps: DepsConciliacion,
  fila: FilaDePieza,
  explicacion: string,
  motivo: string,
): Promise<ResultadoConciliacion | null> {
  const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "falla_produccion", explicacion })
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))
  // Null means the piece moved in the meantime (the run it was waiting for finished): nothing to give up on.
  if (!guardada) return null
  await deps.avisos.aConi(explicacion, true, {
    tipo: "error_definitivo",
    clave: `error_definitivo:${fila.id}:conciliar:${fila.intento}`,
    piezaId: fila.id,
  })
  await deps.avisos.aWav(
    "Un video se quedó sin terminar",
    `pieza ${fila.id} («${fila.titulo}»), estado ${fila.estado}, render ${fila.render_id ?? "ninguno"}: ${motivo}.`,
  )
  return { piezaId: fila.id, resultado: "falla_produccion" }
}
