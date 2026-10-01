// @vitest-environment node
import { HttpResponse, http } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { almacenEnMemoria, almacenR2, almacenReal } from "@/lib/proveedores/almacen"
import { servidor } from "../msw"

const CUENTA = "cuenta0123456789"
const LLAVE = "AKIAPRUEBADELLAVE"
const SECRETO = "secreto/de+prueba/que/no/debe/salir"
const BALDE = "videos-de-coni"
const ANFITRION = `https://${CUENTA}.r2.cloudflarestorage.com`
const MP4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50])
const CLAVE_OBJETO = "videos/11111111-2222-4333-8444-555555555555/abc.mp4"

function r2() {
  return almacenR2({ cuenta: CUENTA, llave: LLAVE, secreto: SECRETO, balde: BALDE })
}

interface Capturada {
  metodo: string
  url: URL
  cabeceras: Headers
  cuerpo: Uint8Array
}

function capturando(respuesta: () => Response): { capturas: Capturada[] } {
  const capturas: Capturada[] = []
  servidor.use(
    http.all(`${ANFITRION}/*`, async ({ request }) => {
      capturas.push({
        metodo: request.method,
        url: new URL(request.url),
        cabeceras: request.headers,
        cuerpo: new Uint8Array(await request.clone().arrayBuffer()),
      })
      return respuesta()
    }),
  )
  return { capturas }
}

function errorS3(codigo: string, mensaje: string, estado: number): () => Response {
  return () =>
    new HttpResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${codigo}</Code><Message>${mensaje}</Message></Error>`,
      {
        status: estado,
        headers: { "Content-Type": "application/xml" },
      },
    )
}

async function rechazo(promesa: Promise<unknown>): Promise<Error> {
  try {
    await promesa
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error("Se esperaba un rechazo")
}

describe("almacenEnMemoria (the rest of the contract)", () => {
  it("returns a copy of what was stored and deletes it", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir("a", MP4, "video/mp4")

    const bajado = await almacen.bajar("a")
    expect([...bajado]).toEqual([...MP4])
    bajado[0] = 99
    expect([...(await almacen.bajar("a"))]).toEqual([...MP4])

    await almacen.borrar("a")
    expect(almacen.claves()).toEqual([])
  })

  it("refuses to download an object that is not there, and deleting one that is not there is not an error", async () => {
    const almacen = almacenEnMemoria()
    await expect(almacen.bajar("nada")).rejects.toThrow("nada")
    await expect(almacen.borrar("nada")).resolves.toBeUndefined()
  })

  it("refuses an expiry that is not a whole number of seconds up to a week", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir("a", MP4, "video/mp4")
    await expect(almacen.urlFirmada("a", 1.5)).rejects.toThrow()
    await expect(almacen.urlFirmada("a", 604_801)).rejects.toThrow()
    await expect(almacen.urlFirmada("a", 604_800)).resolves.toContain("604800")
  })
})

describe("almacenEnMemoria.listar", () => {
  it("lists the objects under a prefix with their size, and nothing else", async () => {
    const almacen = almacenEnMemoria()
    await almacen.subir("respaldos/2026-10-01.sql.gz", new Uint8Array(5), "application/gzip")
    await almacen.subir("respaldos/2026-10-02.sql.gz", new Uint8Array(7), "application/gzip")
    await almacen.subir("videos/p/a.mp4", MP4, "video/mp4")

    expect(await almacen.listar("respaldos/")).toEqual([
      { clave: "respaldos/2026-10-01.sql.gz", bytes: 5 },
      { clave: "respaldos/2026-10-02.sql.gz", bytes: 7 },
    ])
    expect(await almacen.listar("nada/")).toEqual([])
  })
})

describe("almacenR2", () => {
  describe("listar", () => {
    // https://developers.cloudflare.com/r2/api/s3/api/ : ListObjectsV2 with `prefix`, `continuation-token`, `max-keys`.
    it("lists a prefix with ListObjectsV2 and follows the continuation token", async () => {
      const paginas = [
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>t2</NextContinuationToken><Contents><Key>respaldos/a.sql.gz</Key><Size>10</Size></Contents></ListBucketResult>`,
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>respaldos/b.sql.gz</Key><Size>20</Size></Contents></ListBucketResult>`,
      ]
      const { capturas } = capturando(
        () => new HttpResponse(paginas.shift(), { status: 200, headers: { "Content-Type": "application/xml" } }),
      )

      const objetos = await r2().listar("respaldos/")

      expect(objetos).toEqual([
        { clave: "respaldos/a.sql.gz", bytes: 10 },
        { clave: "respaldos/b.sql.gz", bytes: 20 },
      ])
      expect(capturas.map((c) => c.url.searchParams.get("prefix"))).toEqual(["respaldos/", "respaldos/"])
      expect(capturas.map((c) => c.url.searchParams.get("continuation-token"))).toEqual([null, "t2"])
      expect(capturas.map((c) => c.metodo)).toEqual(["GET", "GET"])
    })

    it("returns an empty list for a prefix with nothing in it", async () => {
      capturando(
        () =>
          new HttpResponse(
            `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>`,
            { status: 200, headers: { "Content-Type": "application/xml" } },
          ),
      )
      expect(await r2().listar("respaldos/")).toEqual([])
    })

    it("fails with a plain error that never carries the secret", async () => {
      capturando(errorS3("InternalError", `boom ${SECRETO}`, 500))
      const error = await rechazo(r2().listar("respaldos/"))
      expect(error.message).not.toContain(SECRETO)
    })
  })

  describe("urlFirmada", () => {
    it("signs a GET URL on the account host with the bucket and key in the path and the expiry asked for", async () => {
      const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))

      const url = new URL(await r2().urlFirmada(CLAVE_OBJETO, 600))

      expect(url.protocol).toBe("https:")
      expect(url.host).toBe(`${CUENTA}.r2.cloudflarestorage.com`)
      expect(url.pathname).toBe(`/${BALDE}/${CLAVE_OBJETO}`)
      expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
      expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256")
      expect(url.searchParams.get("X-Amz-Credential")).toMatch(new RegExp(`^${LLAVE}/\\d{8}/auto/s3/aws4_request$`))
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/)
      expect(url.href).not.toContain(SECRETO)
      expect(capturas.map((c) => c.metodo)).toEqual(["HEAD"])
    })

    it("asks R2 to answer as a download with the file name chosen when a name is given", async () => {
      capturando(() => new HttpResponse(null, { status: 200 }))

      const url = new URL(await r2().urlFirmada(CLAVE_OBJETO, 600, { descargarComo: "reel-ab12cd34.mp4" }))

      expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="reel-ab12cd34.mp4"')
      expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
    })

    it("does not turn a link into a download unless asked", async () => {
      capturando(() => new HttpResponse(null, { status: 200 }))
      const url = new URL(await r2().urlFirmada(CLAVE_OBJETO, 600))
      expect(url.searchParams.has("response-content-disposition")).toBe(false)
    })

    it("refuses a download name that could break out of the header", async () => {
      capturando(() => new HttpResponse(null, { status: 200 }))
      await expect(r2().urlFirmada(CLAVE_OBJETO, 600, { descargarComo: 'a"; x=y' })).rejects.toThrow()
      await expect(r2().urlFirmada(CLAVE_OBJETO, 600, { descargarComo: "a\r\nb.mp4" })).rejects.toThrow()
    })

    it("refuses to sign a URL for an object that is not there", async () => {
      capturando(errorS3("NotFound", "Not Found", 404))
      const error = await rechazo(r2().urlFirmada(CLAVE_OBJETO, 600))
      expect(error.message).toContain("No existe el objeto")
      expect(error.message).toContain(CLAVE_OBJETO)
    })

    it.each([0, -5, 1.5, Number.NaN, 604_801])("refuses an expiry of %s without calling R2", async (segundos) => {
      const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))
      await expect(r2().urlFirmada(CLAVE_OBJETO, segundos)).rejects.toThrow()
      expect(capturas).toHaveLength(0)
    })
  })

  describe("subir", () => {
    it("puts the bytes with their media type at the bucket and key", async () => {
      const { capturas } = capturando(() => new HttpResponse(null, { status: 200, headers: { ETag: '"abc"' } }))

      await r2().subir(CLAVE_OBJETO, MP4, "video/mp4")

      expect(capturas).toHaveLength(1)
      const [pedido] = capturas
      expect(pedido?.metodo).toBe("PUT")
      expect(pedido?.url.host).toBe(`${CUENTA}.r2.cloudflarestorage.com`)
      expect(pedido?.url.pathname).toBe(`/${BALDE}/${CLAVE_OBJETO}`)
      expect(pedido?.cabeceras.get("content-type")).toBe("video/mp4")
      expect([...(pedido?.cuerpo ?? [])]).toEqual([...MP4])
      expect(pedido?.cabeceras.get("authorization")).toContain(`Credential=${LLAVE}/`)
      expect(pedido?.cabeceras.get("authorization")).not.toContain(SECRETO)
    })

    it("sends a plain signed body: R2 does not take the SDK's default aws-chunked checksum trailers", async () => {
      const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))

      await r2().subir(CLAVE_OBJETO, MP4, "video/mp4")

      const cabeceras = capturas[0]?.cabeceras
      expect(cabeceras?.get("content-encoding") ?? "").not.toContain("aws-chunked")
      expect(cabeceras?.has("x-amz-sdk-checksum-algorithm")).toBe(false)
      expect(cabeceras?.has("x-amz-trailer")).toBe(false)
      expect(cabeceras?.get("content-length")).toBe(String(MP4.length))
    })
  })

  describe("bajar", () => {
    it("gets the bytes of the object", async () => {
      const { capturas } = capturando(() => new HttpResponse(MP4, { headers: { "Content-Type": "video/mp4" } }))

      const bytes = await r2().bajar(CLAVE_OBJETO)

      expect([...bytes]).toEqual([...MP4])
      expect(capturas[0]?.metodo).toBe("GET")
      expect(capturas[0]?.url.pathname).toBe(`/${BALDE}/${CLAVE_OBJETO}`)
    })

    it("says the object does not exist when R2 answers NoSuchKey", async () => {
      capturando(errorS3("NoSuchKey", "The specified key does not exist.", 404))
      const error = await rechazo(r2().bajar(CLAVE_OBJETO))
      expect(error.message).toContain("No existe el objeto")
      expect(error.message).toContain(CLAVE_OBJETO)
    })
  })

  describe("borrar", () => {
    it("deletes the object at the bucket and key", async () => {
      const { capturas } = capturando(() => new HttpResponse(null, { status: 204 }))

      await r2().borrar(CLAVE_OBJETO)

      expect(capturas).toHaveLength(1)
      expect(capturas[0]?.metodo).toBe("DELETE")
      expect(capturas[0]?.url.pathname).toBe(`/${BALDE}/${CLAVE_OBJETO}`)
    })
  })

  describe("errors", () => {
    it("surface as a plain Error that names the action, the key and R2's reason", async () => {
      capturando(errorS3("AccessDenied", "Access Denied", 403))
      const error = await rechazo(r2().subir(CLAVE_OBJETO, MP4, "video/mp4"))
      expect(error.constructor).toBe(Error)
      expect(error.message).toContain("subir")
      expect(error.message).toContain(CLAVE_OBJETO)
      expect(error.message).toContain("AccessDenied")
      expect(error.message).toContain("403")
    })

    it("never contain the access key or the secret, even when R2 echoes them", async () => {
      capturando(errorS3("InvalidAccessKeyId", `The key ${LLAVE} with secret ${SECRETO} is not valid`, 403))
      const error = await rechazo(r2().bajar(CLAVE_OBJETO))
      expect(error.message).not.toContain(SECRETO)
      expect(error.message).not.toContain(LLAVE)
      expect(error.cause).toBeUndefined()
    })

    it("surface a server error as a plain Error", async () => {
      capturando(errorS3("InternalError", "We encountered an internal error", 500))
      const error = await rechazo(r2().borrar(CLAVE_OBJETO))
      expect(error.constructor).toBe(Error)
      expect(error.message).toContain("borrar")
      expect(error.message).toContain("500")
    })

    it("surface a dropped network as a plain Error", async () => {
      capturando(() => HttpResponse.error())
      const error = await rechazo(r2().bajar(CLAVE_OBJETO))
      expect(error.constructor).toBe(Error)
      expect(error.message).toContain("bajar")
      expect(error.message).not.toContain(SECRETO)
    })
  })
})

describe("almacenReal", () => {
  const VARIABLES = {
    R2_ACCOUNT_ID: CUENTA,
    R2_ACCESS_KEY_ID: LLAVE,
    R2_SECRET_ACCESS_KEY: SECRETO,
    R2_BUCKET: BALDE,
  }
  const antes: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const nombre of Object.keys(VARIABLES)) antes[nombre] = process.env[nombre]
  })

  afterEach(() => {
    for (const nombre of Object.keys(VARIABLES)) {
      const valor = antes[nombre]
      if (valor === undefined) delete process.env[nombre]
      else process.env[nombre] = valor
    }
  })

  it("builds the R2 store from the four environment variables", async () => {
    Object.assign(process.env, VARIABLES)
    capturando(() => new HttpResponse(null, { status: 200 }))

    const url = new URL(await almacenReal().urlFirmada(CLAVE_OBJETO, 60))

    expect(url.host).toBe(`${CUENTA}.r2.cloudflarestorage.com`)
    expect(url.pathname).toBe(`/${BALDE}/${CLAVE_OBJETO}`)
  })

  it.each(Object.keys(VARIABLES))("names %s when it is missing", (faltante) => {
    Object.assign(process.env, VARIABLES)
    delete process.env[faltante]
    expect(() => almacenReal()).toThrow(faltante)
  })
})
