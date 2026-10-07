import { piezaDesdeFila } from "@/lib/datos/piezas"
import {
  type ConexionLinkedin,
  guardarPostLinkedin,
  guardarVideoLinkedin,
  leerConexionLinkedin,
  leerFilaLinkedin,
  leerPieza,
  pasarLinkedinAMano,
  reservarEnvioLinkedin,
  sumarIntentoLinkedin,
} from "@/lib/datos/repositorio"
import { aLittleText, siguientePasoLinkedin } from "@/lib/dominio/linkedin"
import { hashTexto, puedePublicar, type Veredicto } from "@/lib/dominio/puertas"
import { AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"
import {
  crearPost,
  estadoDelVideo,
  RechazoDeLinkedin,
  subirVideo,
  TokenDeLinkedinVencido,
} from "@/lib/proveedores/linkedin"
import type { Contexto } from "./publicar"
import { destinosDe, hashTextoActual } from "./publicar"

export const EXPLICACION_LINKEDIN_DUDOSA =
  "No pude confirmar si LinkedIn publicó tu video. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí."
export const EXPLICACION_LINKEDIN_TARDE =
  "No alcancé a publicarlo en LinkedIn dentro de la media hora que aprobaste, así que te lo dejé para subir a mano."
export const EXPLICACION_LINKEDIN_RECONECTAR =
  "LinkedIn pidió conectar de nuevo tu cuenta, así que te lo dejé para subir a mano. Renueva LinkedIn en Ajustes para los próximos."
export const EXPLICACION_LINKEDIN_GENERICA =
  "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando."
export const EXPLICACION_LINKEDIN_VIDEO =
  "LinkedIn no acepta este video (tamaño fuera de lo permitido), así que te lo dejé para subir a mano. WAV ya está revisando."
export const LINKEDIN_SIN_CONEXION = "LinkedIn no está conectado, así que te lo dejé para subir a mano."

/** F5: 75 KB to 500 MB. */
const BYTES_MINIMOS = 75 * 1024
const BYTES_MAXIMOS = 500 * 1024 * 1024

export type ResultadoLinkedin =
  | { tipo: "nada"; sinConexion?: boolean }
  | { tipo: "listo" }
  | { tipo: "a_mano" }
  | { tipo: "en_curso" }
  /** The gate refused for the whole piece: `publicar.ts` settles it as for Instagram. */
  | { tipo: "guardia"; veredicto: Exclude<Veredicto, { ok: true }> }

async function aMano(contexto: Contexto, explicacion: string, detalle: string): Promise<ResultadoLinkedin> {
  const { db, avisos } = contexto.deps
  await pasarLinkedinAMano(db, contexto.fila.id, { explicacion, error: detalle })
  try {
    await avisos.aWav(
      "LinkedIn no publicó un reel",
      `pieza ${contexto.fila.id} («${contexto.fila.titulo}»): ${detalle}`,
    )
  } catch (error) {
    if (!(error instanceof Error)) throw error
    contexto.avisosFallidos.push(error)
  }
  return { tipo: "a_mano" }
}

/** A provider error before the send: definitive ones go by hand at once, temporary ones count a try. */
async function antesDeEnviar(contexto: Contexto, error: unknown, borrarVideo: boolean): Promise<ResultadoLinkedin> {
  if (error instanceof TokenDeLinkedinVencido) return aMano(contexto, EXPLICACION_LINKEDIN_RECONECTAR, error.message)
  if (error instanceof RechazoDeLinkedin) return aMano(contexto, EXPLICACION_LINKEDIN_GENERICA, error.message)
  if (!(error instanceof Error)) throw error
  await sumarIntentoLinkedin(contexto.deps.db, contexto.fila.id, { error: error.message, borrarVideo })
  return { tipo: "en_curso" }
}

function vigente(contexto: Contexto, texto: string): Veredicto {
  return puedePublicar(piezaDesdeFila(contexto.fila), {
    hashTexto: hashTextoActual(contexto.fila, texto),
    ahora: contexto.deps.ahora(),
  })
}

/** L6: one resumable step of the LinkedIn row per call. Never sends a post twice, never sends what was not approved. */
export async function resolverLinkedin(contexto: Contexto): Promise<ResultadoLinkedin> {
  const { db, ahora } = contexto.deps
  const { fila } = contexto
  if (!destinosDe(fila).includes("linkedin")) return { tipo: "nada" }
  const filaLinkedin = await leerFilaLinkedin(db, fila.id)
  if (!filaLinkedin || filaLinkedin.estado !== "esperando") return { tipo: "nada" }

  const conexion = await leerConexionLinkedin(db)
  if (!conexion) return { tipo: "nada" }
  if (Date.parse(conexion.expiraEn) <= Date.parse(ahora())) return { tipo: "nada", sinConexion: true }

  const paso = siguientePasoLinkedin(filaLinkedin)
  if (paso.tipo === "nada") return { tipo: "nada" }
  if (paso.tipo === "dudosa")
    return aMano(contexto, EXPLICACION_LINKEDIN_DUDOSA, "un envío anterior no devolvió el post")
  if (paso.tipo === "a_mano") return aMano(contexto, EXPLICACION_LINKEDIN_GENERICA, "se agotaron los intentos")

  const texto = fila.texto
  const textoLinkedin = fila.texto_linkedin
  if (texto === null || fila.puerta2_formula !== 2 || !textoLinkedin?.trim()) {
    return { tipo: "guardia", veredicto: { ok: false, motivo: "artefacto_cambio" } }
  }
  const veredicto = vigente(contexto, texto)
  if (!veredicto.ok) {
    if (veredicto.motivo === "hora_vencida") return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó la media hora")
    return { tipo: "guardia", veredicto }
  }
  if (!textoLinkedin.includes(AVISO_AVATAR_LINKEDIN)) {
    return aMano(contexto, EXPLICACION_LINKEDIN_GENERICA, "el texto aprobado no trae el aviso del avatar")
  }
  const videoId = piezaDesdeFila(fila).puerta2?.videoId
  if (!videoId) return { tipo: "guardia", veredicto: { ok: false, motivo: "sin_aprobacion" } }

  let videoUrn = filaLinkedin.videoUrn
  if (paso.tipo === "subir_video") {
    const datos = await contexto.deps.almacen.bajar(videoId)
    if (datos.byteLength < BYTES_MINIMOS || datos.byteLength > BYTES_MAXIMOS) {
      return aMano(contexto, EXPLICACION_LINKEDIN_VIDEO, `el video pesa ${datos.byteLength} bytes`)
    }
    try {
      videoUrn = await subirVideo({ token: conexion.token, miembro: conexion.miembro, datos })
    } catch (error) {
      return antesDeEnviar(contexto, error, false)
    }
    await guardarVideoLinkedin(db, fila.id, videoUrn)
  }
  if (videoUrn === null) throw new Error(`La fila de LinkedIn de la pieza ${fila.id} quedó sin video.`)

  const listo = await esperarVideo(contexto, conexion, videoUrn)
  if (listo !== true) return listo

  return enviar(contexto, conexion, { videoUrn, textoLinkedin, texto })
}

async function esperarVideo(
  contexto: Contexto,
  conexion: ConexionLinkedin,
  videoUrn: string,
): Promise<true | ResultadoLinkedin> {
  const { sondeoLinkedin, dormir } = contexto.deps
  for (let lectura = 0; lectura < sondeoLinkedin.veces; lectura += 1) {
    let estado: Awaited<ReturnType<typeof estadoDelVideo>>
    try {
      estado = await estadoDelVideo({ token: conexion.token, video: videoUrn })
    } catch (error) {
      return antesDeEnviar(contexto, error, false)
    }
    if (estado.estado === "listo") return true
    if (estado.estado === "fallido") {
      await sumarIntentoLinkedin(contexto.deps.db, contexto.fila.id, {
        error: `PROCESSING_FAILED: ${estado.detalle}`,
        borrarVideo: true,
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
  aprobado: { videoUrn: string; textoLinkedin: string; texto: string },
): Promise<ResultadoLinkedin> {
  const { db } = contexto.deps
  // Polling takes time: the window and what was approved are checked again with the clock of this moment.
  const actual = await leerPieza(db, contexto.fila.id)
  if (!actual) throw new Error(`La pieza ${contexto.fila.id} desapareció mientras se publicaba en LinkedIn.`)
  contexto.fila = actual
  if (actual.texto_linkedin !== aprobado.textoLinkedin || actual.texto !== aprobado.texto) {
    return { tipo: "guardia", veredicto: { ok: false, motivo: "artefacto_cambio" } }
  }
  const ultimo = vigente(contexto, aprobado.texto)
  if (!ultimo.ok) {
    if (ultimo.motivo === "hora_vencida") return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó la media hora")
    return { tipo: "guardia", veredicto: ultimo }
  }

  // From here on the post is never sent again (L10): the version lock also proves nothing changed since the check.
  const version = await reservarEnvioLinkedin(db, actual.id, actual.version)
  contexto.fila = { ...actual, version }

  let postUrn: string
  try {
    postUrn = await crearPost({
      token: conexion.token,
      miembro: conexion.miembro,
      video: aprobado.videoUrn,
      commentary: aLittleText(aprobado.textoLinkedin),
    })
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return aMano(contexto, EXPLICACION_LINKEDIN_DUDOSA, `después de enviar: ${error.message}`)
  }
  await guardarPost(contexto, postUrn, hashTexto(aprobado.textoLinkedin))
  return { tipo: "listo" }
}

/** Saves the URN of the live post, retrying: a lost write must reach WAV with the URN, never become a second post. */
async function guardarPost(contexto: Contexto, postUrn: string, hashEnviado: string): Promise<void> {
  let ultimo: unknown
  for (let intento = 0; intento < 3; intento += 1) {
    try {
      await guardarPostLinkedin(contexto.deps.db, contexto.fila.id, { postUrn, hashEnviado })
      return
    } catch (error) {
      ultimo = error
    }
  }
  throw new Error(`Publicado en LinkedIn pero no pude guardar el post: pieza ${contexto.fila.id}, ${postUrn}.`, {
    cause: ultimo,
  })
}
