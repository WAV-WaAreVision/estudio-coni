import { createHash } from "node:crypto"
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"

/** Private object storage: Cloudflare R2 in production (`almacenR2`), memory in tests. Tasks only see this port. */
export interface Almacen {
  subir(clave: string, datos: Uint8Array, tipo: string): Promise<void>
  bajar(clave: string): Promise<Uint8Array>
  /** Deleting an object that is not there is not an error, like S3. */
  borrar(clave: string): Promise<void>
  /** `descargarComo` makes the link answer as a download with that file name instead of playing in the browser. */
  urlFirmada(clave: string, segundos: number, opciones?: { descargarComo?: string }): Promise<string>
  /** A presigned PUT for a material: the browser uploads straight to the store, and `tipo` is signed into the URL. */
  urlDeSubida(clave: string, segundos: number, tipo: string): Promise<string>
  /** True when the object is there; a missing object is `false`, any other failure rejects. */
  existe(clave: string): Promise<boolean>
  /** Every object whose key starts with `prefijo`, in key order, with its size in bytes. */
  listar(prefijo: string): Promise<{ clave: string; bytes: number }[]>
  /** The size in bytes of the object, `null` when it is not there; any other failure rejects. */
  tamano(clave: string): Promise<number | null>
  /** Deletes every object under `materiales/<id>/` and says how many; it touches no other folder. */
  borrarCarpeta(materialId: string): Promise<number>
  /**
   * A signed GET of a material's original text (`materiales/<id>/texto-original.txt`) that downloads as
   * `texto-original.txt`, for at most an hour; `null` while the text is not there. Nothing else is signed this way.
   */
  urlDeTexto(materialId: string, segundos: number): Promise<string | null>
}

/** SigV4 does not sign a URL for longer than a week. */
const VIGENCIA_MAXIMA_SEGUNDOS = 7 * 24 * 60 * 60

function exigirVigencia(segundos: number): void {
  if (!Number.isInteger(segundos) || segundos <= 0 || segundos > VIGENCIA_MAXIMA_SEGUNDOS) {
    throw new Error(
      `Una URL firmada necesita una vigencia de 1 a ${VIGENCIA_MAXIMA_SEGUNDOS} segundos enteros: ${segundos}`,
    )
  }
}

const PREFIJO_DE_MATERIALES = "materiales/"
export const EXTENSIONES_DE_MATERIAL = new Set([
  "pdf",
  "docx",
  "mp3",
  "m4a",
  "wav",
  "mp4",
  "mov",
  "txt",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
])
const ORDEN_MAXIMO = 20
const UUID_DE_MATERIAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CLAVE_DE_MATERIAL = new RegExp(
  `^${PREFIJO_DE_MATERIALES}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original(-(0[1-9]|1\\d|20))?\\.(${[...EXTENSIONES_DE_MATERIAL].join("|")})$`,
)

/** True only for what `claveMaterial` can return: nothing else may be uploaded through a presigned URL. */
function esClaveDeMaterial(clave: string): boolean {
  return CLAVE_DE_MATERIAL.test(clave)
}

/** A browser upload link is short-lived: it only has to outlast one upload. */
const VIGENCIA_MAXIMA_SUBIDA_SEGUNDOS = 60 * 60

function exigirSubida(clave: string, segundos: number): void {
  if (!esClaveDeMaterial(clave)) {
    throw new FallaDeConfiguracion(
      `Solo se sube a una clave de material (${PREFIJO_DE_MATERIALES}<uuid>/original.<ext>): ${clave}`,
    )
  }
  if (!Number.isInteger(segundos) || segundos <= 0 || segundos > VIGENCIA_MAXIMA_SUBIDA_SEGUNDOS) {
    throw new FallaDeConfiguracion(
      `Una URL de subida necesita una vigencia de 1 a ${VIGENCIA_MAXIMA_SUBIDA_SEGUNDOS} segundos enteros: ${segundos}`,
    )
  }
}

/** A name that goes inside a quoted header value: plain letters, digits and dashes, with an extension. */
const NOMBRE_DE_DESCARGA = /^[\w.-]{1,100}$/

function exigirNombreDeDescarga(nombre: string | undefined): void {
  if (nombre !== undefined && !NOMBRE_DE_DESCARGA.test(nombre)) {
    throw new Error(`Nombre de descarga inválido: ${JSON.stringify(nombre)}`)
  }
}

/** A download link is for right now: an hour is the most it may ask. */
const VIGENCIA_MAXIMA_DESCARGA_SEGUNDOS = 60 * 60
const ARCHIVO_DE_TEXTO = "texto-original.txt"

function exigirVigenciaDeDescarga(segundos: number): void {
  if (!Number.isInteger(segundos) || segundos <= 0 || segundos > VIGENCIA_MAXIMA_DESCARGA_SEGUNDOS) {
    throw new FallaDeConfiguracion(
      `Un link de descarga necesita una vigencia de 1 a ${VIGENCIA_MAXIMA_DESCARGA_SEGUNDOS} segundos enteros: ${segundos}`,
    )
  }
}

/** The folder of a material, with the id checked: the only prefix the Biblioteca ever deletes. */
function carpetaDeMaterial(materialId: string): string {
  if (!UUID_DE_MATERIAL.test(materialId)) {
    throw new FallaDeConfiguracion(`El id del material no es un UUID: ${materialId}`)
  }
  return `${PREFIJO_DE_MATERIALES}${materialId.toLowerCase()}/`
}

function claveDeTexto(materialId: string): string {
  return `${carpetaDeMaterial(materialId)}${ARCHIVO_DE_TEXTO}`
}

function noExiste(clave: string): Error {
  return new Error(`No existe el objeto ${clave}`)
}

export interface ObjetoAlmacenado {
  datos: Uint8Array
  tipo: string
}

export interface AlmacenEnMemoria extends Almacen {
  obtener(clave: string): ObjetoAlmacenado | undefined
  claves(): string[]
  /** What the browser's PUT does against a URL from `urlDeSubida`: the bytes land at that key with that type. */
  simularSubida(url: string, datos: Uint8Array): void
}

/** A test double with the same contract as the real store, plus a way to look inside. */
export function almacenEnMemoria(): AlmacenEnMemoria {
  const objetos = new Map<string, ObjetoAlmacenado>()
  const subidasPendientes = new Map<string, { clave: string; tipo: string }>()
  return {
    async subir(clave, datos, tipo) {
      // Copied, as a real upload would: the caller may reuse its buffer afterwards.
      objetos.set(clave, { datos: new Uint8Array(datos), tipo })
    },
    async bajar(clave) {
      const objeto = objetos.get(clave)
      if (!objeto) throw noExiste(clave)
      return new Uint8Array(objeto.datos)
    },
    async borrar(clave) {
      objetos.delete(clave)
    },
    async urlFirmada(clave, segundos, opciones = {}) {
      exigirVigencia(segundos)
      exigirNombreDeDescarga(opciones.descargarComo)
      if (!objetos.has(clave)) throw noExiste(clave)
      const descarga = opciones.descargarComo ? `&descarga=${opciones.descargarComo}` : ""
      return `https://almacen.test/${clave}?expira=${segundos}${descarga}`
    },
    async urlDeSubida(clave, segundos, tipo) {
      exigirSubida(clave, segundos)
      const url = `https://almacen.test/${clave}?subida=${segundos}&tipo=${encodeURIComponent(tipo)}`
      subidasPendientes.set(url, { clave, tipo })
      return url
    },
    simularSubida(url, datos) {
      const subida = subidasPendientes.get(url)
      if (!subida) throw new Error(`Esta URL no salió de urlDeSubida: ${url}`)
      objetos.set(subida.clave, { datos: new Uint8Array(datos), tipo: subida.tipo })
    },
    async existe(clave) {
      return objetos.has(clave)
    },
    async listar(prefijo) {
      return [...objetos.entries()]
        .filter(([clave]) => clave.startsWith(prefijo))
        .map(([clave, objeto]) => ({ clave, bytes: objeto.datos.byteLength }))
        .sort((a, b) => a.clave.localeCompare(b.clave))
    },
    async tamano(clave) {
      return objetos.get(clave)?.datos.byteLength ?? null
    },
    async borrarCarpeta(materialId) {
      const prefijo = carpetaDeMaterial(materialId)
      const claves = [...objetos.keys()].filter((clave) => clave.startsWith(prefijo))
      for (const clave of claves) objetos.delete(clave)
      return claves.length
    },
    async urlDeTexto(materialId, segundos) {
      const clave = claveDeTexto(materialId)
      exigirVigenciaDeDescarga(segundos)
      if (!objetos.has(clave)) return null
      return `https://almacen.test/${clave}?expira=${segundos}&descarga=${ARCHIVO_DE_TEXTO}`
    },
    obtener: (clave) => objetos.get(clave),
    claves: () => [...objetos.keys()],
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sha256(datos: Uint8Array): string {
  return createHash("sha256").update(datos).digest("hex")
}

function exigirUuid(piezaId: string): void {
  if (!UUID.test(piezaId)) {
    throw new Error(`El id de la pieza no es un UUID: ${piezaId}`)
  }
}

/**
 * Content-addressed: a regenerated voice has other bytes, so it gets another key, and since the key is the
 * `audio_id` that gate 1 binds, the approval of the old voice no longer applies.
 */
export function claveAudio(piezaId: string, mp3: Uint8Array): string {
  exigirUuid(piezaId)
  return `voces/${piezaId}/${sha256(mp3)}.mp3`
}

/**
 * The voice of an approved script (formula 2): one key per approval, not per bytes, so a retried run finds the audio
 * a dead run already uploaded instead of paying for another one. A new approval has a new hash and a new key.
 */
export function claveVozAprobada(piezaId: string, puerta1Hash: string): string {
  exigirUuid(piezaId)
  if (!/^[0-9a-f]{64}$/.test(puerta1Hash)) {
    throw new Error("El hash de la puerta 1 debe ser un SHA-256 en hexadecimal.")
  }
  return `voces/${piezaId}/${puerta1Hash}.mp3`
}

/**
 * The final video, content-addressed like the voice: this key is the `video_id` that gate 2 binds, so a regrabar
 * (other bytes, other key) voids the approval of the old video by construction.
 */
export function claveVideo(piezaId: string, mp4: Uint8Array): string {
  exigirUuid(piezaId)
  return `videos/${piezaId}/${sha256(mp4)}.mp4`
}

/** A version's slides are at most eight (`carrusel_hasta_ocho_laminas`). */
const LAMINAS_MAXIMAS = 8

/**
 * A carousel version's files (plan amendment 7): one folder per version, so a design change (a new version) never
 * touches what an earlier gate 2 saw, and inside it one folder per render, so a losing concurrent render never
 * overwrites the files `guardar_armado` saved for the winner.
 */
function carpetaDeCarrusel(piezaId: string, carruselId: string, corridaId: string): string {
  exigirUuid(piezaId)
  exigirUuid(carruselId)
  exigirUuid(corridaId)
  return `carruseles/${piezaId}/${carruselId}/${corridaId}`
}

export function claveLaminaDeCarrusel(piezaId: string, carruselId: string, corridaId: string, indice: number): string {
  const carpeta = carpetaDeCarrusel(piezaId, carruselId, corridaId)
  if (!Number.isInteger(indice) || indice < 0 || indice >= LAMINAS_MAXIMAS) {
    throw new Error(`Lámina fuera de rango: ${indice}`)
  }
  return `${carpeta}/lamina-${String(indice + 1).padStart(2, "0")}.png`
}

export function clavePdfDeCarrusel(piezaId: string, carruselId: string, corridaId: string): string {
  return `${carpetaDeCarrusel(piezaId, carruselId, corridaId)}/carrusel.pdf`
}

/** The original of a material; the images of a multi-image material carry their order (1..20) as two digits. */
export function claveMaterial(materialId: string, extension: string, orden?: number): string {
  if (!UUID.test(materialId)) throw new FallaDeConfiguracion(`El id del material no es un UUID: ${materialId}`)
  const ext = extension.toLowerCase()
  if (!EXTENSIONES_DE_MATERIAL.has(ext))
    throw new FallaDeConfiguracion(`Extensión de material no permitida: ${extension}`)
  if (orden === undefined) return `${PREFIJO_DE_MATERIALES}${materialId}/original.${ext}`
  if (!Number.isInteger(orden) || orden < 1 || orden > ORDEN_MAXIMO) {
    throw new FallaDeConfiguracion(`El orden de la imagen va de 1 a ${ORDEN_MAXIMO}: ${orden}`)
  }
  return `${PREFIJO_DE_MATERIALES}${materialId}/original-${String(orden).padStart(2, "0")}.${ext}`
}

function esNoEncontrado(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { name, $metadata } = error as { name?: unknown; $metadata?: { httpStatusCode?: number } }
  return name === "NotFound" || $metadata?.httpStatusCode === 404
}

export interface OpcionesR2 {
  cuenta: string
  llave: string
  secreto: string
  balde: string
  /** Only for local runs: a fake S3 on this machine instead of the account's R2 host. */
  endpoint?: string
}

function sinSecretos(texto: string, secretos: readonly string[]): string {
  return secretos.reduce((resto, secreto) => (secreto ? resto.split(secreto).join("[secreto]") : resto), texto)
}

interface ErrorDeS3 {
  name?: string
  message?: string
  $metadata?: { httpStatusCode?: number }
}

/**
 * A plain Error that Trigger.dev retries. It is built from the name, status and message only, never from the SDK
 * error itself: that one carries the whole response, and nothing about the credentials belongs in a log.
 */
function fallaDeR2(accion: string, clave: string, error: unknown, secretos: readonly string[]): Error {
  const detalle: ErrorDeS3 = typeof error === "object" && error !== null ? error : {}
  const estado = detalle.$metadata?.httpStatusCode
  if (estado === 404) return noExiste(clave)
  const motivo = [detalle.name, estado ? `HTTP ${estado}` : undefined, detalle.message].filter(Boolean).join(" · ")
  return new Error(sinSecretos(`R2 no pudo ${accion} ${clave}: ${motivo || "sin detalle"}`, secretos).slice(0, 500))
}

/**
 * Cloudflare R2 through its S3 API (https://developers.cloudflare.com/r2/api/s3/api/). Path-style on the account
 * endpoint, so the host is the same for every bucket. The checksum options are off unless required: the SDK's
 * default sends `aws-chunked` trailers, which R2 does not accept for a plain PutObject
 * (https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).
 */
export function almacenR2(opciones: OpcionesR2): Almacen {
  const { cuenta, llave, secreto, balde, endpoint } = opciones
  const secretos = [secreto, llave]
  const cliente = new S3Client({
    region: "auto",
    endpoint: endpoint ?? `https://${cuenta}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: llave, secretAccessKey: secreto },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })

  async function envolver<T>(accion: string, clave: string, llamada: () => Promise<T>): Promise<T> {
    try {
      return await llamada()
    } catch (error) {
      throw fallaDeR2(accion, clave, error, secretos)
    }
  }

  return {
    subir: (clave, datos, tipo) =>
      envolver("subir", clave, async () => {
        await cliente.send(new PutObjectCommand({ Bucket: balde, Key: clave, Body: datos, ContentType: tipo }))
      }),
    bajar: (clave) =>
      envolver("bajar", clave, async () => {
        const { Body: cuerpo } = await cliente.send(new GetObjectCommand({ Bucket: balde, Key: clave }))
        if (!cuerpo) throw noExiste(clave)
        return cuerpo.transformToByteArray()
      }),
    existe: async (clave) => {
      try {
        await cliente.send(new HeadObjectCommand({ Bucket: balde, Key: clave }))
        return true
      } catch (error) {
        if (esNoEncontrado(error)) return false
        throw fallaDeR2("existe", clave, error, secretos)
      }
    },
    borrar: (clave) =>
      envolver("borrar", clave, async () => {
        await cliente.send(new DeleteObjectCommand({ Bucket: balde, Key: clave }))
      }),
    listar: (prefijo) =>
      envolver("listar", prefijo, async () => {
        // https://developers.cloudflare.com/r2/api/s3/api/ : ListObjectsV2 with `prefix` and `continuation-token`.
        const objetos: { clave: string; bytes: number }[] = []
        let siguiente: string | undefined
        do {
          const pagina = await cliente.send(
            new ListObjectsV2Command({ Bucket: balde, Prefix: prefijo, ContinuationToken: siguiente }),
          )
          for (const objeto of pagina.Contents ?? []) {
            if (objeto.Key !== undefined) objetos.push({ clave: objeto.Key, bytes: objeto.Size ?? 0 })
          }
          siguiente = pagina.IsTruncated ? pagina.NextContinuationToken : undefined
        } while (siguiente !== undefined)
        return objetos
      }),
    tamano: async (clave) => {
      try {
        const { ContentLength } = await cliente.send(new HeadObjectCommand({ Bucket: balde, Key: clave }))
        return ContentLength ?? 0
      } catch (error) {
        if (esNoEncontrado(error)) return null
        throw fallaDeR2("medir", clave, error, secretos)
      }
    },
    borrarCarpeta: async (materialId) => {
      const prefijo = carpetaDeMaterial(materialId)
      const claves = await envolver("listar", prefijo, async () => {
        // https://developers.cloudflare.com/r2/api/s3/api/ : ListObjectsV2 with `prefix` and `continuation-token`.
        const encontradas: string[] = []
        let siguiente: string | undefined
        do {
          const pagina = await cliente.send(
            new ListObjectsV2Command({ Bucket: balde, Prefix: prefijo, ContinuationToken: siguiente }),
          )
          for (const objeto of pagina.Contents ?? []) {
            if (objeto.Key?.startsWith(prefijo)) encontradas.push(objeto.Key)
          }
          siguiente = pagina.IsTruncated ? pagina.NextContinuationToken : undefined
        } while (siguiente !== undefined)
        return encontradas
      })
      for (const clave of claves) {
        await envolver("borrar", clave, async () => {
          await cliente.send(new DeleteObjectCommand({ Bucket: balde, Key: clave }))
        })
      }
      return claves.length
    },
    urlDeTexto: async (materialId, segundos) => {
      const clave = claveDeTexto(materialId)
      exigirVigenciaDeDescarga(segundos)
      try {
        // The same contract as the in-memory store: no link for a text that is not there.
        await cliente.send(new HeadObjectCommand({ Bucket: balde, Key: clave }))
      } catch (error) {
        if (esNoEncontrado(error)) return null
        throw fallaDeR2("firmar", clave, error, secretos)
      }
      return envolver("firmar", clave, () =>
        getSignedUrl(
          cliente,
          new GetObjectCommand({
            Bucket: balde,
            Key: clave,
            ResponseContentDisposition: `attachment; filename="${ARCHIVO_DE_TEXTO}"`,
          }),
          { expiresIn: segundos },
        ),
      )
    },
    urlDeSubida: async (clave, segundos, tipo) => {
      exigirSubida(clave, segundos)
      return envolver("firmar", clave, () =>
        getSignedUrl(cliente, new PutObjectCommand({ Bucket: balde, Key: clave, ContentType: tipo }), {
          expiresIn: segundos,
          signableHeaders: new Set(["content-type"]),
        }),
      )
    },
    urlFirmada: async (clave, segundos, opciones = {}) => {
      exigirVigencia(segundos)
      exigirNombreDeDescarga(opciones.descargarComo)
      // The same contract as the in-memory store: no link for an object that is not there.
      await envolver("firmar", clave, () => cliente.send(new HeadObjectCommand({ Bucket: balde, Key: clave })))
      return envolver("firmar", clave, () =>
        getSignedUrl(
          cliente,
          new GetObjectCommand({
            Bucket: balde,
            Key: clave,
            ...(opciones.descargarComo
              ? { ResponseContentDisposition: `attachment; filename="${opciones.descargarComo}"` }
              : {}),
          }),
          { expiresIn: segundos },
        ),
      )
    },
  }
}

const ANFITRIONES_LOCALES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"])

/**
 * `R2_ENDPOINT` only ever points at the fake S3 of a local run. The Trigger.dev workers build this store too and
 * do not set `VERCEL`, so a stray endpoint to any other host would silently move production storage: refused.
 */
function endpointLocal(endpoint: string): string {
  if (!URL.canParse(endpoint)) throw new FallaDeConfiguracion("R2_ENDPOINT no es una URL válida.")
  if (!ANFITRIONES_LOCALES.has(new URL(endpoint).hostname)) {
    throw new FallaDeConfiguracion(
      "R2_ENDPOINT solo puede apuntar a esta máquina (127.0.0.1, localhost o ::1): es para el S3 falso de las pruebas.",
    )
  }
  return endpoint
}

/**
 * The store of the tasks and the app, from the R2 variables. `R2_ENDPOINT` (a fake S3 for the local E2E run) is
 * refused on Vercel, where nothing would then reach the real bucket, and anywhere for a host that is not loopback.
 */
export function almacenReal(entorno: Record<string, string | undefined> = process.env): Almacen {
  if (entorno.R2_ENDPOINT && entorno.VERCEL) {
    throw new FallaDeConfiguracion("R2_ENDPOINT no puede estar activo en Vercel: nada llegaría al bucket real.")
  }
  return almacenR2({
    cuenta: exigirEnv("R2_ACCOUNT_ID", entorno.R2_ACCOUNT_ID),
    llave: exigirEnv("R2_ACCESS_KEY_ID", entorno.R2_ACCESS_KEY_ID),
    secreto: exigirEnv("R2_SECRET_ACCESS_KEY", entorno.R2_SECRET_ACCESS_KEY),
    balde: exigirEnv("R2_BUCKET", entorno.R2_BUCKET),
    endpoint: entorno.R2_ENDPOINT ? endpointLocal(entorno.R2_ENDPOINT) : undefined,
  })
}
