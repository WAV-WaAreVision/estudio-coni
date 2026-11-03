// @vitest-environment node
import { HttpResponse, http } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
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

    it("existe asks with HEAD and answers true for an object that is there", async () => {
      const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))

      expect(await r2().existe(CLAVE_OBJETO)).toBe(true)
      expect(capturas.map((c) => c.metodo)).toEqual(["HEAD"])
    })

    it("existe answers false on a 404 and rejects on any other error", async () => {
      capturando(() => new HttpResponse(null, { status: 404 }))
      expect(await r2().existe(CLAVE_OBJETO)).toBe(false)

      capturando(errorS3("AccessDenied", "Access Denied", 403))
      const error = await rechazo(r2().existe(CLAVE_OBJETO))
      expect(error.message).not.toContain(SECRETO)
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

  describe("urlDeSubida", () => {
    const CLAVE_MATERIAL = "materiales/11111111-2222-4333-8444-555555555555/original.pdf"

    it("signs a PUT URL with the content type signed, the expiry asked for and the key in the path, without calling R2", async () => {
      const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))

      const url = new URL(await r2().urlDeSubida(CLAVE_MATERIAL, 900, "application/pdf"))

      expect(url.host).toBe(`${CUENTA}.r2.cloudflarestorage.com`)
      expect(url.pathname).toBe(`/${BALDE}/${CLAVE_MATERIAL}`)
      expect(url.searchParams.get("X-Amz-Expires")).toBe("900")
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/)
      expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain("content-type")
      expect(url.href).not.toContain(SECRETO)
      expect(capturas).toHaveLength(0)
    })

    it("refuses a key outside materiales/ without calling R2", async () => {
      const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))
      await expect(r2().urlDeSubida(CLAVE_OBJETO, 900, "video/mp4")).rejects.toThrow(FallaDeConfiguracion)
      await expect(r2().urlDeSubida("materiales/../x", 900, "video/mp4")).rejects.toThrow(FallaDeConfiguracion)
      expect(capturas).toHaveLength(0)
    })

    it.each([0, -5, 1.5, Number.NaN, 3601])("refuses an expiry of %s", async (segundos) => {
      await expect(r2().urlDeSubida(CLAVE_MATERIAL, segundos, "application/pdf")).rejects.toThrow()
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

describe("almacenR2 for the Biblioteca", () => {
  const ID = "11111111-2222-4333-8444-555555555555"
  const TEXTO = `materiales/${ID}/texto-original.txt`
  const LISTA = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>${TEXTO}</Key><Size>3</Size></Contents><Contents><Key>materiales/${ID}/original.pdf</Key><Size>9</Size></Contents></ListBucketResult>`

  it("tamano asks with HEAD and reads the length", async () => {
    const { capturas } = capturando(() => new HttpResponse(null, { status: 200, headers: { "Content-Length": "42" } }))

    expect(await r2().tamano(TEXTO)).toBe(42)
    expect(capturas.map((c) => c.metodo)).toEqual(["HEAD"])
  })

  it("tamano rejects a HEAD 200 without a length instead of reporting an empty object", async () => {
    capturando(() => new HttpResponse(null, { status: 200 }))
    const error = await rechazo(r2().tamano(TEXTO))
    expect(error.message).toContain(TEXTO)
    expect(error.message).not.toContain(SECRETO)
  })

  it("tamano answers null for an object that is not there", async () => {
    capturando(() => new HttpResponse(null, { status: 404 }))
    expect(await r2().tamano(TEXTO)).toBeNull()
  })

  it("tamano rejects any other failure without the secret", async () => {
    capturando(errorS3("InternalError", `boom ${SECRETO}`, 500))
    const error = await rechazo(r2().tamano(TEXTO))
    expect(error.message).not.toContain(SECRETO)
  })

  it("borrarCarpeta lists the material's folder and deletes each key in it", async () => {
    let llamadas = 0
    const { capturas } = capturando(() =>
      llamadas++ === 0
        ? new HttpResponse(LISTA, { status: 200, headers: { "Content-Type": "application/xml" } })
        : new HttpResponse(null, { status: 204 }),
    )

    expect(await r2().borrarCarpeta(ID)).toBe(2)
    expect(capturas[0]?.url.searchParams.get("prefix")).toBe(`materiales/${ID}/`)
    expect(capturas.slice(1).map((c) => `${c.metodo} ${c.url.pathname}`)).toEqual([
      `DELETE /${BALDE}/${TEXTO}`,
      `DELETE /${BALDE}/materiales/${ID}/original.pdf`,
    ])
  })

  it("borrarCarpeta refuses an id that is not a UUID without calling R2", async () => {
    const { capturas } = capturando(() => new HttpResponse(null, { status: 204 }))
    await expect(r2().borrarCarpeta("../voces")).rejects.toThrow(FallaDeConfiguracion)
    expect(capturas).toEqual([])
  })

  it("urlDeTexto checks the text with HEAD and signs a GET that downloads as texto-original.txt", async () => {
    const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))

    const url = new URL((await r2().urlDeTexto(ID, 300)) ?? "")

    expect(url.pathname).toBe(`/${BALDE}/${TEXTO}`)
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300")
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="texto-original.txt"')
    expect(url.href).not.toContain(SECRETO)
    expect(capturas.map((c) => c.metodo)).toEqual(["HEAD"])
  })

  it("urlDeTexto answers null while the text is not there", async () => {
    capturando(() => new HttpResponse(null, { status: 404 }))
    expect(await r2().urlDeTexto(ID, 300)).toBeNull()
  })

  it("urlDeTexto refuses an expiry over an hour and an id that is not a UUID, without calling R2", async () => {
    const { capturas } = capturando(() => new HttpResponse(null, { status: 200 }))
    await expect(r2().urlDeTexto(ID, 3601)).rejects.toThrow(FallaDeConfiguracion)
    await expect(r2().urlDeTexto("../voces", 300)).rejects.toThrow(FallaDeConfiguracion)
    expect(capturas).toEqual([])
  })
})

describe("almacenR2 with a local endpoint (the E2E fake)", () => {
  const ID = "11111111-2222-4333-8444-555555555555"

  it("talks to the endpoint given instead of the account's host", async () => {
    const pedidos: string[] = []
    servidor.use(
      http.all("http://127.0.0.1:9999/*", ({ request }) => {
        pedidos.push(`${request.method} ${new URL(request.url).pathname}`)
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const almacen = almacenR2({
      cuenta: CUENTA,
      llave: LLAVE,
      secreto: SECRETO,
      balde: BALDE,
      endpoint: "http://127.0.0.1:9999",
    })

    const url = new URL((await almacen.urlDeTexto(ID, 300)) ?? "")

    expect(url.host).toBe("127.0.0.1:9999")
    expect(pedidos).toEqual([`HEAD /${BALDE}/materiales/${ID}/texto-original.txt`])
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

  it("uses R2_ENDPOINT for a local run", async () => {
    const pedidos: string[] = []
    servidor.use(
      http.all("http://127.0.0.1:9999/*", ({ request }) => {
        pedidos.push(request.method)
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const url = new URL(
      (await almacenReal({ ...VARIABLES, R2_ENDPOINT: "http://127.0.0.1:9999" }).urlDeTexto(
        "11111111-2222-4333-8444-555555555555",
        60,
      )) ?? "",
    )
    expect(url.host).toBe("127.0.0.1:9999")
    expect(pedidos).toEqual(["HEAD"])
  })

  it.each(["http://localhost:3203", "http://127.0.0.1:3203", "http://[::1]:3203"])(
    "accepts the loopback endpoint %s",
    (endpoint) => {
      expect(() => almacenReal({ ...VARIABLES, R2_ENDPOINT: endpoint })).not.toThrow()
    },
  )

  it.each(["https://otro-balde.example.com", "http://10.0.0.5:9000", "http://127.0.0.1.example.com:3203"])(
    "refuses the remote endpoint %s even off Vercel, naming R2_ENDPOINT without secrets",
    (endpoint) => {
      const intento = () => almacenReal({ ...VARIABLES, R2_ENDPOINT: endpoint })
      expect(intento).toThrow(FallaDeConfiguracion)
      expect(intento).toThrow("R2_ENDPOINT")
      expect(intento).not.toThrow(SECRETO)
      expect(intento).not.toThrow(LLAVE)
    },
  )

  it("refuses a malformed R2_ENDPOINT, naming it", () => {
    const intento = () => almacenReal({ ...VARIABLES, R2_ENDPOINT: "no es una url" })
    expect(intento).toThrow(FallaDeConfiguracion)
    expect(intento).toThrow("R2_ENDPOINT")
  })

  it("refuses R2_ENDPOINT on Vercel: nothing would reach the real bucket", () => {
    expect(() => almacenReal({ ...VARIABLES, R2_ENDPOINT: "http://127.0.0.1:9999", VERCEL: "1" })).toThrow(
      FallaDeConfiguracion,
    )
  })
})
