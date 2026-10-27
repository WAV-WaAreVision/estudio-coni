import { leerVersion, type VersionDeCarrusel } from "@/lib/datos/carrusel"
import { piezaDesdeFila } from "@/lib/datos/piezas"
import {
  type ConexionLinkedin,
  guardarDocumentoLinkedin,
  leerConexionLinkedin,
  leerFilaLinkedin,
  leerPieza,
  pasarLinkedinAMano,
  reservarEnvioLinkedin,
  sumarIntentoLinkedin,
} from "@/lib/datos/repositorio"
import { aLittleText, siguientePasoLinkedin } from "@/lib/dominio/linkedin"
import { hashTexto, hashTextoDeCarrusel, puedePublicar, type Veredicto } from "@/lib/dominio/puertas"
import { crearPost, estadoDelDocumento, subirDocumento } from "@/lib/proveedores/linkedin"
import {
  aMano,
  antesDeEnviar,
  EXPLICACION_LINKEDIN_TARDE,
  guardarPost,
  LINKEDIN_SIN_CONEXION,
  plazoVencido,
  type ResultadoLinkedin,
} from "./linkedin"
import type { Contexto } from "./publicar"

export const EXPLICACION_LINKEDIN_CARRUSEL =
  "LinkedIn no aceptó el carrusel, así que te lo dejé para subir a mano. WAV ya está revisando."
export const EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL =
  "No pude confirmar si LinkedIn publicó tu carrusel. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí."

/** Documents API: 100 MB and 300 pages (verified 2026-10-27). A carousel is at most 8 pages (decision P6). */
const BYTES_MAXIMOS_DEL_DOCUMENTO = 100 * 1024 * 1024

async function versionAprobada(contexto: Contexto): Promise<VersionDeCarrusel | null> {
  const id = contexto.fila.puerta2_carrusel_id
  return id ? leerVersion(contexto.deps.db, id) : null
}

/** Gate 2 bound this version, these words and this half hour; checked with the clock of the moment. */
function vigente(contexto: Contexto, version: VersionDeCarrusel): Veredicto {
  return puedePublicar(piezaDesdeFila(contexto.fila), {
    hashTexto: hashTextoDeCarrusel(version),
    carruselId: version.id,
    ahora: contexto.deps.ahora(),
  })
}

/**
 * Part 3 (design P3-1): one resumable step of a carousel's LinkedIn row per call, with `resolverLinkedin`'s contract.
 * Never posts twice, never posts what gate 2 did not bind, never uploads the PDF twice.
 */
export async function resolverLinkedinCarrusel(contexto: Contexto): Promise<ResultadoLinkedin> {
  const { db, ahora } = contexto.deps
  const { fila } = contexto
  const filaLinkedin = await leerFilaLinkedin(db, fila.id)
  if (!filaLinkedin || filaLinkedin.estado !== "esperando") return { tipo: "nada" }

  // Settled without calling LinkedIn, before the connection is looked at (as for a reel).
  const paso = siguientePasoLinkedin(filaLinkedin, "documento")
  if (paso.tipo === "nada") return { tipo: "nada" }
  if (paso.tipo === "dudosa") {
    return aMano(
      contexto,
      EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL,
      "un envío anterior no devolvió el post",
      "quiza_publico",
    )
  }
  if (paso.tipo === "a_mano") return aMano(contexto, EXPLICACION_LINKEDIN_CARRUSEL, "se agotaron los intentos")

  const conexion = await leerConexionLinkedin(db)
  if (!conexion || Date.parse(conexion.expiraEn) <= Date.parse(ahora())) {
    // Not a failure (decision P2): WAV is not told; the row says why, for her screen and the notice.
    await pasarLinkedinAMano(db, fila.id, {
      explicacion: LINKEDIN_SIN_CONEXION,
      error: conexion ? "venció la conexión de LinkedIn" : "LinkedIn no está conectado",
    })
    return { tipo: "a_mano" }
  }

  const version = await versionAprobada(contexto)
  if (!version) return { tipo: "guardia", veredicto: { ok: false, motivo: "sin_aprobacion" } }
  const veredicto = vigente(contexto, version)
  if (!veredicto.ok) {
    if (veredicto.motivo === "hora_vencida") return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó la media hora")
    return { tipo: "guardia", veredicto }
  }
  if (plazoVencido(contexto)) return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó el plazo propio de LinkedIn")
  const portada = version.laminas[0]?.texto
  // `listo_con_archivos` and `leerLaminas` guarantee both for an approved version: missing means a bug, not a fallback.
  if (version.pdfClave === null || !portada)
    throw new Error(`La versión ${version.id} aprobada no tiene PDF o portada.`)

  let documentoUrn = filaLinkedin.documentoUrn
  if (paso.tipo === "subir_documento") {
    let datos: Uint8Array
    try {
      datos = await contexto.deps.almacen.bajar(version.pdfClave)
    } catch (error) {
      return antesDeEnviar(contexto, error, false, EXPLICACION_LINKEDIN_CARRUSEL)
    }
    if (datos.byteLength > BYTES_MAXIMOS_DEL_DOCUMENTO) {
      return aMano(contexto, EXPLICACION_LINKEDIN_CARRUSEL, `el PDF pesa ${datos.byteLength} bytes`)
    }
    try {
      documentoUrn = await subirDocumento({ token: conexion.token, miembro: conexion.miembro, datos })
    } catch (error) {
      return antesDeEnviar(contexto, error, false, EXPLICACION_LINKEDIN_CARRUSEL)
    }
    await guardarDocumentoLinkedin(db, fila.id, documentoUrn)
  }
  if (documentoUrn === null) throw new Error(`La fila de LinkedIn de la pieza ${fila.id} quedó sin documento.`)

  const listo = await esperarDocumento(contexto, conexion, documentoUrn)
  if (listo !== true) return listo
  return enviar(contexto, conexion, { version, documentoUrn, titulo: portada })
}

async function esperarDocumento(
  contexto: Contexto,
  conexion: ConexionLinkedin,
  documentoUrn: string,
): Promise<true | ResultadoLinkedin> {
  const { sondeoLinkedin, dormir } = contexto.deps
  for (let lectura = 0; lectura < sondeoLinkedin.veces; lectura += 1) {
    if (plazoVencido(contexto)) return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó el plazo propio de LinkedIn")
    let estado: Awaited<ReturnType<typeof estadoDelDocumento>>
    try {
      estado = await estadoDelDocumento({ token: conexion.token, documento: documentoUrn })
    } catch (error) {
      return antesDeEnviar(contexto, error, false, EXPLICACION_LINKEDIN_CARRUSEL)
    }
    if (estado.estado === "listo") return true
    if (estado.estado === "fallido") {
      // Dropped and counted: the next try uploads again (design P3-2).
      await sumarIntentoLinkedin(contexto.deps.db, contexto.fila.id, {
        error: "PROCESSING_FAILED del documento",
        borrarVideo: false,
        borrarDocumento: true,
      })
      return { tipo: "en_curso" }
    }
    if (lectura < sondeoLinkedin.veces - 1) await dormir(sondeoLinkedin.cadaMs)
  }
  return { tipo: "en_curso" }
}

async function enviar(
  contexto: Contexto,
  conexion: ConexionLinkedin,
  aprobado: { version: VersionDeCarrusel; documentoUrn: string; titulo: string },
): Promise<ResultadoLinkedin> {
  const { db } = contexto.deps
  // Polling takes time: the bound version, its words and the half hour are checked again right before sending.
  const actual = await leerPieza(db, contexto.fila.id)
  if (!actual) throw new Error(`La pieza ${contexto.fila.id} desapareció mientras se publicaba en LinkedIn.`)
  contexto.fila = actual
  const releida = await versionAprobada(contexto)
  if (
    !releida ||
    releida.id !== aprobado.version.id ||
    releida.textoPost !== aprobado.version.textoPost ||
    hashTextoDeCarrusel(releida) !== hashTextoDeCarrusel(aprobado.version)
  ) {
    return { tipo: "guardia", veredicto: { ok: false, motivo: "artefacto_cambio" } }
  }
  const ultimo = vigente(contexto, releida)
  if (!ultimo.ok) {
    if (ultimo.motivo === "hora_vencida") return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó la media hora")
    return { tipo: "guardia", veredicto: ultimo }
  }

  // From here on the post is never sent again (L10).
  const version = await reservarEnvioLinkedin(db, actual.id, actual.version)
  contexto.fila = { ...actual, version }

  let postUrn: string
  try {
    postUrn = await crearPost({
      token: conexion.token,
      miembro: conexion.miembro,
      documento: aprobado.documentoUrn,
      titulo: aprobado.titulo,
      commentary: aLittleText(releida.textoPost),
    })
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return aMano(contexto, EXPLICACION_LINKEDIN_DUDOSA_CARRUSEL, `después de enviar: ${error.message}`, "quiza_publico")
  }
  await guardarPost(contexto, postUrn, hashTexto(releida.textoPost))
  return { tipo: "listo" }
}
