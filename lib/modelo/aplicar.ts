import { z } from "zod"
import { leerCalibracion } from "@/lib/datos/huellas"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { MODELOS_DE_HUELLAS, type ModeloDeHuellas } from "@/lib/dominio/parecido"
import { textoDeVector } from "@/lib/ingesta/agrupar"
import { falloDeBase, redondear } from "@/lib/ingesta/gasto-material"
import {
  type DepsModelo,
  embeberPagando,
  exigirLlave,
  insertarCandidatas,
  OMITIDA_POR_PAUSA,
  voyageEnPausa,
} from "@/lib/modelo/probar"

/** A material processed between the top-up and the switch can leave one claim behind: top up and try again. */
const INTENTOS = 3
const FILAS_POR_INSERCION = 50

const Cambio = z.object({ asignaciones_antes: z.string(), asignaciones_despues: z.string(), version: z.number() })
const Prueba = z.object({
  modelo: z.enum(MODELOS_DE_HUELLAS),
  estado: z.string(),
  version_anterior: z.number().nullable(),
})

export type ResultadoDeCambio =
  | typeof OMITIDA_POR_PAUSA
  | {
      prueba: string
      modelo: ModeloDeHuellas
      version: number
      /** Claims embedded during this run (they arrived after the dry run, or after the switch for a revert). */
      embebidas: number
      costoUsd: number
      /** The fingerprint of every assignment, taken inside the transaction, did not change. */
      asignacionesIntactas: boolean
    }

type Destino = "candidata" | "anterior"

async function leerPrueba(deps: DepsModelo, prueba: string): Promise<z.infer<typeof Prueba>> {
  const { data, error } = await deps.db
    .from("pruebas_de_modelo")
    .select("modelo, estado, version_anterior")
    .eq("id", prueba)
    .single()
  if (error) throw falloDeBase(`No pude leer la prueba ${prueba}`, error)
  return Prueba.parse(data)
}

async function insertarAnteriores(
  deps: DepsModelo,
  prueba: string,
  modelo: ModeloDeHuellas,
  version: number,
  filas: readonly { id: string; vector: readonly number[] }[],
): Promise<void> {
  for (let desde = 0; desde < filas.length; desde += FILAS_POR_INSERCION) {
    const lote = filas.slice(desde, desde + FILAS_POR_INSERCION)
    const { error } = await deps.db.from("huellas_anteriores").upsert(
      lote.map((f) => ({
        prueba_id: prueba,
        afirmacion_id: f.id,
        modelo,
        vector: textoDeVector(f.vector),
        version_calibracion: version,
      })),
      { onConflict: "prueba_id,afirmacion_id", ignoreDuplicates: true },
    )
    if (error) throw falloDeBase("No pude guardar las huellas anteriores", error)
  }
}

/** Embeds the claims that still lack their row for `destino` and inserts them. */
async function completar(
  deps: DepsModelo,
  e: { prueba: string; destino: Destino; modelo: ModeloDeHuellas; version: number; llave: string },
): Promise<{ embebidas: number; costoUsd: number }> {
  const { data, error } = await deps.db.rpc("afirmaciones_sin_huella", { p_prueba: e.prueba, p_destino: e.destino })
  if (error) throw falloDeBase("No pude buscar las afirmaciones sin huella", error)
  if (data.length === 0) return { embebidas: 0, costoUsd: 0 }
  const { vectores, costoUsd } = await embeberPagando(deps, {
    llave: e.llave,
    modelo: e.modelo,
    textos: data.map((f) => f.texto),
    paso: e.destino === "candidata" ? "aplicar" : "revertir",
  })
  const filas = data.map((f, i) => {
    const vector = vectores[i]
    if (!vector) throw new Error("Voyage no devolvió un vector por afirmación.")
    return { id: f.id, vector }
  })
  if (e.destino === "candidata") await insertarCandidatas(deps.db, e.prueba, e.modelo, filas)
  else await insertarAnteriores(deps, e.prueba, e.modelo, e.version, filas)
  return { embebidas: filas.length, costoUsd }
}

async function cambiar(
  deps: DepsModelo,
  e: { prueba: string; destino: Destino; modelo: ModeloDeHuellas; version: number; llave: string },
): Promise<ResultadoDeCambio> {
  const falta = e.destino === "candidata" ? "faltan_candidatas" : "faltan_anteriores"
  let embebidas = 0
  let costoUsd = 0
  for (let intento = 1; ; intento++) {
    const hecho = await completar(deps, e)
    embebidas += hecho.embebidas
    costoUsd += hecho.costoUsd
    const { data, error } =
      e.destino === "candidata"
        ? await deps.db.rpc("aplicar_prueba_de_modelo", { p_prueba: e.prueba })
        : await deps.db.rpc("revertir_prueba_de_modelo", { p_prueba: e.prueba })
    if (!error) {
      const r = Cambio.parse(data)
      return {
        prueba: e.prueba,
        modelo: e.modelo,
        version: r.version,
        embebidas,
        costoUsd: redondear(costoUsd),
        asignacionesIntactas: r.asignaciones_antes === r.asignaciones_despues,
      }
    }
    if (!error.message.includes(falta) || intento >= INTENTOS) throw falloDeBase("No pude cambiar el modelo", error)
  }
}

/** `aplicar-modelo-de-huellas`: after Federico's OK, the dry run becomes the live model in one transaction. */
export async function aplicarModeloDeHuellas(
  deps: DepsModelo,
  entrada: { prueba: string },
): Promise<ResultadoDeCambio> {
  if (await voyageEnPausa(deps.db)) return OMITIDA_POR_PAUSA
  const llave = exigirLlave(deps)
  const prueba = await leerPrueba(deps, entrada.prueba)
  if (prueba.estado !== "lista") {
    throw new FallaDeConfiguracion(
      `La prueba ${entrada.prueba} está ${prueba.estado}: solo se aplica una prueba lista.`,
    )
  }
  return cambiar(deps, { prueba: entrada.prueba, destino: "candidata", modelo: prueba.modelo, version: 0, llave })
}

/** `revertir-modelo-de-huellas`: within 30 days of the switch, everything goes back to the model of before. */
export async function revertirModeloDeHuellas(
  deps: DepsModelo,
  entrada: { prueba: string },
): Promise<ResultadoDeCambio> {
  if (await voyageEnPausa(deps.db)) return OMITIDA_POR_PAUSA
  const llave = exigirLlave(deps)
  const prueba = await leerPrueba(deps, entrada.prueba)
  if (prueba.estado !== "aplicada" || prueba.version_anterior === null) {
    throw new FallaDeConfiguracion(
      `La prueba ${entrada.prueba} está ${prueba.estado}: solo se revierte una prueba aplicada.`,
    )
  }
  const anterior = await leerCalibracion(deps.db, prueba.version_anterior)
  return cambiar(deps, {
    prueba: entrada.prueba,
    destino: "anterior",
    modelo: anterior.modelo,
    version: anterior.version,
    llave,
  })
}
