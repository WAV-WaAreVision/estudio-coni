import type { SupabaseClient } from "@supabase/supabase-js"
import { falloDeBase } from "@/lib/ingesta/gasto-material"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/** PostgREST returns at most 1000 rows per request. */
const PAGINA = 1000
const VENTANA_DIAS = 28
const AUTORES_MINIMOS_POR_DEFECTO = 2

export interface TemaDelMotor {
  tema_id: string
  nombre: string
  pilar: string | null
  afirmaciones: number
  autores: number
  evidencia_fuerte: number
  cubierto_por_coni: boolean
}

export interface ParDelMotor {
  a: string
  b: string
  puente: number
  autores_comunes: number
}

export interface DatosDelMotor {
  temas: TemaDelMotor[]
  pares: ParDelMotor[]
  recientes: {
    /** Topic ids used by engine theories inside the window. */
    temas: Set<string>
    /** Pairs used inside the window, as `${a}|${b}` with the ids in lexicographic order. */
    pares: Set<string>
  }
  /** Engine ideas discarded inside the window, per topic of the theory that produced them. */
  descartes: Map<string, number>
}

export const claveDePar = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`)

function haceDias(hoy: string, dias: number): string {
  const fecha = new Date(`${hoy}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() - dias)
  return fecha.toISOString().slice(0, 10)
}

/** Reads every page of a query ordered by a stable key; `pagina` builds the request for one range. */
async function leerTodo<T>(
  mensaje: string,
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const todas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1)
    if (error) throw falloDeBase(mensaje, error)
    const filas = data ?? []
    todas.push(...filas)
    if (filas.length < PAGINA) return todas
  }
}

export async function leerDatosDelMotor(
  db: Db,
  opciones: { hoy: string; minimoAutores?: number },
): Promise<DatosDelMotor> {
  const desde = haceDias(opciones.hoy, VENTANA_DIAS)

  const temas = await leerTodo("No pude leer los temas del motor", (a, b) =>
    db.rpc("motor_temas").order("tema_id").range(a, b),
  )
  const pares = await leerTodo("No pude leer los cruces del motor", (a, b) =>
    db
      .rpc("motor_pares", { p_minimo_autores: opciones.minimoAutores ?? AUTORES_MINIMOS_POR_DEFECTO })
      .order("a")
      .order("b")
      .range(a, b),
  )
  const teorias = await leerTodo("No pude leer las teorías recientes", (a, b) =>
    db.from("teorias").select("id, temas").eq("origen", "motor").gte("semana", desde).order("id").range(a, b),
  )
  const descartadas = await leerTodo("No pude leer los descartes recientes", (a, b) =>
    db
      .from("ideas")
      .select("id, teorias!inner(temas)")
      .eq("origen", "motor")
      .eq("estado", "descartada")
      // A retired pillar is not a verdict on its topics (amendment 4).
      .or("motivo_descarte.is.null,motivo_descarte.neq.pilar_retirado")
      .gte("semana", desde)
      .order("id")
      .range(a, b),
  )

  const temasRecientes = new Set<string>()
  const paresRecientes = new Set<string>()
  for (const teoria of teorias) {
    const ids = [...new Set(teoria.temas)]
    for (const id of ids) temasRecientes.add(id)
    for (const [i, x] of ids.entries()) for (const y of ids.slice(i + 1)) paresRecientes.add(claveDePar(x, y))
  }

  const descartes = new Map<string, number>()
  for (const idea of descartadas) {
    for (const id of new Set(idea.teorias.temas)) descartes.set(id, (descartes.get(id) ?? 0) + 1)
  }

  return {
    temas: temas.map((t) => ({ ...t, pilar: t.pilar ?? null })),
    pares,
    recientes: { temas: temasRecientes, pares: paresRecientes },
    descartes,
  }
}
