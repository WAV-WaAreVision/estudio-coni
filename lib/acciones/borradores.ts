import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { LARGOS } from "@/lib/dominio/biblioteca/borradores"
import { Falla } from "@/lib/dominio/falla"
import { REDES } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { exigirConi } from "./biblioteca"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

/** Coni's client: row level security applies, and `es_coni` is checked again here (spec A6). */
export interface DepsBorradores {
  db: Db
}

const texto = (largo: number) => z.string().trim().min(1).max(largo)
const nota = z.string().trim().max(LARGOS.notaDeRed)
const peso = z.number().gt(0).lte(100)

const CamposDePilar = z.object({
  nombre: texto(LARGOS.nombre),
  nombreCorto: texto(LARGOS.nombreCorto),
  descripcion: texto(LARGOS.descripcion),
  peso,
})
export const BorradorDePilarNuevo = CamposDePilar.extend({ red: z.enum(REDES) })
export const EdicionDeBorradorDePilar = CamposDePilar.extend({ id: z.uuid() })
export const BorradorDeRedNuevo = z.object({
  nombre: texto(LARGOS.nombreDeRed),
  manual: nota,
  receta: nota,
  conexion: nota,
})
export const EdicionDeBorradorDeRed = BorradorDeRedNuevo.extend({ id: z.uuid() })
export const SobreBorrador = z.object({ tipo: z.enum(["pilar", "red"]), id: z.uuid() })

export const BORRADOR_YA_DECIDIDO = "Ese borrador ya no se puede cambiar: se aprobó o se descartó. Vuelve a Borradores."

/** Spec 15c: a draft waits until Coni approves it; nothing here touches the pillars. */
export function guardarBorradorDePilar(
  deps: DepsBorradores,
  nuevo: z.output<typeof BorradorDePilarNuevo>,
): Promise<Resultado<{ id: string }>> {
  return aResultado("guardarBorradorDePilar", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("borradores_de_pilar")
      .insert({
        red: nuevo.red,
        nombre: nuevo.nombre,
        nombre_corto: nuevo.nombreCorto,
        descripcion: nuevo.descripcion,
        peso: nuevo.peso,
      })
      .select("id")
      .single()
    if (error) throw new Error(`No pude guardar el borrador de pilar: ${error.message}`, { cause: error })
    return { id: data.id }
  })
}

/** Row level security only lets a draft still in `borrador` change: a decided or missing one answers no row. */
export function editarBorradorDePilar(
  deps: DepsBorradores,
  edicion: z.output<typeof EdicionDeBorradorDePilar>,
): Promise<Resultado> {
  return aResultado("editarBorradorDePilar", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("borradores_de_pilar")
      .update({
        nombre: edicion.nombre,
        nombre_corto: edicion.nombreCorto,
        descripcion: edicion.descripcion,
        peso: edicion.peso,
      })
      .eq("id", edicion.id)
      .eq("estado", "borrador")
      .select("id")
      .maybeSingle()
    if (error) throw new Error(`No pude editar el borrador ${edicion.id}: ${error.message}`, { cause: error })
    if (!data) throw new Falla(BORRADOR_YA_DECIDIDO)
    return {}
  })
}

export function guardarBorradorDeRed(
  deps: DepsBorradores,
  nuevo: z.output<typeof BorradorDeRedNuevo>,
): Promise<Resultado<{ id: string }>> {
  return aResultado("guardarBorradorDeRed", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db.from("borradores_de_red").insert(nuevo).select("id").single()
    if (error) throw new Error(`No pude guardar el borrador de red: ${error.message}`, { cause: error })
    return { id: data.id }
  })
}

export function editarBorradorDeRed(
  deps: DepsBorradores,
  edicion: z.output<typeof EdicionDeBorradorDeRed>,
): Promise<Resultado> {
  return aResultado("editarBorradorDeRed", async () => {
    await exigirConi(deps.db)
    const { id, ...campos } = edicion
    const { data, error } = await deps.db
      .from("borradores_de_red")
      .update(campos)
      .eq("id", id)
      .eq("estado", "borrador")
      .select("id")
      .maybeSingle()
    if (error) throw new Error(`No pude editar el borrador ${id}: ${error.message}`, { cause: error })
    if (!data) throw new Falla(BORRADOR_YA_DECIDIDO)
    return {}
  })
}

/** Discarding is a state, so the history stays (no one deletes a draft). */
export function descartarBorrador(deps: DepsBorradores, sobre: z.output<typeof SobreBorrador>): Promise<Resultado> {
  return aResultado("descartarBorrador", async () => {
    await exigirConi(deps.db)
    const { data, error } =
      sobre.tipo === "pilar"
        ? await deps.db
            .from("borradores_de_pilar")
            .update({ estado: "descartado" })
            .eq("id", sobre.id)
            .eq("estado", "borrador")
            .select("id")
            .maybeSingle()
        : await deps.db
            .from("borradores_de_red")
            .update({ estado: "descartado" })
            .eq("id", sobre.id)
            .eq("estado", "borrador")
            .select("id")
            .maybeSingle()
    if (error) throw new Error(`No pude descartar el borrador ${sobre.id}: ${error.message}`, { cause: error })
    if (!data) throw new Falla(BORRADOR_YA_DECIDIDO)
    return {}
  })
}
