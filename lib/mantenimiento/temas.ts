import { leerCalibracion } from "@/lib/datos/huellas"
import type { ModeloDeHuellas } from "@/lib/dominio/parecido"
import { mensajeTecnico, PausaDeProveedor } from "@/lib/dominio/pausas"
import { estimarEmbebido, TEXTOS_POR_EMBEBIDO } from "@/lib/ingesta/afirmar"
import { textoDeVector } from "@/lib/ingesta/agrupar"
import { falloDeBase, pagarPaso } from "@/lib/ingesta/gasto-material"
import {
  asignarATemas,
  type DepsTemas,
  formarTemas,
  MAXIMO_PENDIENTES_POR_CORRIDA,
  type ResultadoFormacion,
} from "@/lib/ingesta/temas"
import { costoVoyage, embeber } from "@/lib/proveedores/voyage"

/** Claims embedded on each frequent run: a backlog drains over several runs instead of one long one. */
export const AFIRMACIONES_POR_CORRIDA = 200
const IDS_POR_CONSULTA = 100

/** What the topic jobs need: the database, Claude, the store and, when there is a key, Voyage. No ffmpeg. */
export interface DepsMantenimientoTemas extends DepsTemas {
  llaveVoyage: () => string | undefined
}

export interface ResultadoMantenerTemas {
  tope: boolean
  embebidas: number
  asignadas: number
  formacion: ResultadoFormacion | null
  /** A provider pause the embeddings met; the caller opens it (it holds the notifier). */
  pausa: PausaDeProveedor | null
}

/** The claims that still have no vector (a run whose Voyage call failed, or had no key), oldest first. */
async function afirmacionesSinVector(deps: DepsMantenimientoTemas): Promise<{ id: string; texto: string }[]> {
  const { data, error } = await deps.db
    .from("afirmaciones")
    .select("id, texto")
    .is("vector", null)
    .eq("excluida", false)
    .order("creada_en")
    .order("id")
    .limit(AFIRMACIONES_POR_CORRIDA)
  if (error) throw falloDeBase("No pude leer las afirmaciones sin vector", error)
  return data
}

/** Pending claims that already have a vector (a topic may have formed since), newest first. */
async function pendientesConVector(deps: DepsMantenimientoTemas): Promise<string[]> {
  const { data, error } = await deps.db
    .from("afirmaciones")
    .select("id")
    .is("tema_id", null)
    .eq("excluida", false)
    .not("vector", "is", null)
    .order("creada_en", { ascending: false })
    .order("id")
    .limit(MAXIMO_PENDIENTES_POR_CORRIDA)
  if (error) throw falloDeBase("No pude leer las afirmaciones pendientes con vector", error)
  return data.map((a) => a.id)
}

/** Embeds claims in requests of 128, paying each one. Stops at the cap and says how many it reached. */
async function embeberPendientes(
  deps: DepsMantenimientoTemas,
  llave: string,
  pendientes: readonly { id: string; texto: string }[],
  ids: string[],
  modelo: ModeloDeHuellas,
): Promise<{ tope: boolean }> {
  for (let desde = 0; desde < pendientes.length; desde += TEXTOS_POR_EMBEBIDO) {
    const lote = pendientes.slice(desde, desde + TEXTOS_POR_EMBEBIDO)
    const textos = lote.map((a) => a.texto)
    const pagado = await pagarPaso(
      {
        db: deps.db,
        almacen: deps.almacen,
        ahora: deps.ahora,
        clave: () => `temas:embeber:${crypto.randomUUID()}`,
        verificar: () => Promise.resolve(),
      },
      {
        proveedor: "voyage",
        paso: "embedding",
        estimadoUsd: estimarEmbebido(textos),
        llamar: async () => {
          const r = await embeber({ clave: llave, textos, tipo: "document", modelo })
          if (r.vectores.length !== lote.length) throw new Error("Voyage no devolvió un vector por afirmación.")
          return { datos: r.vectores, realUsd: costoVoyage(r.tokens, modelo) }
        },
      },
    )
    if (pagado.limite) return { tope: true }
    for (const [i, a] of lote.entries()) {
      const vector = pagado.datos[i]
      if (!vector) continue
      const { error } = await deps.db
        .from("afirmaciones")
        .update({ vector: textoDeVector(vector), modelo_vector: modelo })
        .eq("id", a.id)
        .is("vector", null)
      if (error) throw falloDeBase("No pude guardar el vector de la afirmación", error)
      ids.push(a.id)
    }
  }
  return { tope: false }
}

/**
 * The frequent topics job: embeds up to 200 claims left without a vector (nothing to do without a Voyage key, which is
 * not a failure), assigns them, and the pending ones that already had a vector, to the nearest topic and forms new topics from what stays pending. Reaching the month's
 * limit returns `tope: true`; the maintenance run tells Coni (lib/mantenimiento/ejecutar.ts).
 */
export async function mantenerTemas(deps: DepsMantenimientoTemas): Promise<ResultadoMantenerTemas> {
  const calibracion = await leerCalibracion(deps.db)
  const llave = deps.llaveVoyage()
  const pendientes = llave ? await afirmacionesSinVector(deps) : []
  const embebidas: { tope: boolean; ids: string[] } = { tope: false, ids: [] }
  let pausa: PausaDeProveedor | null = null
  if (llave) {
    try {
      embebidas.tope = (await embeberPendientes(deps, llave, pendientes, embebidas.ids, calibracion.modelo)).tope
    } catch (error) {
      // A provider outage must not alert every ten minutes: the claims stay without a vector and the next run retries.
      // A pause is handed to the caller, which opens it. The key is already redacted by the Voyage client.
      if (error instanceof PausaDeProveedor) pausa = error
      console.warn(
        `Embeddings de afirmaciones pendientes (${pendientes.length - embebidas.ids.length} sin vector): ${mensajeTecnico(error)}`,
      )
    }
  }
  // The ones just embedded and the backlog that waited for a topic to form, each once.
  const porAsignar = [...new Set([...embebidas.ids, ...(await pendientesConVector(deps))])]
  let asignadas = 0
  for (let desde = 0; desde < porAsignar.length; desde += IDS_POR_CONSULTA) {
    const r = await asignarATemas(deps, porAsignar.slice(desde, desde + IDS_POR_CONSULTA), calibracion)
    asignadas += r.asignadas
  }
  if (embebidas.tope) return { tope: true, embebidas: embebidas.ids.length, asignadas, formacion: null, pausa }
  const formacion = await formarTemas(deps, calibracion)
  return { tope: formacion.tope, embebidas: embebidas.ids.length, asignadas, formacion, pausa }
}
