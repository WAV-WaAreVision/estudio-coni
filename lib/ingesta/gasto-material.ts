import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { confirmarGasto, liberarGasto, reservarGastoGeneral } from "@/lib/datos/repositorio"
import type { DepsProcesar } from "@/lib/ingesta/procesar"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>
type Material = Database["public"]["Tables"]["materiales"]["Row"]

export const redondear = (usd: number) => Number(usd.toFixed(4))

/** What a paid step leaves behind, so a run that crashed after paying does not pay again. */
function conGasto<T extends z.ZodType>(datos: T) {
  return z.object({ gasto: z.object({ clave: z.string(), realUsd: z.number() }), datos })
}

/** The material was deleted while the run was working: not an error, nothing to retry and nobody to alert. */
export class MaterialBorrado extends Error {
  constructor() {
    super("El material fue borrado mientras se procesaba.")
    this.name = "MaterialBorrado"
  }
}

export type Tope = { tope: true }
export const TOPE: Tope = { tope: true }

export interface Contexto {
  deps: DepsProcesar
  material: Material
}

export function falloDeBase(mensaje: string, error: { message: string }): Error {
  return new Error(`${mensaje}: ${error.message}`)
}

export async function existeMaterial(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.from("materiales").select("id").eq("id", id).maybeSingle()
  if (error) throw falloDeBase("No pude leer el material", error)
  return data !== null
}

/** Called before every paid step: a deleted material must not cost anything more. */
export async function exigirMaterial(db: Db, id: string): Promise<void> {
  if (!(await existeMaterial(db, id))) throw new MaterialBorrado()
}

export async function leerJson<T>(almacen: Almacen, clave: string, esquema: z.ZodType<T>): Promise<T | null> {
  if (!(await almacen.existe(clave))) return null
  const bytes = await almacen.bajar(clave)
  return esquema.parse(JSON.parse(new TextDecoder().decode(bytes)))
}

export async function guardarJson(almacen: Almacen, clave: string, valor: unknown): Promise<void> {
  await almacen.subir(clave, new TextEncoder().encode(JSON.stringify(valor)), "application/json")
}

/** What a paid step needs from whoever it works for: the stores, the clock and how its reservation keys are made. */
export interface ContextoDePago {
  db: Db
  almacen: Almacen
  ahora: () => string
  /** A new key on every attempt: see `pagarPaso`. */
  clave: (paso: string) => string
  /** Called before every paid step: it throws when what the step works for is gone. */
  verificar: () => Promise<void>
}

function contextoDePagoDeMaterial(ctx: Contexto): ContextoDePago {
  const { db, almacen, ahora } = ctx.deps
  return {
    db,
    almacen,
    ahora,
    clave: (paso) => `material:${ctx.material.id}:${paso}:${crypto.randomUUID()}`,
    verificar: () => exigirMaterial(db, ctx.material.id),
  }
}

/**
 * The stored result of a paid step, or null when there is none. The reservation of the run that paid is confirmed
 * here (a no-op when it already was), so a crash between paying and confirming leaves no reservation hanging.
 */
export async function pagadoAntesEn<T>(
  ctx: Pick<ContextoDePago, "db" | "almacen">,
  archivo: string,
  esquema: z.ZodType<T>,
): Promise<T | null> {
  const guardado = await leerJson(ctx.almacen, archivo, conGasto(esquema))
  if (!guardado) return null
  await confirmarGasto(ctx.db, guardado.gasto.clave, guardado.gasto.realUsd)
  return guardado.datos
}

export async function pagadoAntes<T>(ctx: Contexto, archivo: string, esquema: z.ZodType<T>): Promise<T | null> {
  return pagadoAntesEn({ db: ctx.deps.db, almacen: ctx.deps.almacen }, archivo, esquema)
}

interface PasoPagado<T> {
  /** Where the result is checkpointed so a retry pays only what is missing. Omit it for throwaway results (maintenance). */
  archivo?: string
  proveedor: "anthropic" | "elevenlabs" | "voyage"
  paso: string
  estimadoUsd: number
  llamar: () => Promise<{ datos: T; realUsd: number }>
}

/**
 * One paid provider call: reserve against the monthly cap, call, keep the result in the store (when the step names a
 * file) and only then confirm the real cost. The reservation key is new on every attempt: reserving an old key returns the old row, even a
 * released one, and the retry would run unmetered. A failed call releases its reservation; a call that was paid for
 * is confirmed even when keeping its result fails.
 */
export async function pagarPaso<T>(
  ctx: ContextoDePago,
  paso: PasoPagado<T>,
): Promise<Tope | { tope: false; datos: T }> {
  const { db, almacen, ahora } = ctx
  await ctx.verificar()
  const clave = ctx.clave(paso.paso)
  const reserva = await reservarGastoGeneral(db, {
    proveedor: paso.proveedor,
    paso: paso.paso,
    estimadoUsd: paso.estimadoUsd,
    clave,
    ahora: ahora(),
  })
  if (reserva.limite) return TOPE
  let resultado: { datos: T; realUsd: number }
  try {
    resultado = await paso.llamar()
  } catch (error) {
    await liberarGasto(db, clave)
    throw error
  }
  const realUsd = redondear(resultado.realUsd)
  try {
    if (paso.archivo) await guardarJson(almacen, paso.archivo, { gasto: { clave, realUsd }, datos: resultado.datos })
  } finally {
    await confirmarGasto(db, clave, realUsd)
  }
  return { tope: false, datos: resultado.datos }
}

export async function pagar<T>(ctx: Contexto, paso: PasoPagado<T>): Promise<Tope | { tope: false; datos: T }> {
  return pagarPaso(contextoDePagoDeMaterial(ctx), paso)
}
