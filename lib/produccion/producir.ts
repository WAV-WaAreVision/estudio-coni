import type Anthropic from "@anthropic-ai/sdk"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  type FilaDePieza,
  guardarBorrador,
  type IdeaLeida,
  leerGuiaVigente,
  leerIdea,
  leerPieza,
  leerProduccion,
  liberarGasto,
  reservarGasto,
  revisionAJson,
} from "@/lib/datos/repositorio"
import { cargarRespaldoDeIdea, respaldoAJson } from "@/lib/datos/respaldo"
import { transicionar } from "@/lib/dominio/estados"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { claveIdempotencia, hashTexto } from "@/lib/dominio/puertas"
import { ajenoDelRespaldo, paraElGuion, type Respaldo } from "@/lib/dominio/respaldo"
import {
  bloquea,
  etiquetarJuiciosDeClaude,
  type Hallazgo,
  pideLineasDeAyuda,
  revisarGuion,
  revisarTextoLinkedin,
} from "@/lib/dominio/revision"
import { aCuatroDecimales, avisarTope, explicar, piezaCambio, TEXTO_TOPE } from "@/lib/produccion/comun"
import { asegurarVoz, type DepsVoz, leerLlaveDeVoz, TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import {
  costoClaude,
  escribirGuion,
  MODELO_POR_TAREA,
  RechazoDeClaude,
  revisarConClaude,
} from "@/lib/proveedores/anthropic"
import type { Notificador } from "@/lib/proveedores/avisos"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import type { Json } from "@/lib/supabase/database.types"

/**
 * `db` is a `service_role` client: the database triggers keep enforcing the gates on everything it writes. The store
 * and the ElevenLabs base come from `DepsVoz`, because the writer makes her voice of the draft.
 */
export interface DepsProduccion extends DepsVoz {
  avisos: Notificador
  claude: Anthropic
}

export type ResultadoProduccion =
  | { resultado: "producida" }
  | { resultado: "nada_que_hacer" }
  | { resultado: "tope" }
  | { resultado: "rechazado" }

// A script and its review fit well under this; the real cost is confirmed afterwards.
const ESTIMADO_CLAUDE_USD = 0.5
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
  respaldo: Respaldo | null
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
  const respaldo = await cargarRespaldoDeIdea(db, idea.id)
  const guia = await leerGuiaVigente(db)
  if (!guia) {
    throw new FallaDeConfiguracion("No hay una guía editorial vigente.")
  }
  return { idea, guia: guia.texto, respaldo }
}

interface Borrador {
  guion: string
  texto: string
  /** Null for a draft an older worker saved, before there was a LinkedIn text. */
  textoLinkedin: string | null
  revision: Json
  respaldo: Json | null
}

// Every video this pipeline makes is an avatar, so every caption must say so.
const ES_AVATAR = true

async function redactarBorrador(
  deps: DepsProduccion,
  contexto: Contexto,
): Promise<{ borrador: Borrador; costoUsd: number }> {
  const { claude: cliente } = deps
  const { idea, guia, respaldo } = contexto
  const ajeno = ajenoDelRespaldo(respaldo)
  const paraEscribir = respaldo === null ? null : paraElGuion(respaldo)
  const requiereLineasAyuda = pideLineasDeAyuda(idea.alertas)
  let costoUsd = 0

  // The LinkedIn text is reviewed with the script and the caption: a blocking finding of any of them earns the one
  // correction round, and what is left is stored with its field for the screen that shows it.
  const revisar = (entrada: { guion: string; texto: string; textoLinkedin: string }, lineasAyuda: boolean) => {
    const comun = { esAvatar: ES_AVATAR, requiereLineasAyuda: lineasAyuda, ajeno }
    return [
      ...revisarGuion({ guion: entrada.guion, texto: entrada.texto, ...comun }),
      ...revisarTextoLinkedin({ texto: entrada.textoLinkedin, ...comun }),
    ]
  }

  let escrito = await escribirGuion({ cliente, guia, idea, respaldo: paraEscribir, requiereLineasAyuda })
  costoUsd += costoClaude(escrito.uso, MODELO_POR_TAREA.escribirGuion.modelo)
  let hallazgos = revisar(escrito, requiereLineasAyuda)
  if (bloquea(hallazgos)) {
    // One correction round only: whatever still blocks after it is left for Coni to see.
    escrito = await escribirGuion({
      cliente,
      guia,
      idea,
      respaldo: paraEscribir,
      requiereLineasAyuda,
      correcciones: hallazgos,
    })
    costoUsd += costoClaude(escrito.uso, MODELO_POR_TAREA.escribirGuion.modelo)
    hallazgos = revisar(escrito, requiereLineasAyuda)
  }

  const juicio = await revisarConClaude({
    cliente,
    guia,
    guion: escrito.guion,
    texto: escrito.texto,
    textoLinkedin: escrito.textoLinkedin,
    alertas: idea.alertas,
  })
  costoUsd += costoClaude(juicio.uso, MODELO_POR_TAREA.revisarConClaude.modelo)
  if (juicio.hallazgos.some((h) => h.regla === "tema_de_riesgo")) {
    hallazgos = revisar(escrito, true)
  }

  const revision: Hallazgo[] = [...hallazgos, ...etiquetarJuiciosDeClaude(juicio.hallazgos, escrito)]
  return {
    borrador: {
      guion: escrito.guion,
      texto: escrito.texto,
      textoLinkedin: escrito.textoLinkedin,
      revision: revisionAJson(revision),
      respaldo: respaldoAJson(respaldo),
    },
    costoUsd,
  }
}

function borradorGuardado(fila: FilaDePieza): Borrador {
  if (!fila.guion || !fila.texto) {
    throw new FallaDeConfiguracion(
      `La reserva de Claude de la pieza ${fila.id} ya estaba confirmada, pero la pieza no tiene guion ni texto guardados.`,
    )
  }
  // The frozen snapshot of that draft, never a fresh read of the knowledge base.
  return {
    guion: fila.guion,
    texto: fila.texto,
    textoLinkedin: fila.texto_linkedin,
    revision: fila.revision,
    respaldo: fila.respaldo,
  }
}

/**
 * Her voice of the draft, so gate 1 signs the script and the voice together (design 2026-10-15, decision 2). The take
 * is keyed by the piece's attempt, so a retry of this round finds the one it already paid for. Whatever goes wrong,
 * the script is still delivered: without a voice and with `TEXTO_SIN_VOZ`, and Coni asks for it with "Preparar mi voz".
 */
async function vozDelBorrador(
  deps: DepsProduccion,
  fila: FilaDePieza,
  guion: string,
): Promise<{ audioId: string } | { audioId: null; explicacion: string }> {
  try {
    const config = leerConfigProduccion(await leerProduccion(deps.db))
    const voz = await asegurarVoz(deps, {
      fila,
      guion,
      config: config.elevenlabs,
      llave: () => leerLlaveDeVoz(deps.db, config),
      nueva: false,
    })
    if (voz.tipo === "lista") return { audioId: voz.audioId }
  } catch (error) {
    // A Falla is expected and needs no log: Coni reads TEXTO_SIN_VOZ, and the voice task gives its own text if it
    // happens again. Anything else is for WAV to look at.
    if (!(error instanceof Falla)) console.error(`No pude preparar la voz de la pieza ${fila.id}`, error)
  }
  return { audioId: null, explicacion: TEXTO_SIN_VOZ }
}

/**
 * Writes and reviews the script and the caption of a piece in `guion_en_proceso`, makes her voice of the draft and
 * leaves it in `guion_por_aprobar`. It never approves anything. It is safe to run again: a finished piece is left
 * alone, and a run that stopped half way resumes from what was saved (the draft, the take) instead of paying twice.
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
    await avisarTope(deps, fila)
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
        textoLinkedin: borrador.textoLinkedin,
        revision: borrador.revision,
        clave: claveClaude,
        realUsd: aCuatroDecimales(redactado.costoUsd),
        respaldo: borrador.respaldo,
      })
      if (!guardada) throw piezaCambio()
      fila = guardada
    }
  }

  const voz = await vozDelBorrador(deps, fila, borrador.guion)
  const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "guion_listo", ...voz })
  const lista = await actualizarPieza(db, fila.id, fila.version, {
    ...cambiosDesdePieza(pieza),
    guion: borrador.guion,
    texto: borrador.texto,
    revision: borrador.revision,
  })
  if (!lista) throw piezaCambio()
  return { resultado: "producida" }
}
