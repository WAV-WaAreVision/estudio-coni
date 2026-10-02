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
import { exigirEnv } from "@/lib/env"

/** Private object storage: Cloudflare R2 in production (`almacenR2`), memory in tests. Tasks only see this port. */
export interface Almacen {
  subir(clave: string, datos: Uint8Array, tipo: string): Promise<void>
  bajar(clave: string): Promise<Uint8Array>
  /** Deleting an object that is not there is not an error, like S3. */
  borrar(clave: string): Promise<void>
  /** `descargarComo` makes the link answer as a download with that file name instead of playing in the browser. */
  urlFirmada(clave: string, segundos: number, opciones?: { descargarComo?: string }): Promise<string>
  /** True when the object is there; a missing object is `false`, any other failure rejects. */
  existe(clave: string): Promise<boolean>
  /** Every object whose key starts with `prefijo`, in key order, with its size in bytes. */
  listar(prefijo: string): Promise<{ clave: string; bytes: number }[]>
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

/** A name that goes inside a quoted header value: plain letters, digits and dashes, with an extension. */
const NOMBRE_DE_DESCARGA = /^[\w.-]{1,100}$/

function exigirNombreDeDescarga(nombre: string | undefined): void {
  if (nombre !== undefined && !NOMBRE_DE_DESCARGA.test(nombre)) {
    throw new Error(`Nombre de descarga inválido: ${JSON.stringify(nombre)}`)
  }
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
}

/** A test double with the same contract as the real store, plus a way to look inside. */
export function almacenEnMemoria(): AlmacenEnMemoria {
  const objetos = new Map<string, ObjetoAlmacenado>()
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
    async existe(clave) {
      return objetos.has(clave)
    },
    async listar(prefijo) {
      return [...objetos.entries()]
        .filter(([clave]) => clave.startsWith(prefijo))
        .map(([clave, objeto]) => ({ clave, bytes: objeto.datos.byteLength }))
        .sort((a, b) => a.clave.localeCompare(b.clave))
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
  const { cuenta, llave, secreto, balde } = opciones
  const secretos = [secreto, llave]
  const cliente = new S3Client({
    region: "auto",
    endpoint: `https://${cuenta}.r2.cloudflarestorage.com`,
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

/** The store the tasks use in production, from the R2 variables of the Trigger.dev environment. */
export function almacenReal(): Almacen {
  return almacenR2({
    cuenta: exigirEnv("R2_ACCOUNT_ID", process.env.R2_ACCOUNT_ID),
    llave: exigirEnv("R2_ACCESS_KEY_ID", process.env.R2_ACCESS_KEY_ID),
    secreto: exigirEnv("R2_SECRET_ACCESS_KEY", process.env.R2_SECRET_ACCESS_KEY),
    balde: exigirEnv("R2_BUCKET", process.env.R2_BUCKET),
  })
}
