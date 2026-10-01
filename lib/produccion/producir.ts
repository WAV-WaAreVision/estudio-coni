import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  confirmarGasto,
  type FilaDePieza,
  guardarBorrador,
  type IdeaLeida,
  leerGuiaVigente,
  leerIdea,
  leerPieza,
  leerProduccion,
  leerSecreto,
  liberarGasto,
  reservarGasto,
  revisionAJson,
} from "@/lib/datos/repositorio"
import { transicionar } from "@/lib/dominio/estados"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveIdempotencia, hashTexto } from "@/lib/dominio/puertas"
import { bloquea, type Hallazgo, pideLineasDeAyuda, revisarGuion } from "@/lib/dominio/revision"
import { type Almacen, claveAudio } from "@/lib/proveedores/almacen"
import { costoClaude, escribirGuion, RechazoDeClaude, revisarConClaude } from "@/lib/proveedores/anthropic"
import { type ConfigCompleta, leerConfigProduccion } from "@/lib/proveedores/config"
import { generarVoz } from "@/lib/proveedores/elevenlabs"
import type { Database, Json } from "@/lib/supabase/database.types"

export interface DepsProduccion {
  /** A `service_role` client: the database triggers keep enforcing the gates on everything it writes. */
  db: SupabaseClient<Database>
  claude: Anthropic
  almacen: Almacen
  ahora: () => string
  base?: { elevenlabs?: string }
}

export type ResultadoProduccion =
  | { resultado: "producida"; audioId: string }
  | { resultado: "nada_que_hacer" }
  | { resultado: "tope" }
  | { resultado: "rechazado" }

const TEXTO_TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."
// A script and its review fit well under this; the real cost is confirmed afterwards.
const ESTIMADO_CLAUDE_USD = 0.5
/**
 * ASSUMPTION, to be replaced with the rate of Coni's plan: US$ 0.30 per 1,000 characters, the overage price of
 * ElevenLabs' Creator plan for Multilingual v2 at the time of writing. The API does not return a cost; the
 * confirmed amount is this same estimate until the plan reads the `character-cost` header.
 */
const USD_POR_CARACTER_ELEVENLABS = 0.0003
const MINIMO_USD = 0.0001

function aCuatroDecimales(usd: number): number {
  return Math.round(usd * 10_000) / 10_000
}

/** `gastos.estimado_usd` must be positive, so a (hypothetical) empty text still reserves the minimum. */
export function estimarCostoVoz(texto: string): number {
  return Math.max(MINIMO_USD, aCuatroDecimales(texto.length * USD_POR_CARACTER_ELEVENLABS))
}

/**
 * One key per piece, step and script round (`intento` goes up when Coni asks for changes), so a Trigger.dev retry
 * of the same round finds its own reservation and a new round gets a new one.
 */
function claveDeGasto(fila: FilaDePieza, que: string): string {
  return claveIdempotencia({
    piezaId: fila.id,
    paso: "producir",
    hash: hashTexto(que),
    intento: fila.intento,
  })
}

interface Contexto {
  idea: IdeaLeida
  guia: string
  config: ConfigCompleta
  llaveElevenlabs: string
}

// Everything that can be wrong with the setup is checked before any money is reserved.
async function cargarContexto(deps: DepsProduccion, fila: FilaDePieza): Promise<Contexto> {
  const { db } = deps
  if (!fila.idea_id) {
    throw new FallaDeConfiguracion(`La pieza ${fila.id} no tiene idea: no hay de qué escribir el guion.`)
  }
  const idea = await leerIdea(db, fila.idea_id)
  if (!idea) {
    throw new FallaDeConfiguracion(`No existe la idea ${fila.idea_id} de la pieza ${fila.id}.`)
  }
  const guia = await leerGuiaVigente(db)
  if (!guia) {
    throw new FallaDeConfiguracion("No hay una guía editorial vigente.")
  }
  const config = leerConfigProduccion(await leerProduccion(db))
  if (!config.elevenlabs.voice_id) {
    throw new FallaDeConfiguracion("Falta elevenlabs.voice_id en la configuración de producción.")
  }
  const llaveElevenlabs = await leerSecreto(db, "elevenlabs")
  if (!llaveElevenlabs) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de ElevenLabs en Ajustes.")
  }
  return { idea, guia: guia.texto, config, llaveElevenlabs }
}

interface Borrador {
  guion: string
  texto: string
  revision: Json
}

// Every video this pipeline makes is an avatar, so every caption must say so.
const ES_AVATAR = true

async function redactarBorrador(
  deps: DepsProduccion,
  contexto: Contexto,
): Promise<{ borrador: Borrador; costoUsd: number }> {
  const { claude: cliente } = deps
  const { idea, guia } = contexto
  const requiereLineasAyuda = pideLineasDeAyuda(idea.alertas)
  let costoUsd = 0

  const revisar = (entrada: { guion: string; texto: string }, lineasAyuda: boolean) =>
    revisarGuion({ ...entrada, esAvatar: ES_AVATAR, requiereLineasAyuda: lineasAyuda })

  let escrito = await escribirGuion({ cliente, guia, idea, requiereLineasAyuda })
  costoUsd += costoClaude(escrito.uso)
  let hallazgos = revisar(escrito, requiereLineasAyuda)
  if (bloquea(hallazgos)) {
    // One correction round only: whatever still blocks after it is left for Coni to see.
    escrito = await escribirGuion({ cliente, guia, idea, requiereLineasAyuda, correcciones: hallazgos })
    costoUsd += costoClaude(escrito.uso)
    hallazgos = revisar(escrito, requiereLineasAyuda)
  }

  const juicio = await revisarConClaude({
    cliente,
    guia,
    guion: escrito.guion,
    texto: escrito.texto,
    alertas: idea.alertas,
  })
  costoUsd += costoClaude(juicio.uso)
  if (juicio.hallazgos.some((h) => h.regla === "tema_de_riesgo")) {
    hallazgos = revisar(escrito, true)
  }

  const revision: Hallazgo[] = [...hallazgos, ...juicio.hallazgos]
  return { borrador: { guion: escrito.guion, texto: escrito.texto, revision: revisionAJson(revision) }, costoUsd }
}

function borradorGuardado(fila: FilaDePieza): Borrador {
  if (!fila.guion || !fila.texto) {
    throw new FallaDeConfiguracion(
      `La reserva de Claude de la pieza ${fila.id} ya estaba confirmada, pero la pieza no tiene guion ni texto guardados.`,
    )
  }
  return { guion: fila.guion, texto: fila.texto, revision: fila.revision }
}

function piezaCambio(): Error {
  return new Error("La pieza cambió mientras se producía.")
}

/** Writes only the explanation: the piece stays where it is and Coni reads why nothing happened. */
async function explicar(deps: DepsProduccion, fila: FilaDePieza, explicacion: string): Promise<void> {
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, { version: fila.version + 1, explicacion })
  if (!guardada) throw piezaCambio()
}

/**
 * Writes the script, the caption and the voice of a piece in `guion_en_proceso` and leaves it in
 * `guion_por_aprobar`. It never approves anything. It is safe to run again: a finished piece is left alone, and a
 * run that stopped half way resumes from what was saved instead of paying twice.
 */
export async function producirPieza(deps: DepsProduccion, piezaId: string): Promise<ResultadoProduccion> {
  const { db } = deps
  let fila = await leerPieza(db, piezaId)
  if (!fila) {
    throw new FallaDeConfiguracion(`No existe la pieza ${piezaId}.`)
  }
  if (fila.estado !== "guion_en_proceso") {
    return { resultado: "nada_que_hacer" }
  }
  const contexto = await cargarContexto(deps, fila)

  const claveClaude = claveDeGasto(fila, `claude:${fila.id}:${contexto.idea.id}`)
  const reservaClaude = await reservarGasto(db, {
    piezaId: fila.id,
    proveedor: "anthropic",
    paso: "guion",
    estimadoUsd: ESTIMADO_CLAUDE_USD,
    clave: claveClaude,
    ahora: deps.ahora(),
  })
  if (reservaClaude.tope) {
    await explicar(deps, fila, TEXTO_TOPE)
    return { resultado: "tope" }
  }

  let borrador: Borrador
  switch (reservaClaude.gasto.estado) {
    case "liberado":
      // A refusal released it earlier: asking again would only be refused again, and cost money.
      await explicar(deps, fila, new RechazoDeClaude().message)
      return { resultado: "rechazado" }
    case "confirmado":
      // The script is saved in the same transaction that confirms the spend, so it is on the piece.
      borrador = borradorGuardado(fila)
      break
    default: {
      let redactado: Awaited<ReturnType<typeof redactarBorrador>>
      try {
        redactado = await redactarBorrador(deps, contexto)
      } catch (error) {
        if (!(error instanceof RechazoDeClaude)) throw error
        await liberarGasto(db, claveClaude)
        await explicar(deps, fila, error.message)
        return { resultado: "rechazado" }
      }
      borrador = redactado.borrador
      // The draft and the confirmation of its spend are one transaction: a retry that finds the spend confirmed
      // always finds the draft, and one that finds it reserved never has a draft to resume from.
      const guardada = await guardarBorrador(db, {
        piezaId: fila.id,
        versionLeida: fila.version,
        guion: borrador.guion,
        texto: borrador.texto,
        revision: borrador.revision,
        clave: claveClaude,
        realUsd: aCuatroDecimales(redactado.costoUsd),
      })
      if (!guardada) throw piezaCambio()
      fila = guardada
    }
  }

  const claveVoz = claveDeGasto(fila, `elevenlabs:${fila.id}`)
  const estimadoVoz = estimarCostoVoz(borrador.guion)
  const reservaVoz = await reservarGasto(db, {
    piezaId: fila.id,
    proveedor: "elevenlabs",
    paso: "voz",
    estimadoUsd: estimadoVoz,
    clave: claveVoz,
    ahora: deps.ahora(),
  })
  if (reservaVoz.tope) {
    await explicar(deps, fila, TEXTO_TOPE)
    return { resultado: "tope" }
  }
  if (reservaVoz.gasto.estado !== "reservado") {
    // Confirmed only after the piece is saved, and nothing else releases a voice reservation.
    throw new FallaDeConfiguracion(
      `La reserva de la voz de la pieza ${fila.id} está ${reservaVoz.gasto.estado}, pero la pieza sigue sin voz.`,
    )
  }

  const audio = await generarVoz({
    clave: contexto.llaveElevenlabs,
    config: contexto.config.elevenlabs,
    texto: borrador.guion,
    base: deps.base?.elevenlabs,
  })
  const audioId = claveAudio(fila.id, audio)
  await deps.almacen.subir(audioId, audio, "audio/mpeg")

  const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "guion_listo", audioId })
  const lista = await actualizarPieza(db, fila.id, fila.version, {
    ...cambiosDesdePieza(pieza),
    guion: borrador.guion,
    texto: borrador.texto,
    revision: borrador.revision,
  })
  if (!lista) throw piezaCambio()
  await confirmarGasto(db, claveVoz, estimadoVoz)
  return { resultado: "producida", audioId }
}
