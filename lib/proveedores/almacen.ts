import { createHash } from "node:crypto"
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
  urlFirmada(clave: string, segundos: number): Promise<string>
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
    async urlFirmada(clave, segundos) {
      exigirVigencia(segundos)
      if (!objetos.has(clave)) throw noExiste(clave)
      return `https://almacen.test/${clave}?expira=${segundos}`
    },
    obtener: (clave) => objetos.get(clave),
    claves: () => [...objetos.keys()],
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Content-addressed: a regenerated voice has other bytes, so it gets another key, and since the key is the
 * `audio_id` that gate 1 binds, the approval of the old voice no longer applies.
 */
export function claveAudio(piezaId: string, mp3: Uint8Array): string {
  if (!UUID.test(piezaId)) {
    throw new Error(`El id de la pieza no es un UUID: ${piezaId}`)
  }
  return `voces/${piezaId}/${createHash("sha256").update(mp3).digest("hex")}.mp3`
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
    borrar: (clave) =>
      envolver("borrar", clave, async () => {
        await cliente.send(new DeleteObjectCommand({ Bucket: balde, Key: clave }))
      }),
    urlFirmada: async (clave, segundos) => {
      exigirVigencia(segundos)
      // The same contract as the in-memory store: no link for an object that is not there.
      await envolver("firmar", clave, () => cliente.send(new HeadObjectCommand({ Bucket: balde, Key: clave })))
      return envolver("firmar", clave, () =>
        getSignedUrl(cliente, new GetObjectCommand({ Bucket: balde, Key: clave }), { expiresIn: segundos }),
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
