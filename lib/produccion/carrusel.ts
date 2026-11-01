import { guardarCarrusel, laminasAJson, leerCarruselVigente } from "@/lib/datos/carrusel"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, type FilaDePieza, liberarGasto, reservarGasto, revisionAJson } from "@/lib/datos/repositorio"
import { respaldoAJson } from "@/lib/datos/respaldo"
import {
  type EscritoDeCarrusel,
  laminasDelEscrito,
  type TextoDeCarrusel,
  textoDeLaPublicacion,
} from "@/lib/dominio/carrusel"
import { transicionar } from "@/lib/dominio/estados"
import { fuentesCitadas, lineaDeFuente } from "@/lib/dominio/fuente"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { ajenoDelRespaldo, paraElGuion } from "@/lib/dominio/respaldo"
import { bloquea, pideLineasDeAyuda, revisarCarrusel } from "@/lib/dominio/revision"
import { avisarLimite, TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { aCuatroDecimales, ESTIMADO_CARRUSEL_CLAUDE_USD, explicar, piezaCambio } from "@/lib/produccion/comun"
import { type Contexto, cargarContexto, claveDeGasto } from "@/lib/produccion/contexto"
// Types only: producir.ts imports this module's function, so a value import back would close a cycle.
import type { DepsProduccion, ResultadoProduccion } from "@/lib/produccion/producir"
import {
  type CambioDeCarrusel,
  costoClaude,
  escribirCarrusel,
  MODELO_POR_TAREA,
  RechazoDeClaude,
  revisarCarruselConClaude,
} from "@/lib/proveedores/anthropic"
import type { Json } from "@/lib/supabase/database.types"

export const TEXTO_RECHAZO_CARRUSEL = "Claude no quiso escribir este carrusel. Prueba con otra idea."
export const TEXTO_CAMBIO_NO_HECHO = "No pude hacer ese cambio. Puedes pedir otro o firmarlo como está."

interface Redactado {
  texto: TextoDeCarrusel
  revision: Json
  respaldo: Json | null
  costoUsd: number
}

/** One structured call, the deterministic review, one correction round if it blocks, then Claude's review (D3). */
async function redactarCarrusel(
  deps: DepsProduccion,
  contexto: Contexto,
  cambio: CambioDeCarrusel | null,
): Promise<Redactado> {
  const { claude: cliente } = deps
  const { idea, pilar, guia, respaldo } = contexto
  const ajeno = ajenoDelRespaldo(respaldo)
  const requiereLineasAyuda = pideLineasDeAyuda(idea.alertas)
  const apoyos = respaldo?.afirmaciones ?? []
  const linea = lineaDeFuente(apoyos)
  const base = {
    cliente,
    guia,
    idea: { ...idea, pilar },
    respaldo: respaldo === null ? null : paraElGuion(respaldo),
    fuentes: fuentesCitadas(apoyos),
    requiereLineasAyuda,
    cambio,
  }
  // The app adds the source line and the signature, so every review pass and the stored version see what she signs.
  const armar = (escrito: EscritoDeCarrusel): TextoDeCarrusel => ({
    laminas: laminasDelEscrito(escrito, linea),
    textoPost: textoDeLaPublicacion(escrito.textoPost, linea),
  })
  const revisar = (texto: TextoDeCarrusel, lineasAyuda: boolean) =>
    revisarCarrusel({ ...texto, requiereLineasAyuda: lineasAyuda, ajeno })
  let costoUsd = 0

  let escrito = await escribirCarrusel(base)
  costoUsd += costoClaude(escrito.uso, MODELO_POR_TAREA.escribirCarrusel.modelo)
  let texto = armar(escrito)
  let hallazgos = revisar(texto, requiereLineasAyuda)
  if (bloquea(hallazgos)) {
    // One correction round only: whatever still blocks after it is left for Coni to see.
    escrito = await escribirCarrusel({ ...base, correcciones: hallazgos })
    costoUsd += costoClaude(escrito.uso, MODELO_POR_TAREA.escribirCarrusel.modelo)
    texto = armar(escrito)
    hallazgos = revisar(texto, requiereLineasAyuda)
  }

  const juicio = await revisarCarruselConClaude({ cliente, guia, ...texto, alertas: idea.alertas })
  costoUsd += costoClaude(juicio.uso, MODELO_POR_TAREA.revisarCarrusel.modelo)
  if (juicio.hallazgos.some((h) => h.regla === "tema_de_riesgo")) hallazgos = revisar(texto, true)

  return {
    texto,
    revision: revisionAJson([...hallazgos, ...juicio.hallazgos]),
    respaldo: respaldoAJson(respaldo),
    costoUsd,
  }
}

/**
 * Writes a carousel in `guion_en_proceso` (from an idea, or again from her pending request) and leaves it in
 * `guion_por_aprobar`. No voice, no avatar, nothing approved. Safe to run again, like the script writer: a version
 * saved with its confirmed spend is handed over without paying twice.
 */
export async function producirCarrusel(deps: DepsProduccion, leida: FilaDePieza): Promise<ResultadoProduccion> {
  const { db } = deps
  let fila = leida
  const contexto = await cargarContexto(deps, fila)
  const anterior = fila.pedido_de_cambio === null ? null : await leerCarruselVigente(db, fila.id)
  const cambio =
    fila.pedido_de_cambio !== null && anterior !== null
      ? { pedido: fila.pedido_de_cambio, anterior: { laminas: anterior.laminas, textoPost: anterior.textoPost } }
      : null

  const clave = claveDeGasto(fila, `claude-carrusel:${fila.id}:${contexto.idea.id}`)
  const reserva = await reservarGasto(db, {
    piezaId: fila.id,
    proveedor: "anthropic",
    paso: "carrusel",
    estimadoUsd: ESTIMADO_CARRUSEL_CLAUDE_USD,
    clave,
    ahora: deps.ahora(),
  })
  if (reserva.limite) {
    await explicar(deps, fila, TEXTO_LIMITE)
    await avisarLimite(deps, deps.ahora())
    return { resultado: "limite" }
  }

  // A declined change leaves the version she read: it goes back to gate 1 to sign as it is or ask again. Her request
  // was already counted (cambios_de_texto), so a refused change still spends one of the three.
  const rechazado = async (): Promise<ResultadoProduccion> => {
    if (cambio === null) {
      await explicar(deps, fila, TEXTO_RECHAZO_CARRUSEL)
    } else {
      const devuelta = await actualizarPieza(db, fila.id, fila.version, {
        estado: "guion_por_aprobar",
        pedido_de_cambio: null,
        explicacion: TEXTO_CAMBIO_NO_HECHO,
        version: fila.version + 1,
      })
      if (!devuelta) throw piezaCambio()
    }
    return { resultado: "rechazado" }
  }

  switch (reserva.gasto.estado) {
    case "liberado":
      // A refusal released it earlier: asking again would only be refused again, and cost money.
      return rechazado()
    case "confirmado":
      // The version is saved in the same transaction that confirms its spend (guardar_carrusel): it is there.
      break
    default: {
      let redactado: Redactado
      try {
        redactado = await redactarCarrusel(deps, contexto, cambio)
      } catch (error) {
        if (!(error instanceof RechazoDeClaude)) throw error
        await liberarGasto(db, clave)
        return rechazado()
      }
      const guardada = await guardarCarrusel(db, {
        piezaId: fila.id,
        versionLeida: fila.version,
        laminas: laminasAJson(redactado.texto.laminas),
        textoPost: redactado.texto.textoPost,
        hashTexto: hashTextoDeCarrusel(redactado.texto),
        revision: redactado.revision,
        clave,
        realUsd: aCuatroDecimales(redactado.costoUsd),
        respaldo: redactado.respaldo,
      })
      if (!guardada) throw piezaCambio()
      fila = guardada
    }
  }

  const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "carrusel_listo" })
  const lista = await actualizarPieza(db, fila.id, fila.version, cambiosDesdePieza(pieza))
  if (!lista) throw piezaCambio()
  return { resultado: "producida" }
}
