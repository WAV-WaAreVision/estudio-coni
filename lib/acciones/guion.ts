import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  confirmarGasto,
  leerGuiaVigente,
  leerIdea,
  leerPieza,
  leerSecreto,
  liberarGasto,
  reservarGasto,
  revisionAJson,
} from "@/lib/datos/repositorio"
import { esJuicioDeClaude, leerRevision } from "@/lib/datos/revision"
import { Falla } from "@/lib/dominio/falla"
import { claveIdempotencia, hashTexto } from "@/lib/dominio/puertas"
import { bloquea, type Hallazgo, MAXIMO_DEL_GUION, pideLineasDeAyuda, revisarGuion } from "@/lib/dominio/revision"
import { dolares } from "@/lib/formato"
import { costoClaude, MODELO_POR_TAREA, revisarConClaude } from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"
import { MAXIMO_DEL_TEXTO, normalizarTexto } from "./piezas"
import { aResultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsGuion {
  /** Coni's session: the database function that writes the edit is hers alone. */
  db: Db
  /** A `service_role` client, for what only the server may read (her keys, the guide) and the spend of the month. */
  servicio: () => Db
  crearClaude: (llave: string) => Anthropic
  ahora: () => string
}

export type MotivoDeGuion = "revision_bloquea" | "tope" | "sin_version_de_claude"

export type ResultadoDeGuion =
  | { ok: true; version: number; revision: Hallazgo[] }
  | { ok: false; error: string; motivo?: MotivoDeGuion; hallazgos?: Hallazgo[] }

// The review is one short call with the guide cached; the real cost is confirmed afterwards.
const ESTIMADO_REVISION_USD = 0.1

const ERROR_NO_ES_CONI = "Esta app es solo para Coni."
const ERROR_BLOQUEA = "Todavía no se puede guardar así: la revisión tiene algo que corregir."
const ERROR_SIN_VERSION = "No encuentro la versión que escribió Claude para esta pieza."
const ERROR_REVISION = "No pude revisar el guion ahora. Inténtalo de nuevo en unos minutos."

interface Edicion {
  piezaId: string
  version: number
  guion: string
  texto: string
}

function traducir(error: Error): unknown {
  // The database repeats the rules of the screen; these are the ones a race can reach.
  if (error.message.includes("version_desfasada")) {
    return new Falla("Alguien cambió este guion mientras lo editabas. Recarga para ver la última versión.")
  }
  if (error.message.includes("guion_fuera_de_revision")) return new Falla("Este guion ya no se puede editar.")
  if (error.message.includes("guion_vacio")) return new Falla("El guion no puede quedar vacío.")
  if (error.message.includes("texto_vacio")) return new Falla("El texto de la publicación no puede quedar vacío.")
  return error
}

async function exigirConi(db: Db): Promise<void> {
  const { data, error } = await db.rpc("es_coni")
  if (error) throw new Error(`No pude comprobar quién es: ${error.message}`, { cause: error })
  if (!data) throw new Falla(ERROR_NO_ES_CONI)
}

function limpiar(edicion: Edicion): { guion: string; texto: string } {
  const guion = normalizarTexto(edicion.guion)
  const texto = normalizarTexto(edicion.texto)
  if (guion === "") throw new Falla("El guion no puede quedar vacío.")
  if (guion.length > MAXIMO_DEL_GUION) throw new Falla("El guion es demasiado largo para un reel.")
  if (texto === "") throw new Falla("El texto de la publicación no puede quedar vacío.")
  if ([...texto].length > MAXIMO_DEL_TEXTO) throw new Falla("Instagram acepta hasta 2.200 caracteres en el texto.")
  return { guion, texto }
}

/** Saves her version of the script and the caption after the full review (design: she edits before gate 1). */
export function editarGuion(deps: DepsGuion, edicion: Edicion): Promise<ResultadoDeGuion> {
  return aResultado("editarGuion", () => trabajoDeEditar(deps, edicion)).then(aResultadoDeGuion)
}

type Cuerpo =
  | { version: number; revision: Hallazgo[] }
  | { motivo: MotivoDeGuion; error: string; hallazgos?: Hallazgo[] }

function aResultadoDeGuion(resultado: Awaited<ReturnType<typeof aResultado<Cuerpo>>>): ResultadoDeGuion {
  if (!resultado.ok) return resultado
  if ("motivo" in resultado)
    return { ok: false, motivo: resultado.motivo, error: resultado.error, hallazgos: resultado.hallazgos }
  return { ok: true, version: resultado.version, revision: resultado.revision }
}

async function trabajoDeEditar(deps: DepsGuion, edicion: Edicion): Promise<Cuerpo> {
  const { db } = deps
  await exigirConi(db)
  const { guion, texto } = limpiar(edicion)

  const fila = await leerPieza(db, edicion.piezaId)
  if (!fila) throw new Falla("No encuentro esa pieza.")
  if (fila.estado !== "guion_por_aprobar") throw new Falla("Este guion ya no se puede editar.")
  if (fila.version !== edicion.version) throw traducir(new Error("version_desfasada"))

  const idea = fila.idea_id ? await leerIdea(db, fila.idea_id) : null
  const alertas = idea?.alertas ?? []
  const previos = leerRevision(fila.revision).filter(esJuicioDeClaude)
  const revisar = (requiereLineasAyuda: boolean) => revisarGuion({ guion, texto, esAvatar: true, requiereLineasAyuda })

  const deterministas = revisar(pideLineasDeAyuda(alertas) || previos.some((h) => h.regla === "tema_de_riesgo"))
  if (bloquea(deterministas)) return { motivo: "revision_bloquea", error: ERROR_BLOQUEA, hallazgos: deterministas }

  const juicio = await juzgarConClaude(deps, { piezaId: fila.id, guion, texto, alertas })
  if (juicio === "tope") return { motivo: "tope", error: await textoDelTope(db) }

  const reglas = juicio.hallazgos.some((h) => h.regla === "tema_de_riesgo") ? revisar(true) : deterministas
  const revision: Hallazgo[] = [...reglas, ...juicio.hallazgos]

  const { data, error } = await db.rpc("editar_guion_como_coni", {
    p_pieza: fila.id,
    p_version: fila.version,
    p_guion: guion,
    p_texto: texto,
    p_revision: revisionAJson(revision),
  })
  if (error) throw traducir(new Error(error.message, { cause: error }))
  return { version: data.version, revision }
}

async function textoDelTope(db: Db): Promise<string> {
  const { data } = await db.from("ajustes").select("tope_mensual_usd").maybeSingle()
  const tope = data ? ` de ${dolares(data.tope_mensual_usd)}` : ""
  return `Llegaste al tope${tope} de este mes. Súbelo en Ajustes para seguir.`
}

async function juzgarConClaude(
  deps: DepsGuion,
  entrada: {
    piezaId: string
    guion: string
    texto: string
    alertas: Parameters<typeof revisarConClaude>[0]["alertas"]
  },
): Promise<{ hallazgos: Hallazgo[] } | "tope"> {
  const servicio = deps.servicio()
  const llave = await leerSecreto(servicio, "anthropic")
  if (!llave) throw new Falla("Para revisar el guion necesito tu llave de Anthropic. Agrégala en Ajustes.")
  const guia = await leerGuiaVigente(servicio)
  if (!guia) throw new Error("No hay una guía editorial vigente para revisar el guion.")

  // Every attempt is its own spend: a repeated edit is a new call to the model.
  const clave = claveIdempotencia({
    piezaId: entrada.piezaId,
    paso: "producir",
    hash: hashTexto(`revision:${crypto.randomUUID()}`),
    intento: 0,
  })
  const reserva = await reservarGasto(servicio, {
    piezaId: entrada.piezaId,
    proveedor: "anthropic",
    paso: "revision",
    estimadoUsd: ESTIMADO_REVISION_USD,
    clave,
    ahora: deps.ahora(),
  })
  if (reserva.tope) return "tope"

  let juicio: Awaited<ReturnType<typeof revisarConClaude>>
  try {
    juicio = await revisarConClaude({
      cliente: deps.crearClaude(llave),
      guia: guia.texto,
      guion: entrada.guion,
      texto: entrada.texto,
      alertas: entrada.alertas,
    })
  } catch (error) {
    // Nothing was judged, so nothing was spent that she should pay against the cap.
    await liberarGasto(servicio, clave)
    console.error("No pude revisar el guion con Claude", error)
    throw new Falla(ERROR_REVISION)
  }
  // Claude already answered and was paid: a failure here must not release the reservation, so it propagates.
  await confirmarGasto(
    servicio,
    clave,
    Number(costoClaude(juicio.uso, MODELO_POR_TAREA.revisarConClaude.modelo).toFixed(4)),
  )
  return { hallazgos: juicio.hallazgos }
}

async function ultimaVersionDeClaude(db: Db, piezaId: string): Promise<{ guion: string; texto: string | null } | null> {
  const { data, error } = await db
    .from("guion_versiones")
    .select("guion, texto")
    .eq("pieza_id", piezaId)
    .eq("autor", "claude")
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No pude leer las versiones del guion: ${error.message}`, { cause: error })
  return data
}

/** Pieces created before versions existed have none, so the screen hides "volver a la de Claude" for them. */
export async function tieneVersionDeClaude(deps: Pick<DepsGuion, "db">, piezaId: string): Promise<boolean> {
  return (await ultimaVersionDeClaude(deps.db, piezaId)) !== null
}

/** Puts Claude's last draft back, through the same review as any edit. */
export async function volverAVersionDeClaude(
  deps: DepsGuion,
  entrada: { piezaId: string; version: number },
): Promise<ResultadoDeGuion> {
  const resultado = await aResultado("volverAVersionDeClaude", async (): Promise<Cuerpo | { borrador: Edicion }> => {
    await exigirConi(deps.db)
    const version = await ultimaVersionDeClaude(deps.db, entrada.piezaId)
    if (!version) return { motivo: "sin_version_de_claude", error: ERROR_SIN_VERSION }
    const fila = await leerPieza(deps.db, entrada.piezaId)
    if (!fila) throw new Falla("No encuentro esa pieza.")
    return {
      borrador: {
        piezaId: fila.id,
        version: entrada.version,
        guion: version.guion,
        texto: version.texto ?? fila.texto ?? "",
      },
    }
  })
  if (!resultado.ok) return resultado
  if ("borrador" in resultado) return editarGuion(deps, resultado.borrador)
  return aResultadoDeGuion(resultado)
}
