import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, type FilaDePieza, leerPieza } from "@/lib/datos/repositorio"
import { type Evento, transicionar } from "@/lib/dominio/estados"
import { Falla } from "@/lib/dominio/falla"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsFalla {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
}

export interface EntradaDeFalla {
  /** Task id, as the Trigger.dev dashboard shows it. */
  tarea: string
  /** Run id, so WAV can open the run. */
  corrida: string
  /** The piece the run was working on; the publish cron works on many and has none. */
  piezaId?: string
  error: unknown
}

const GENERICO_GUION = "Algo falló al preparar tu guion. WAV ya está revisando."
const GENERICO_VIDEO = "Algo falló al preparar tu video. WAV ya está revisando."
const GENERICO_VOZ = "Algo falló al grabar la voz. WAV ya está revisando. Puedes volver a intentarlo."
const LARGO_MAXIMO = 1000
const CAUSAS_MAXIMAS = 3

function mensajeDe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, LARGO_MAXIMO)
  return `Error sin forma de Error: ${String(error)}`.slice(0, LARGO_MAXIMO)
}

/** The error and the chain of causes behind it, which is where a network error says what actually happened. */
export function detalleTecnico(error: unknown): string {
  const lineas = [mensajeDe(error)]
  let causa = error instanceof Error ? error.cause : undefined
  for (let nivel = 0; nivel < CAUSAS_MAXIMAS && causa !== undefined; nivel += 1) {
    lineas.push(`Causa: ${mensajeDe(causa)}`)
    causa = causa instanceof Error ? causa.cause : undefined
  }
  return lineas.join("\n")
}

/** What Coni reads: her own message when the error was written for her, a generic notice when it was written for WAV. */
function paraConi(error: unknown, generico: string): string {
  return error instanceof Falla ? error.message : generico
}

/**
 * Writes what Coni will read on the piece a failed run left behind and reports whether it did. The script step has no
 * error state in the design (the piece stays in `guion_en_proceso` with a reason), the render steps go to
 * `error_produccion` so Coni can retry them, and the voice step goes back to gate 1 (`guion_por_aprobar`). A piece that
 * already moved on is not touched.
 */
async function dejarConstancia(deps: DepsFalla, fila: FilaDePieza, entrada: EntradaDeFalla): Promise<string | null> {
  const guion = entrada.tarea === "producir-pieza" && fila.estado === "guion_en_proceso"
  const video = entrada.tarea === "grabar-pieza" && (fila.estado === "en_render" || fila.estado === "subtitulando")
  const voz = entrada.tarea === "grabar-voz" && fila.estado === "grabando_voz"
  if (!guion && !video && !voz) return null
  const explicacion = paraConi(entrada.error, guion ? GENERICO_GUION : voz ? GENERICO_VOZ : GENERICO_VIDEO)
  const evento: Evento = voz ? { tipo: "falla_voz", explicacion } : { tipo: "falla_produccion", explicacion }
  const cambios = guion
    ? { version: fila.version + 1, explicacion }
    : cambiosDesdePieza(transicionar(piezaDesdeFila(fila), evento).pieza)
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, cambios)
  // Null means the piece changed in the meantime: there is nothing left to explain.
  return guardada ? explicacion : null
}

/**
 * The `onFailure` of a task: the run threw and Trigger.dev will not retry it (design A9). The piece is left readable
 * for Coni, Coni gets a plain notice and WAV gets the technical detail. If an alert cannot be sent the other one still
 * goes out, and the failure is raised at the end so it is not lost.
 */
export async function avisarFalla(deps: DepsFalla, entrada: EntradaDeFalla): Promise<void> {
  const fila = entrada.piezaId ? await leerPieza(deps.db, entrada.piezaId) : null
  const explicacion = fila ? await dejarConstancia(deps, fila, entrada) : null

  const lineas = [`Tarea: ${entrada.tarea}`, `Corrida: ${entrada.corrida}`]
  if (entrada.piezaId) {
    lineas.push(
      fila ? `Pieza: ${fila.id} («${fila.titulo}»), estado ${fila.estado}` : `Pieza: ${entrada.piezaId} (no existe)`,
    )
  }
  lineas.push(detalleTecnico(entrada.error))

  const fallos: Error[] = []
  const enviar = async (envio: () => Promise<unknown>) => {
    try {
      await envio()
    } catch (error) {
      if (!(error instanceof Error)) throw error
      fallos.push(error)
    }
  }
  if (explicacion) {
    const aviso = {
      tipo: "error_definitivo",
      clave: `error_definitivo:${entrada.corrida}`,
      ...(entrada.piezaId ? { piezaId: entrada.piezaId } : {}),
    } as const
    await enviar(() => deps.avisos.aConi(explicacion, true, aviso))
  }
  await enviar(() => deps.avisos.aWav(`Falló ${entrada.tarea}`, lineas.join("\n")))
  if (fallos.length > 0) {
    throw new AggregateError(fallos, `No pude enviar un aviso de falla: ${fallos.map((f) => f.message).join(" | ")}`)
  }
}

const PayloadConPieza = z.object({ piezaId: z.string().uuid() })

/**
 * The `onFailure` hook of a task. The piece comes from the payload when it has one (`producir-pieza` and
 * `grabar-pieza`), and the run from the context. `deps` is a function so a missing setting fails inside the hook,
 * where Trigger.dev reports it, and not when the task file is loaded.
 */
export function alFallarDeTarea(tarea: string, deps: () => DepsFalla) {
  return async (parametros: { payload: unknown; error: unknown; ctx: { run: { id: string } } }): Promise<void> => {
    const payload = PayloadConPieza.safeParse(parametros.payload)
    await avisarFalla(deps(), {
      tarea,
      corrida: parametros.ctx.run.id,
      ...(payload.success ? { piezaId: payload.data.piezaId } : {}),
      error: parametros.error,
    })
  }
}
