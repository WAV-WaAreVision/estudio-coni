import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { Database } from "@/lib/supabase/database.types"

export interface Enlace {
  /** What `/l/ir/<id>` looks up; letters, digits and dashes. */
  id: string
  titulo: string
  detalle: string
  /** A web address; a link without one is not shown. */
  url: string
}

const Entrada = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  titulo: z.string().trim().min(1).max(80),
  detalle: z.string().trim().max(120).default(""),
  url: z.url({ protocol: /^https?$/ }).max(2000),
})

/**
 * The links of the page, from `ajustes.enlaces`. Entries are read one by one: one without an address, with an
 * address that is not http(s), or with a broken shape is left out and the others stay, so the public page never
 * turns into an error page because of a single bad entry (design, Pass 2).
 */
export function enlacesVisibles(configuracion: unknown): Enlace[] {
  if (!Array.isArray(configuracion)) return []
  const vistos = new Set<string>()
  const visibles: Enlace[] = []
  for (const entrada of configuracion) {
    const leida = Entrada.safeParse(entrada)
    if (!leida.success || vistos.has(leida.data.id)) continue
    vistos.add(leida.data.id)
    visibles.push(leida.data)
  }
  return visibles
}

/** Reads the links with a `service_role` client: the page is public and the table is not. */
export async function leerEnlaces(db: SupabaseClient<Database>): Promise<Enlace[]> {
  const { data, error } = await db.from("ajustes").select("enlaces").maybeSingle()
  if (error) throw new Error(`No pude leer los enlaces: ${error.message}`, { cause: error })
  return enlacesVisibles(data?.enlaces ?? [])
}
