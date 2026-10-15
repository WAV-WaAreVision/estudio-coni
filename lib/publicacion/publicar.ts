import type { SupabaseClient } from "@supabase/supabase-js"
import type { DatosDeAviso } from "@/lib/avisos/tipos"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  type CambiosDePieza,
  type FilaDePieza,
  leerCuentaMeta,
  leerPieza,
  leerPublicaciones,
  leerSecreto,
  tomarParaPublicar,
} from "@/lib/datos/repositorio"
import { canonicos, type Destino, esDestino, nombreDeDestinos, resumenDePublicaciones } from "@/lib/dominio/destinos"
import { type Evento, type Pieza, transicionar } from "@/lib/dominio/estados"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import {
  claveIdempotencia,
  formulaDePuerta2,
  hashPuerta2,
  hashTextoDePuerta2,
  puedeEntregarseParaSubir,
  puedePublicar,
  type Veredicto,
} from "@/lib/dominio/puertas"
import { piezaCambio } from "@/lib/produccion/comun"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Notificador } from "@/lib/proveedores/avisos"
import {
  crearContenedorReel,
  EXPLICACION_RECONECTAR,
  estadoContenedor,
  leerPublicacion,
  type Publicacion,
  publicarContenedor,
  TokenVencido,
} from "@/lib/proveedores/instagram"
import type { Database } from "@/lib/supabase/database.types"
import { LINKEDIN_SIN_CONEXION, resolverLinkedin } from "./linkedin"

export interface DepsPublicacion {
  /** A `service_role` client: the database triggers keep enforcing the gates on everything it writes. */
  db: SupabaseClient<Database>
  almacen: Almacen
  avisos: Notificador
  ahora: () => string
  dormir: (ms: number) => Promise<void>
  /** Instagram recommends asking for the container status once a minute, for no more than 5 minutes. */
  sondeo: { cadaMs: number; veces: number }
  /** LinkedIn usually finishes a short reel within a minute or two; what is not ready is resumed by the next tick. */
  sondeoLinkedin: { cadaMs: number; veces: number }
}

export type ResultadoPublicacion = {
  piezaId: string
  resultado: "publicada" | "hora_vencida" | "falla_publicacion" | "esperando" | "para_subir_a_mano"
}

/** How long a run holds a piece. Longer than the 5-minute cron, so a piece that is waiting is not retaken at once. */
const ARRIENDO_SEGUNDOS = 600
/** The signed link only has to last until Instagram has fetched the video. */
const VIGENCIA_URL_SEGUNDOS = 3600
/** Every piece is an avatar video until clips of her own can be uploaded (design R1: the label only goes on avatars). */
const ES_AVATAR = true

const EXPLICACION_GENERICA = "Instagram no aceptó la publicación. WAV ya está revisando."
const EXPLICACION_CONTENEDOR = "Instagram no pudo procesar el video. WAV ya está revisando."
const EXPLICACION_CAMBIO =
  "El video o el texto cambiaron después de que los aprobaste, así que no publiqué nada. WAV ya está revisando."
const EXPLICACION_DUDOSA =
  "No pude confirmar si Instagram ya publicó tu reel. No lo reintentes todavía: WAV ya lo está revisando."
const PROBLEMA_TIPO = "no quedó como Reel"
const PROBLEMA_TEXTO = "el texto en Instagram no coincide con el que aprobaste"
const PROBLEMA_ETIQUETA = "Instagram no muestra la etiqueta de contenido hecho con IA"

interface Credenciales {
  token: string
  cuentaId: string
}

/**
 * `nunca`: Instagram was never connected (no account and no token), so the piece goes to Coni for a manual upload.
 * `incompleta`: one of the two is there and the other is missing, which means a connection that broke: the piece
 * keeps failing with the reconnect message instead.
 */
type Conexion = ({ tipo: "conectada" } & Credenciales) | { tipo: "nunca" } | { tipo: "incompleta" }

export interface Contexto {
  deps: DepsPublicacion
  fila: FilaDePieza
  conexion: () => Promise<Conexion>
  /** Failures to send an alert: the piece is already settled, so they are raised at the end of the run. */
  avisosFallidos: Error[]
  /** LinkedIn was chosen but its connection had expired: the handover notice says why it goes by hand. */
  sinLinkedin?: boolean
  /** The piece waits for LinkedIn: its lease is given back at the end of the run. */
  liberarAlFinal?: boolean
}

/** A definitive answer of Instagram, with the explanation for Coni and the technical detail for WAV. */
class Rechazo extends Error {
  constructor(
    readonly explicacion: string,
    readonly detalle: string,
    readonly envioRechazado = false,
  ) {
    super(detalle)
    this.name = "Rechazo"
  }
}

/**
 * Turns the definitive errors of the Instagram adapter into a `Rechazo`; temporary ones (plain errors) go through
 * untouched, because they mean "unknown" and the caller must not guess.
 */
async function enInstagram<T>(llamada: () => Promise<T>): Promise<T> {
  try {
    return await llamada()
  } catch (error) {
    if (error instanceof TokenVencido) throw new Rechazo(EXPLICACION_RECONECTAR, error.message)
    if (error instanceof FallaDeConfiguracion) throw new Rechazo(EXPLICACION_GENERICA, error.message)
    throw error
  }
}

function normalizar(texto: string): string {
  return texto.replace(/\r\n?/g, "\n").trim()
}

/**
 * What the read-back must show before a piece counts as published: a Reel, with the approved caption and, for an
 * avatar, the AI label (design R1). A field Instagram did not return counts as missing, never as fine.
 */
function problemasDeLaLectura(lectura: Publicacion, aprobado: { texto: string; esAvatar: boolean }): string[] {
  const problemas: string[] = []
  if (lectura.tipoDeProducto !== "REELS") problemas.push(PROBLEMA_TIPO)
  if (normalizar(lectura.texto ?? "") !== normalizar(aprobado.texto)) problemas.push(PROBLEMA_TEXTO)
  if (aprobado.esAvatar && lectura.etiquetaIa !== true) problemas.push(PROBLEMA_ETIQUETA)
  return problemas
}

async function avisar(contexto: Contexto, envio: () => Promise<unknown>): Promise<void> {
  try {
    await envio()
  } catch (error) {
    if (!(error instanceof Error)) throw error
    contexto.avisosFallidos.push(error)
  }
}

/** One key per piece, kind and attempt (`intento` goes up on a retry), so a repeated run says nothing twice. */
function avisoDe(
  contexto: Contexto,
  tipo: "error_definitivo" | "publicado" | "listo_para_subir",
  motivo?: string,
): DatosDeAviso {
  const { fila } = contexto
  const partes = [tipo, fila.id, ...(motivo ? [motivo] : []), String(fila.intento)]
  return { tipo, clave: partes.join(":"), piezaId: fila.id }
}

function descripcion(contexto: Contexto): string {
  const { fila } = contexto
  return `pieza ${fila.id} («${fila.titulo}»)`
}

/** The destinations of the piece, validated: the column is checked in the database, this narrows its type. */
export function destinosDe(fila: FilaDePieza): Destino[] {
  const desconocido = fila.destinos.find((destino) => !esDestino(destino))
  if (desconocido !== undefined) throw new Error(`Destino desconocido en la pieza ${fila.id}: ${desconocido}`)
  return canonicos(fila.destinos.filter(esDestino))
}

/**
 * The text side of what was approved, recomputed from the row with the formula the approval used. An approval from before
 * LinkedIn is formula 1 and hashes the caption alone; formula 2 also binds the LinkedIn text and the destinations.
 */
export function hashTextoActual(fila: FilaDePieza, texto: string): string {
  return hashTextoDePuerta2(formulaDePuerta2(fila.puerta2_formula), {
    texto,
    textoLinkedin: fila.texto_linkedin,
    destinos: destinosDe(fila),
  })
}

/** Writes columns of the piece with the optimistic lock; the row it returns is the one the next write builds on. */
async function escribir(contexto: Contexto, cambios: CambiosDePieza): Promise<void> {
  const { fila } = contexto
  const guardada = await actualizarPieza(contexto.deps.db, fila.id, fila.version, {
    ...cambios,
    version: fila.version + 1,
  })
  if (!guardada) throw piezaCambio()
  contexto.fila = guardada
}

async function escribirTransicion(contexto: Contexto, evento: Evento, extra: CambiosDePieza = {}): Promise<Pieza> {
  const { pieza } = transicionar(piezaDesdeFila(contexto.fila), evento)
  // The lease is over whichever way the piece went.
  await escribir(contexto, { ...cambiosDesdePieza(pieza), publicacion_reclamada_hasta: null, ...extra })
  return pieza
}

function detalleParaWav(contexto: Contexto, detalle: string): string {
  const { fila } = contexto
  const partes = [`${descripcion(contexto)}: ${detalle}`]
  if (fila.contenedor_id) partes.push(`contenedor: ${fila.contenedor_id}`)
  if (fila.media_id) partes.push(`media: ${fila.media_id}`)
  if (fila.permalink) partes.push(`permalink: ${fila.permalink}`)
  return partes.join(". ")
}

/** `falla_publicacion`: Coni reads `explicacion`, WAV gets the detail. Nothing is published again from here. */
async function fallar(
  contexto: Contexto,
  explicacion: string,
  detalle: string,
  opciones: { envioRechazado?: boolean } = {},
): Promise<ResultadoPublicacion> {
  const extra: CambiosDePieza = opciones.envioRechazado ? { publicacion_enviada_en: null } : {}
  await escribirTransicion(contexto, { tipo: "falla_publicacion", explicacion }, extra)
  const { avisos } = contexto.deps
  await avisar(contexto, () => avisos.aConi(explicacion, true, avisoDe(contexto, "error_definitivo", "falla")))
  await avisar(contexto, () => avisos.aWav("Falló una publicación en Instagram", detalleParaWav(contexto, detalle)))
  return { piezaId: contexto.fila.id, resultado: "falla_publicacion" }
}

/** The approved time passed (more than 30 minutes ago): the piece goes back to Coni and is never published late. */
async function vencer(contexto: Contexto): Promise<ResultadoPublicacion> {
  await escribirTransicion(contexto, { tipo: "hora_vencida" })
  const mensaje = `Tu reel «${contexto.fila.titulo}» no salió a la hora que aprobaste. Elige una nueva fecha para publicarlo.`
  await avisar(contexto, () =>
    contexto.deps.avisos.aConi(mensaje, true, avisoDe(contexto, "error_definitivo", "hora_vencida")),
  )
  return { piezaId: contexto.fila.id, resultado: "hora_vencida" }
}

async function rechazarPorElGuardia(contexto: Contexto, veredicto: Veredicto): Promise<ResultadoPublicacion> {
  if (veredicto.ok) throw new Error("rechazarPorElGuardia se llamó con un veredicto que permite publicar.")
  switch (veredicto.motivo) {
    case "hora_vencida":
      return vencer(contexto)
    case "antes_de_hora":
      // Not reachable through the lease (it only hands out due pieces), but a clock that moved back must not publish.
      return { piezaId: contexto.fila.id, resultado: "esperando" }
    case "estado":
      throw new Error(`La pieza ${contexto.fila.id} dejó de estar programada mientras se publicaba.`)
    case "sin_aprobacion":
    case "artefacto_cambio":
      return fallar(contexto, EXPLICACION_CAMBIO, `lo aprobado y lo guardado no coinciden (${veredicto.motivo})`)
    case "sin_guion":
      // Only the voice guard (puedeGrabarVoz) answers this; the publish guard never does.
      throw new Error(`El guardia de publicación de la pieza ${contexto.fila.id} devolvió un motivo de la voz.`)
  }
}

/** Saves the id of the live post before anything else can fail, re-reading the piece if it moved under the run. */
async function guardarMediaId(contexto: Contexto, mediaId: string): Promise<void> {
  const { db } = contexto.deps
  for (let intento = 0; intento < 3; intento += 1) {
    const { fila } = contexto
    const guardada = await actualizarPieza(db, fila.id, fila.version, { media_id: mediaId, version: fila.version + 1 })
    if (guardada) {
      contexto.fila = guardada
      return
    }
    const actual = await leerPieza(db, fila.id)
    if (!actual) break
    contexto.fila = actual
  }
  throw new Error(`Publicado en Instagram pero no pude guardar el id: pieza ${contexto.fila.id}, media ${mediaId}.`)
}

/** The read-back. Only a post that passes it is `publicado`; a live post that does not is reported, never repeated. */
async function confirmar(
  contexto: Contexto,
  credenciales: Credenciales,
  mediaId: string,
): Promise<ResultadoPublicacion> {
  const { fila } = contexto
  const texto = fila.texto
  if (texto === null) throw new FallaDeConfiguracion(`La pieza ${fila.id} se publicó sin texto guardado.`)
  const lectura = await enInstagram(() => leerPublicacion({ token: credenciales.token, mediaId }))
  const problemas = problemasDeLaLectura(lectura, { texto, esAvatar: ES_AVATAR })
  if (problemas.length > 0) {
    const permalink = lectura.permalink ? { permalink: lectura.permalink } : {}
    await escribir(contexto, permalink)
    const explicacion = `Tu reel quedó publicado, pero ${problemas.join(" y ")}. WAV ya lo está revisando.`
    return fallar(contexto, explicacion, `la lectura de vuelta no coincide: ${problemas.join("; ")}`)
  }
  if (lectura.permalink === null) {
    throw new Error(`Instagram no devolvió el permalink de la publicación ${mediaId}.`)
  }
  // A destination that goes by hand (LinkedIn) still waits for her: the piece is not finished, it is for her to upload.
  // What remains is read from the rows, not from the destinations: LinkedIn may already be uploaded.
  const quedaLinkedin = (await pendientesDe(contexto)).includes("linkedin")
  await escribirTransicion(
    contexto,
    { tipo: "publicado", quedanAMano: quedaLinkedin },
    { permalink: lectura.permalink },
  )
  const razonDeLinkedin = quedaLinkedin ? await razonDeLinkedinAMano(contexto) : null
  const pendiente = quedaLinkedin
    ? ` Falta subirlo a LinkedIn: entra a la app para descargar el video y copiar el texto.${razonDeLinkedin ? ` ${razonDeLinkedin}` : ""}`
    : ""
  const mensaje = `Tu reel «${fila.titulo}» ya está publicado en Instagram.${pendiente} Míralo aquí: ${lectura.permalink}`
  await avisar(contexto, () => contexto.deps.avisos.aConi(mensaje, false, avisoDe(contexto, "publicado")))
  return { piezaId: fila.id, resultado: "publicada" }
}

type Contenedor = { listo: true; id: string } | { listo: false; resultado: ResultadoPublicacion }

/** Reads the container until it is ready, for as long as the polling budget of this run allows. */
async function esperarContenedor(contexto: Contexto, credenciales: Credenciales, id: string): Promise<Contenedor> {
  const { sondeo, dormir } = contexto.deps
  for (let lectura = 0; lectura < sondeo.veces; lectura += 1) {
    const estado = await enInstagram(() => estadoContenedor({ token: credenciales.token, contenedorId: id }))
    switch (estado.estado) {
      case "listo":
        return { listo: true, id }
      case "error":
      case "expirado":
        return {
          listo: false,
          resultado: await fallar(contexto, EXPLICACION_CONTENEDOR, `contenedor ${estado.estado}: ${estado.detalle}`),
        }
      case "publicado":
        return {
          listo: false,
          resultado: await fallar(
            contexto,
            EXPLICACION_DUDOSA,
            "el contenedor ya figura publicado y no hay id del post",
          ),
        }
      case "en_proceso":
        if (lectura < sondeo.veces - 1) await dormir(sondeo.cadaMs)
    }
  }
  return { listo: false, resultado: { piezaId: contexto.fila.id, resultado: "esperando" } }
}

async function publicarPieza(contexto: Contexto, credenciales: Credenciales): Promise<ResultadoPublicacion> {
  const { deps } = contexto
  const pieza = piezaDesdeFila(contexto.fila)
  const { puerta2 } = pieza
  const texto = contexto.fila.texto
  if (puerta2 === null || texto === null) {
    return fallar(contexto, EXPLICACION_CAMBIO, "la pieza programada no tiene aprobación o texto guardados")
  }
  if (contexto.fila.media_id !== null) {
    // Already live (an earlier run published it and could not finish the read-back): only verify, never publish.
    return confirmar(contexto, credenciales, contexto.fila.media_id)
  }

  // A previous run sent media_publish and never learned the answer: Instagram is asked before anything else, because
  // its docs do not promise that repeating the call is safe, and a late piece must not be sent back for a new date
  // while its post may be live.
  let contenedorListo = false
  if (contexto.fila.publicacion_enviada_en !== null) {
    const enviado = contexto.fila.contenedor_id
    if (enviado === null) {
      throw new FallaDeConfiguracion(`La pieza ${contexto.fila.id} tiene un envío sin contenedor guardado.`)
    }
    const estado = await enInstagram(() => estadoContenedor({ token: credenciales.token, contenedorId: enviado }))
    switch (estado.estado) {
      case "publicado":
        // The docs name no field that gives the post id of a container, so it cannot be recovered here.
        return fallar(contexto, EXPLICACION_DUDOSA, "un envío anterior sí se publicó y no tengo el id del post")
      case "en_proceso":
        return { piezaId: contexto.fila.id, resultado: "esperando" }
      case "listo":
        contenedorListo = true
        break
      case "error":
      case "expirado":
        await escribir(contexto, { contenedor_id: null, contenedor_clave: null, publicacion_enviada_en: null })
        break
    }
  }

  const textoActual = hashTextoActual(contexto.fila, texto)
  const veredicto = puedePublicar(pieza, { hashTexto: textoActual, ahora: deps.ahora() })
  if (!veredicto.ok) return rechazarPorElGuardia(contexto, veredicto)

  const clave = claveIdempotencia({
    piezaId: contexto.fila.id,
    paso: "publicar",
    hash: hashPuerta2({ videoId: puerta2.videoId, hashTexto: puerta2.hashTexto, publicarEn: puerta2.publicarEn }),
    intento: contexto.fila.intento,
  })
  let contenedorId = contexto.fila.contenedor_id
  if (contenedorId === null || (!contenedorListo && contexto.fila.contenedor_clave !== clave)) {
    const videoUrl = await deps.almacen.urlFirmada(puerta2.videoId, VIGENCIA_URL_SEGUNDOS)
    contenedorId = await enInstagram(() =>
      crearContenedorReel({
        token: credenciales.token,
        cuentaId: credenciales.cuentaId,
        videoUrl,
        texto,
        esAvatar: ES_AVATAR,
      }),
    )
    // Before polling, so a run that ends here is resumed with this container instead of creating another.
    await escribir(contexto, { contenedor_id: contenedorId, contenedor_clave: clave, publicacion_enviada_en: null })
  }

  if (!contenedorListo) {
    const espera = await esperarContenedor(contexto, credenciales, contenedorId)
    if (!espera.listo) return espera.resultado
  }

  // The window is checked again with the clock of this moment: polling can take minutes.
  const ahora = deps.ahora()
  const ultimo = puedePublicar(pieza, { hashTexto: textoActual, ahora })
  if (!ultimo.ok) return rechazarPorElGuardia(contexto, ultimo)

  // Written before the call: from here on, a lost answer is resolved by reading the container, never by repeating it.
  await escribir(contexto, { publicacion_enviada_en: ahora })
  const idDelContenedor = contenedorId
  let mediaId: string
  try {
    mediaId = await enInstagram(() =>
      publicarContenedor({ token: credenciales.token, cuentaId: credenciales.cuentaId, contenedorId: idDelContenedor }),
    )
  } catch (error) {
    if (error instanceof Rechazo) throw new Rechazo(error.explicacion, error.detalle, true)
    throw error
  }
  await guardarMediaId(contexto, mediaId)
  return confirmar(contexto, credenciales, mediaId)
}

/** Nothing was ever sent to Instagram for this piece, so handing it to Coni cannot leave a post behind. */
function sinRastroEnInstagram(contexto: Contexto): boolean {
  const { fila } = contexto
  return fila.contenedor_id === null && fila.media_id === null && fila.publicacion_enviada_en === null
}

/** The destinations that still wait, from the rows of the piece. */
async function pendientesDe(contexto: Contexto): Promise<Destino[]> {
  return resumenDePublicaciones(await leerPublicaciones(contexto.deps.db, contexto.fila.id)).pendientes
}

/** The destinations Coni still has to upload, in the words of the notice. */
async function pendientesPorSubir(contexto: Contexto): Promise<string> {
  const { pendientes } = resumenDePublicaciones(await leerPublicaciones(contexto.deps.db, contexto.fila.id))
  return nombreDeDestinos(pendientes.length > 0 ? pendientes : destinosDe(contexto.fila))
}

/** At the approved time the piece waits for Coni to upload it herself: Instagram not connected, or a destination that is by hand. */
async function entregarParaSubir(contexto: Contexto): Promise<ResultadoPublicacion> {
  const pieza = piezaDesdeFila(contexto.fila)
  const texto = contexto.fila.texto
  if (pieza.puerta2 === null || texto === null) {
    return fallar(contexto, EXPLICACION_CAMBIO, "la pieza programada no tiene aprobación o texto guardados")
  }
  const veredicto = puedeEntregarseParaSubir(pieza, {
    hashTexto: hashTextoActual(contexto.fila, texto),
    ahora: contexto.deps.ahora(),
  })
  if (!veredicto.ok) return rechazarPorElGuardia(contexto, veredicto)
  await escribirTransicion(contexto, { tipo: "entregar_para_subir" })
  // The rows moved to `para_subir` with the piece: they say what is left, which is not always every destination.
  const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
  const razones = filas.flatMap((p) => (p.estado === "para_subir" && p.explicacion ? [p.explicacion] : []))
  const linkedinPublicado = filas.find((p) => p.destino === "linkedin" && p.estado === "publicado")
  const extras = [
    ...razones,
    ...(contexto.sinLinkedin ? [LINKEDIN_SIN_CONEXION] : []),
    ...(linkedinPublicado?.enlace ? [`Ya salió en LinkedIn: ${linkedinPublicado.enlace}`] : []),
  ]
  const mensaje = [
    `Tu reel «${contexto.fila.titulo}» está listo para que lo subas a ${await pendientesPorSubir(contexto)}. Entra a la app para descargar el video y copiar el texto.`,
    ...extras,
  ].join(" ")
  // Sent at once because its time is now; it is good news, so it is not an urgent kind and carries no error.
  await avisar(contexto, () => contexto.deps.avisos.aConi(mensaje, true, avisoDe(contexto, "listo_para_subir")))
  return { piezaId: contexto.fila.id, resultado: "para_subir_a_mano" }
}

async function razonDeLinkedinAMano(contexto: Contexto): Promise<string | null> {
  const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
  const explicacion = filas.find((p) => p.destino === "linkedin")?.explicacion
  return explicacion ?? (contexto.sinLinkedin ? LINKEDIN_SIN_CONEXION : null)
}

async function avisarLinkedinPublicado(contexto: Contexto): Promise<void> {
  const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
  const enlace = filas.find((p) => p.destino === "linkedin")?.enlace
  const mensaje = `Tu reel «${contexto.fila.titulo}» ya está publicado en LinkedIn. Míralo aquí: ${enlace ?? ""}`
  await avisar(contexto, () => contexto.deps.avisos.aConi(mensaje, false, avisoDe(contexto, "publicado", "linkedin")))
}

/** L7: nothing is left to upload. A destination she uploaded by hand makes it `publicado_a_mano`. */
async function cerrarPublicada(contexto: Contexto): Promise<ResultadoPublicacion> {
  const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
  const algunoAMano = filas.some((p) => p.estado === "subido_a_mano")
  await escribirTransicion(contexto, { tipo: "publicado", algunoAMano })
  return { piezaId: contexto.fila.id, resultado: "publicada" }
}

async function procesar(contexto: Contexto): Promise<ResultadoPublicacion> {
  try {
    // LinkedIn goes first and settles its own row; what it leaves pending decides the rest (L6, L7).
    const linkedin = await resolverLinkedin(contexto)
    if (linkedin.tipo === "en_curso") {
      // Released when this run ends (not now: the loop would take it again at once), so the next tick resumes LinkedIn
      // within minutes instead of after the 10-minute lease, and Instagram's window is never spent waiting for it.
      contexto.liberarAlFinal = true
      return { piezaId: contexto.fila.id, resultado: "esperando" }
    }
    if (linkedin.tipo === "guardia") return await rechazarPorElGuardia(contexto, linkedin.veredicto)
    if (linkedin.tipo === "listo") await avisarLinkedinPublicado(contexto)
    contexto.sinLinkedin = linkedin.tipo === "nada" && linkedin.sinConexion === true

    // Instagram is published only while its own row still waits: without it (not chosen, or already uploaded by hand)
    // there is nothing to publish, and what remains is by hand.
    const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
    const pendientes = resumenDePublicaciones(filas).pendientes
    if (pendientes.length === 0 && filas.some((p) => p.estado === "publicado")) return await cerrarPublicada(contexto)
    if (!pendientes.includes("instagram")) return await entregarParaSubir(contexto)
    const conexion = await contexto.conexion()
    if (conexion.tipo === "nunca" && sinRastroEnInstagram(contexto)) return await entregarParaSubir(contexto)
    if (conexion.tipo !== "conectada") {
      return await fallar(contexto, EXPLICACION_RECONECTAR, "Falta el token de Instagram (secreto meta) o la cuenta.")
    }
    return await publicarPieza(contexto, conexion)
  } catch (error) {
    if (error instanceof Rechazo) {
      return await fallar(contexto, error.explicacion, error.detalle, { envioRechazado: error.envioRechazado })
    }
    throw error
  }
}

/**
 * Publishes the scheduled pieces whose approved time has come (design D3/R1, accepted change A3): never outside the
 * 30-minute window, never without reading the post back, and never twice. A piece that cannot be settled now (the
 * container is still processing, Instagram had a temporary failure) stays `programado` under its lease and is picked
 * up again by a later run, as long as the window lasts.
 */
export async function publicarPendientes(deps: DepsPublicacion): Promise<ResultadoPublicacion[]> {
  const resultados: ResultadoPublicacion[] = []
  const errores: Error[] = []
  const avisosFallidos: Error[] = []
  let conexion: Promise<Conexion> | undefined
  const leerConexion = () => {
    conexion ??= (async (): Promise<Conexion> => {
      const [token, cuentaId] = await Promise.all([leerSecreto(deps.db, "meta"), leerCuentaMeta(deps.db)])
      if (token && cuentaId) return { tipo: "conectada", token, cuentaId }
      return !token && !cuentaId ? { tipo: "nunca" } : { tipo: "incompleta" }
    })()
    return conexion
  }

  const paraLiberar: Contexto[] = []
  for (;;) {
    const fila = await tomarParaPublicar(deps.db, deps.ahora(), ARRIENDO_SEGUNDOS)
    if (!fila) break
    const contexto: Contexto = { deps, fila, conexion: leerConexion, avisosFallidos }
    try {
      resultados.push(await procesar(contexto))
      if (contexto.liberarAlFinal) paraLiberar.push(contexto)
    } catch (error) {
      if (!(error instanceof Error)) throw error
      errores.push(new Error(`${descripcion(contexto)}: ${error.message}`, { cause: error }))
    }
  }
  for (const contexto of paraLiberar) {
    try {
      await escribir(contexto, { publicacion_reclamada_hasta: null })
    } catch (error) {
      if (!(error instanceof Error)) throw error
      errores.push(new Error(`${descripcion(contexto)}: ${error.message}`, { cause: error }))
    }
  }

  const pendientes = [...errores, ...avisosFallidos]
  if (pendientes.length > 0) {
    throw new AggregateError(
      pendientes,
      `La publicación tuvo problemas: ${pendientes.map((e) => e.message).join(" | ")}`,
    )
  }
  return resultados
}
