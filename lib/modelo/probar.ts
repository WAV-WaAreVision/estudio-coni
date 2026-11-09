import type { SupabaseClient } from "@supabase/supabase-js"
import { leerCalibracion } from "@/lib/datos/huellas"
import { leerPausasAbiertas } from "@/lib/datos/pausas"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { armarInforme, type InformeDePrueba, textoDelInforme } from "@/lib/dominio/informe-de-modelo"
import {
  type AfirmacionParaPrueba,
  calcularUmbrales,
  centroidesNuevos,
  type ModeloDeHuellas,
  muestrasDeParecido,
  type TemaParaPrueba,
  umbralesDe,
} from "@/lib/dominio/parecido"
import { PausaDeProveedor } from "@/lib/dominio/pausas"
import { estimarEmbebido, TEXTOS_POR_EMBEBIDO } from "@/lib/ingesta/afirmar"
import { parsearVector, textoDeVector } from "@/lib/ingesta/agrupar"
import { falloDeBase, pagarPaso, redondear } from "@/lib/ingesta/gasto-material"
import { abrirPausa } from "@/lib/pausas/abrir"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Notificador } from "@/lib/proveedores/avisos"
import { costoVoyage, embeber } from "@/lib/proveedores/voyage"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/** What the three model tasks need: a `service_role` client, the store, the notices (pauses), the clock and Voyage's key. */
export interface DepsModelo {
  db: Db
  almacen: Almacen
  avisos: Notificador
  ahora: () => string
  llaveVoyage: () => string | undefined
}

export const OMITIDA_POR_PAUSA = { omitida: "voyage_en_pausa" } as const

// Rows of 1024 floats: a page of 200 is a few MB of JSON, an insert of 50 well under any request limit.
const PAGINA = 200
const FILAS_POR_INSERCION = 50

export async function voyageEnPausa(db: Db): Promise<boolean> {
  return (await leerPausasAbiertas(db)).includes("voyage")
}

export function exigirLlave(deps: Pick<DepsModelo, "llaveVoyage">): string {
  const llave = deps.llaveVoyage()
  if (!llave) throw new FallaDeConfiguracion("Falta VOYAGE_API_KEY en este ambiente de Trigger.dev.")
  return llave
}

/**
 * Embeds `textos` with `modelo` in requests of 128, each one reserved and confirmed in `gastos`. The month's limit
 * fails the run: half a set of vectors is worth nothing. A provider pause is opened (WAV is emailed once) and rethrown.
 */
export async function embeberPagando(
  deps: DepsModelo,
  entrada: {
    llave: string
    modelo: ModeloDeHuellas
    textos: readonly string[]
    paso: "probar" | "aplicar" | "revertir"
  },
): Promise<{ vectores: number[][]; costoUsd: number }> {
  const vectores: number[][] = []
  let costoUsd = 0
  try {
    for (let desde = 0; desde < entrada.textos.length; desde += TEXTOS_POR_EMBEBIDO) {
      const lote = entrada.textos.slice(desde, desde + TEXTOS_POR_EMBEBIDO)
      const pagado = await pagarPaso(
        {
          db: deps.db,
          almacen: deps.almacen,
          ahora: deps.ahora,
          clave: () => `modelo:${entrada.paso}:${crypto.randomUUID()}`,
          verificar: () => Promise.resolve(),
        },
        {
          proveedor: "voyage",
          paso: "embedding",
          estimadoUsd: estimarEmbebido(lote),
          llamar: async () => {
            const r = await embeber({ clave: entrada.llave, textos: lote, tipo: "document", modelo: entrada.modelo })
            const usd = costoVoyage(r.tokens, entrada.modelo)
            return { datos: { vectores: r.vectores, usd }, realUsd: usd }
          },
        },
      )
      if (pagado.limite) {
        throw new FallaDeConfiguracion(
          "El límite de gasto del mes no deja embeber: súbelo en Ajustes › Presupuesto o espera al mes que viene.",
        )
      }
      vectores.push(...pagado.datos.vectores)
      costoUsd += pagado.datos.usd
    }
  } catch (error) {
    if (error instanceof PausaDeProveedor) await abrirPausa(deps, error)
    throw error
  }
  return { vectores, costoUsd }
}

type FilaConVector = { id: string; texto: string; tema_id: string | null; excluida: boolean; vector: string }

async function leerAfirmacionesConVector(db: Db): Promise<FilaConVector[]> {
  const filas: FilaConVector[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db
      .from("afirmaciones")
      .select("id, texto, tema_id, excluida, vector")
      .not("vector", "is", null)
      .order("id")
      .range(desde, desde + PAGINA - 1)
    if (error) throw falloDeBase("No pude leer las afirmaciones con vector", error)
    for (const f of data) if (f.vector) filas.push({ ...f, vector: f.vector })
    if (data.length < PAGINA) return filas
  }
}

async function leerTemas(db: Db): Promise<TemaParaPrueba[]> {
  const temas: TemaParaPrueba[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db
      .from("temas")
      .select("id, nombre, fusionado_en, centroide")
      .order("id")
      .range(desde, desde + PAGINA - 1)
    if (error) throw falloDeBase("No pude leer los temas", error)
    for (const t of data) {
      temas.push({ id: t.id, nombre: t.nombre, fusionadoEn: t.fusionado_en, viejo: parsearVector(t.centroide) })
    }
    if (data.length < PAGINA) return temas
  }
}

async function leerRechazadas(db: Db): Promise<{ a: string; b: string }[]> {
  const { data, error } = await db.from("temas_fusion_rechazada").select("tema_a, tema_b")
  if (error) throw falloDeBase("No pude leer las fusiones rechazadas", error)
  return data.map((r) => ({ a: r.tema_a, b: r.tema_b }))
}

/** Inserts candidates in small requests; a claim that already has one for this dry run is left as it is. */
export async function insertarCandidatas(
  db: Db,
  prueba: string,
  modelo: ModeloDeHuellas,
  filas: readonly { id: string; vector: readonly number[] }[],
): Promise<void> {
  for (let desde = 0; desde < filas.length; desde += FILAS_POR_INSERCION) {
    const lote = filas.slice(desde, desde + FILAS_POR_INSERCION)
    const { error } = await db.from("huellas_candidatas").upsert(
      lote.map((f) => ({ prueba_id: prueba, afirmacion_id: f.id, modelo, vector: textoDeVector(f.vector) })),
      { onConflict: "prueba_id,afirmacion_id", ignoreDuplicates: true },
    )
    if (error) throw falloDeBase("No pude guardar las huellas candidatas", error)
  }
}

async function guardarPrueba(
  db: Db,
  entrada: { modelo: ModeloDeHuellas; informe: InformeDePrueba; afirmaciones: readonly AfirmacionParaPrueba[] },
): Promise<string> {
  const u = umbralesDe(entrada.informe.umbrales)
  const { data, error } = await db
    .from("pruebas_de_modelo")
    .insert({
      modelo: entrada.modelo,
      umbrales: { tema: u.tema, grupo: u.grupo, fusion: u.fusion, puente_min: u.puenteMin, puente_max: u.puenteMax },
      informe: entrada.informe,
    })
    .select("id")
    .single()
  if (error) throw falloDeBase("No pude guardar la prueba", error)
  try {
    await insertarCandidatas(
      db,
      data.id,
      entrada.modelo,
      entrada.afirmaciones.map((a) => ({ id: a.id, vector: a.nuevo })),
    )
  } catch (falla) {
    // Half a dry run must never look ready to apply: it goes, and the run fails with the original error.
    const borrada = await db.from("pruebas_de_modelo").delete().eq("id", data.id)
    if (borrada.error) console.error(`No pude borrar la prueba a medias ${data.id}: ${borrada.error.message}`)
    throw falla
  }
  return data.id
}

export type ResultadoDePrueba = typeof OMITIDA_POR_PAUSA | { prueba: string; informe: InformeDePrueba; texto: string }

/**
 * The dry run of `probar-modelo-de-huellas`: every claim with a vector embedded with `modelo` into `huellas_candidatas`,
 * the thresholds moved by percentile and the report. Nothing Coni uses changes. Voyage failing writes nothing.
 */
export async function probarModeloDeHuellas(
  deps: DepsModelo,
  entrada: { modelo: ModeloDeHuellas },
): Promise<ResultadoDePrueba> {
  if (await voyageEnPausa(deps.db)) return OMITIDA_POR_PAUSA
  const llave = exigirLlave(deps)
  const vigente = await leerCalibracion(deps.db)
  if (vigente.modelo === entrada.modelo) {
    throw new FallaDeConfiguracion(`${entrada.modelo} ya es el modelo vigente: no hay nada que probar.`)
  }
  const filas = await leerAfirmacionesConVector(deps.db)
  const { vectores, costoUsd } = await embeberPagando(deps, {
    llave,
    modelo: entrada.modelo,
    textos: filas.map((f) => f.texto),
    paso: "probar",
  })
  const afirmaciones: AfirmacionParaPrueba[] = filas.map((f, i) => {
    const nuevo = vectores[i]
    if (!nuevo) throw new Error("Voyage no devolvió un vector por afirmación.")
    return { id: f.id, texto: f.texto, temaId: f.tema_id, excluida: f.excluida, viejo: parsearVector(f.vector), nuevo }
  })
  const temas = await leerTemas(deps.db)
  const nuevos = centroidesNuevos(temas, afirmaciones)
  const traslado = calcularUmbrales(muestrasDeParecido(afirmaciones, temas, nuevos), vigente)
  const informe = armarInforme({
    vigente,
    modelo: entrada.modelo,
    traslado,
    afirmaciones,
    temas,
    nuevos,
    rechazadas: await leerRechazadas(deps.db),
    costoUsd: redondear(costoUsd),
  })
  const prueba = await guardarPrueba(deps.db, { modelo: entrada.modelo, informe, afirmaciones })
  return { prueba, informe, texto: textoDelInforme(informe) }
}
