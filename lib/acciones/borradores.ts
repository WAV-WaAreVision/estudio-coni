import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { LARGOS } from "@/lib/dominio/biblioteca/borradores"
import { Falla } from "@/lib/dominio/falla"
import { esRed, REDES, type Red } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { exigirConi } from "./biblioteca"
import { aResultado, ERROR_SOLO_CONI, type Resultado } from "./resultado"

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

const PesosDeUnaEtapa = z
  .record(z.string().max(40), peso)
  // A network's pillars and the new one: a handful; 20 is far above any real network.
  .refine((pesos) => Object.keys(pesos).length <= 20)
export const AprobacionDePilar = z.object({
  id: z.uuid(),
  // `{desde: {pilar_id | "nuevo": peso}}` (decision 6); a network has today and a few planned stages.
  pesos: z
    .record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), PesosDeUnaEtapa)
    .refine((etapas) => Object.keys(etapas).length <= 12),
})

export const BORRADOR_YA_DECIDIDO = "Ese borrador ya no se puede cambiar: se aprobó o se descartó. Vuelve a Borradores."

export const NOMBRE_EN_USO =
  "Ese nombre o nombre corto ya lo tiene otro pilar o categoría, aunque esté retirado. Edita el borrador y elige otro."
export const PILAR_DE_OTRA_RED = "Uno de esos pesos es de un pilar que ya no está en esa red. Recarga la página."
export const PESO_INVALIDO = "Uno de los pesos no es un número mayor que 0 y hasta 100."
export const BORRADOR_INEXISTENTE = "Ese borrador ya no existe. Vuelve a Borradores."
export const ETAPA_INVALIDA =
  "Las etapas de pesos de esa red cambiaron desde que abriste esta pantalla. Recarga la página."

/** `aprobar_borrador_de_pilar`'s refusals, in her words. */
const RECHAZOS_DE_APROBACION: Record<string, string> = {
  borrador_ya_decidido: BORRADOR_YA_DECIDIDO,
  nombre_en_uso: NOMBRE_EN_USO,
  pilar_de_otra_red: PILAR_DE_OTRA_RED,
  peso_invalido: PESO_INVALIDO,
  borrador_inexistente: BORRADOR_INEXISTENTE,
  etapa_invalida: ETAPA_INVALIDA,
  sin_permiso: ERROR_SOLO_CONI,
}

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

/**
 * Spec 15c section 1: the database checks and writes everything in one transaction. The new pillar's network comes
 * back so Temas opens on it with the pillar chosen.
 */
export function aprobarBorradorDePilar(
  deps: DepsBorradores,
  aprobacion: z.output<typeof AprobacionDePilar>,
): Promise<Resultado<{ pilarId: string; red: Red }>> {
  return aResultado("aprobarBorradorDePilar", async () => {
    await exigirConi(deps.db)
    const { data: pilarId, error } = await deps.db.rpc("aprobar_borrador_de_pilar", {
      p_borrador: aprobacion.id,
      p_pesos: aprobacion.pesos,
    })
    if (error) {
      const rechazo = RECHAZOS_DE_APROBACION[error.message]
      if (rechazo) throw new Falla(rechazo)
      throw new Error(`No pude aprobar el borrador ${aprobacion.id}: ${error.message}`, { cause: error })
    }
    const { data: pilar, error: errorAlLeer } = await deps.db
      .from("categorias")
      .select("red")
      .eq("id", pilarId)
      .single()
    if (errorAlLeer) {
      throw new Error(`No pude leer el pilar aprobado ${pilarId}: ${errorAlLeer.message}`, { cause: errorAlLeer })
    }
    if (!esRed(pilar.red)) throw new Error(`El pilar aprobado ${pilarId} no tiene red.`)
    return { pilarId, red: pilar.red }
  })
}
