import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { marcaDelCarrusel } from "@/lib/carrusel/plantilla/plantilla"
import type { EntradaDeRender, Render } from "@/lib/carrusel/render"
import {
  empezarArmado,
  guardarAcortado,
  guardarArmado,
  laminasAJson,
  leerVersionVigente,
  marcarVersion,
  rechazarDisenoQueNoCabe,
  seAcortoEsteTexto,
  type VersionDeCarrusel,
} from "@/lib/datos/carrusel"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { leerPilares } from "@/lib/datos/pilares"
import {
  actualizarPieza,
  confirmarGasto,
  type FilaDePieza,
  leerGuiaVigente,
  leerIdea,
  leerPieza,
  liberarGasto,
  reservarGastoFirmado,
  revisionAJson,
} from "@/lib/datos/repositorio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { esJuicioDeClaude, leerRevision } from "@/lib/datos/revision"
import { type Lamina, MAXIMO_CAMBIOS_DE_TEXTO, palabrasDe } from "@/lib/dominio/carrusel"
import { transicionar } from "@/lib/dominio/estados"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { pilarVisible } from "@/lib/dominio/pilares"
import { claveIdempotencia, hashTexto, hashTextoDeCarrusel, puedeArmar } from "@/lib/dominio/puertas"
import { ajenoDelRespaldo } from "@/lib/dominio/respaldo"
import { pideLineasDeAyuda, revisarCarrusel } from "@/lib/dominio/revision"
import { type Almacen, claveLaminaDeCarrusel, clavePdfDeCarrusel } from "@/lib/proveedores/almacen"
import { acortarLaminas, costoClaude, MODELO_POR_TAREA, RechazoDeClaude } from "@/lib/proveedores/anthropic"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { aCuatroDecimales, ESTIMADO_ACORTAR_CLAUDE_USD, piezaCambio } from "./comun"

export interface DepsArmado {
  /** A `service_role` client: the database functions keep the gates on everything it writes. */
  db: SupabaseClient<Database>
  almacen: Almacen
  avisos: Notificador
  ahora: () => string
  /** `renderizarCarrusel` with Chromium in production; a fake at this boundary in tests. */
  renderizar: (entrada: EntradaDeRender) => Promise<Render>
  /** The committed serif as a data URL (`fuenteDelCarrusel`). */
  fuente: () => Promise<string>
  /** Claude only for a shortening: a render alone never needs her key. */
  claude: () => Promise<Anthropic>
}

export type ResultadoArmado = {
  resultado: "armado" | "acortado" | "muy_largo" | "diseno_no_cabe" | "nada_que_hacer"
}

export const TEXTO_DISENO_NO_CABE = "Ese cambio no cabe en la lámina. Prueba otro."

const NADA: ResultadoArmado = { resultado: "nada_que_hacer" }

/** "4", "4 y 5", "2, 4 y 5", 1-based. */
function numeros(indices: readonly number[]): string {
  const lista = indices.map((indice) => String(indice + 1))
  return lista.length <= 1 ? (lista[0] ?? "") : `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`
}

export function textoAcortada(indices: readonly number[]): string {
  return indices.length === 1
    ? `Acorté la lámina ${numeros(indices)} para que quepa. Léela y fírmala de nuevo.`
    : `Acorté las láminas ${numeros(indices)} para que quepan. Léelas y fírmalas de nuevo.`
}

export function textoMuyLarga(indices: readonly number[]): string {
  return indices.length === 1
    ? `La lámina ${numeros(indices)} quedó muy larga. Pide un cambio para acortarla.`
    : `Las láminas ${numeros(indices)} quedaron muy largas. Pide un cambio para acortarlas.`
}

async function pilarCortoDe(db: DepsArmado["db"], fila: FilaDePieza): Promise<string | null> {
  if (!fila.idea_id) return null
  const idea = await leerIdea(db, fila.idea_id)
  if (!idea) return null
  return pilarVisible(await leerPilares(db), idea.pilar)?.nombreCorto ?? null
}

/** Back to gate 1 with why (amendment 3); WAV hears about it when she has no text change left to fix it. */
async function devolver(deps: DepsArmado, fila: FilaDePieza, version: VersionDeCarrusel, explicacion: string) {
  await marcarVersion(deps.db, version.id, "fallo")
  const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "volver_a_firmar", explicacion })
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))
  if (!guardada) throw piezaCambio()
  if (fila.cambios_de_texto >= MAXIMO_CAMBIOS_DE_TEXTO) {
    await deps.avisos.aWav(
      "Un carrusel no cabe y no le quedan cambios",
      `pieza ${fila.id} («${fila.titulo}»): ${explicacion}`,
    )
  }
  return { resultado: "muy_largo" } as const
}

/** A design change never touches the words, so it is never shortened: it is dropped and gate 2 shows what she saw. */
async function rechazarDiseno(deps: DepsArmado, fila: FilaDePieza, version: VersionDeCarrusel) {
  // Validated here and applied by rechazar_diseno_que_no_cabe, which repeats it in SQL.
  transicionar(piezaDesdeFila(fila), { tipo: "diseno_no_cabe", explicacion: TEXTO_DISENO_NO_CABE })
  const guardada = await rechazarDisenoQueNoCabe(deps.db, {
    carruselId: version.id,
    versionLeida: fila.version,
    explicacion: TEXTO_DISENO_NO_CABE,
  })
  if (!guardada) throw piezaCambio()
  return { resultado: "diseno_no_cabe" } as const
}

/** The new slides with Claude's shorter texts; a highlight survives only if its word is still there. */
function conTextosNuevos(laminas: readonly Lamina[], textos: ReadonlyMap<number, string>): Lamina[] {
  return laminas.map((lamina, indice) => {
    const nuevo = textos.get(indice)
    if (nuevo === undefined) return lamina
    const texto = nuevo.replace(/\r\n?/g, "\n").normalize("NFC").trim()
    const destacado =
      lamina.destacado !== undefined && palabrasDe(texto).includes(lamina.destacado) ? lamina.destacado : undefined
    return {
      tipo: lamina.tipo,
      texto,
      ...(destacado === undefined ? {} : { destacado }),
      ...(lamina.fuente === undefined ? {} : { fuente: lamina.fuente }),
    }
  })
}

/** The one automatic shortening (amendment 3): reserve, ask Claude, review, save as a new text back at gate 1. */
async function acortar(deps: DepsArmado, fila: FilaDePieza, version: VersionDeCarrusel, largas: number[]) {
  const { db } = deps
  // One shortening per version, ever: the attempt stays out of the key, so after Reintentar the reservation finds the
  // spend Claude was already paid for (and the check below sends it back) instead of opening a new one.
  const clave = claveIdempotencia({
    piezaId: fila.id,
    paso: "armar",
    hash: hashTexto(`acortar:${version.id}`),
    intento: 0,
  })
  // The carousel is signed (it waits for its slides after gate 1): the month's limit never stops its one shortening.
  const gasto = await reservarGastoFirmado(db, {
    piezaId: fila.id,
    proveedor: "anthropic",
    paso: "carrusel",
    estimadoUsd: ESTIMADO_ACORTAR_CLAUDE_USD,
    clave,
    ahora: deps.ahora(),
  })
  // A refusal released it before: asking again would only be refused again, and cost money. A confirmed one means
  // Claude already answered and the save failed: asking again would pay twice for the one shortening.
  if (gasto.estado !== "reservado") {
    if (gasto.estado === "confirmado") {
      await deps.avisos.aWav(
        "Se perdió un acortado pagado de un carrusel",
        `pieza ${fila.id} («${fila.titulo}»): Claude ya cobró el acortado de las láminas ${numeros(largas)}, no se guardó y no se vuelve a pedir.`,
      )
    }
    return devolver(deps, fila, version, textoMuyLarga(largas))
  }

  const guia = await leerGuiaVigente(db)
  if (!guia) throw new FallaDeConfiguracion("No hay una guía editorial vigente.")
  let respuesta: Awaited<ReturnType<typeof acortarLaminas>>
  try {
    respuesta = await acortarLaminas({
      cliente: await deps.claude(),
      guia: guia.texto,
      laminas: version.laminas,
      largas,
    })
  } catch (error) {
    if (!(error instanceof RechazoDeClaude)) throw error
    await liberarGasto(db, clave)
    return devolver(deps, fila, version, textoMuyLarga(largas))
  }
  const realUsd = aCuatroDecimales(costoClaude(respuesta.uso, MODELO_POR_TAREA.acortarLaminas.modelo))
  // Paid now, whatever happens to the save below.
  await confirmarGasto(db, clave, realUsd)

  const laminas = conTextosNuevos(version.laminas, respuesta.textos)
  const actual = leerRevision(fila.revision)
  const juicios = actual.filter(esJuicioDeClaude)
  const idea = fila.idea_id ? await leerIdea(db, fila.idea_id) : null
  const requiereLineasAyuda =
    pideLineasDeAyuda(idea?.alertas ?? []) || juicios.some((hallazgo) => hallazgo.regla === "tema_de_riesgo")
  const revision = [
    ...revisarCarrusel({
      laminas,
      textoPost: version.textoPost,
      requiereLineasAyuda,
      ajeno: ajenoDelRespaldo(leerRespaldo(fila.respaldo)),
    }),
    ...juicios,
  ]
  const explicacion = textoAcortada(largas)
  // Validated here and applied by guardar_acortado, which repeats it in SQL.
  transicionar(piezaDesdeFila(fila), { tipo: "volver_a_firmar", explicacion })
  const guardada = await guardarAcortado(db, {
    carruselId: version.id,
    versionLeida: fila.version,
    laminas: laminasAJson(laminas),
    hashTexto: hashTextoDeCarrusel({ laminas, textoPost: version.textoPost }),
    revision: revisionAJson(revision),
    explicacion,
    clave,
    realUsd,
  })
  if (!guardada) throw piezaCambio()
  return { resultado: "acortado" } as const
}

/**
 * The `armar-carrusel` run (design 2026-10-26, D4): renders the latest version of a carousel in `armando_carrusel`,
 * uploads one PNG per slide and the PDF to R2 under the version's folder, and puts the piece at gate 2. A version that
 * does not fit is shortened once or sent back to gate 1 (amendment 3). Safe to run again: each run writes its own keys
 * and `guardar_armado` refuses a version that is no longer waiting.
 */
export async function armarCarrusel(deps: DepsArmado, piezaId: string): Promise<ResultadoArmado> {
  const { db } = deps
  const fila = await leerPieza(db, piezaId)
  if (!fila || fila.tipo !== "carrusel" || fila.estado !== "armando_carrusel" || fila.explicacion !== null) return NADA
  const version = await leerVersionVigente(db, fila.id)
  if (!version) throw new Error(`El carrusel ${fila.id} espera sus láminas sin versión.`)
  if (version.estado === "listo") return NADA
  const veredicto = puedeArmar(piezaDesdeFila(fila), hashTextoDeCarrusel(version))
  // The database makes this impossible (proteger_pieza): a mismatch is a bug, never rendered.
  if (!veredicto.ok) throw new Error(`No armo el carrusel ${fila.id}: ${veredicto.motivo}`)

  await empezarArmado(db, version.id, deps.ahora())
  const render = await deps.renderizar({
    laminas: version.laminas,
    variante: version.diseno.variante,
    marca: marcaDelCarrusel(await pilarCortoDe(db, fila)),
    fuente: await deps.fuente(),
  })
  if (render.tipo === "desborda") {
    if (version.origen === "cambio_diseno") return rechazarDiseno(deps, fila, version)
    return (await seAcortoEsteTexto(db, fila.id, version.hashTexto))
      ? devolver(deps, fila, version, textoMuyLarga(render.laminas))
      : acortar(deps, fila, version, render.laminas)
  }

  // Fresh per run: only the keys guardar_armado saves are ever referenced, whatever a concurrent run uploads.
  const corrida = crypto.randomUUID()
  const pngs = version.laminas.map((_, indice) => claveLaminaDeCarrusel(fila.id, version.id, corrida, indice))
  for (const [indice, clave] of pngs.entries()) {
    const bytes = render.pngs[indice]
    if (!bytes) throw new Error(`El render del carrusel ${fila.id} trajo menos láminas que la versión.`)
    await deps.almacen.subir(clave, bytes, "image/png")
  }
  const pdf = clavePdfDeCarrusel(fila.id, version.id, corrida)
  await deps.almacen.subir(pdf, render.pdf, "application/pdf")
  // Validated here and applied by guardar_armado, which repeats it in SQL.
  transicionar(piezaDesdeFila(fila), { tipo: "carrusel_armado" })
  const guardada = await guardarArmado(db, { carruselId: version.id, versionLeida: fila.version, pdf, pngs })
  if (!guardada) throw piezaCambio()
  return { resultado: "armado" }
}
