// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  descargarEnlace,
  EnlaceDemasiadoGrande,
  EnlaceNoPermitido,
  esDireccionPublica,
  validarUrlDeEnlace,
} from "@/lib/ingesta/red-segura"

describe("esDireccionPublica", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "192.0.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "febf::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:a9fe:a9fe",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "2001:db8::1",
    "ff02::1",
  ])("rejects %s", (ip) => {
    expect(esDireccionPublica(ip)).toBe(false)
  })

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "2a00:1450:4001::200e",
    "::ffff:8.8.8.8",
  ])("accepts %s", (ip) => {
    expect(esDireccionPublica(ip)).toBe(true)
  })

  it("rejects what is not an address at all", () => {
    expect(esDireccionPublica("ejemplo.cl")).toBe(false)
    expect(esDireccionPublica("999.1.1.1")).toBe(false)
    expect(esDireccionPublica("")).toBe(false)
  })
})

describe("validarUrlDeEnlace", () => {
  it("accepts http and https on their default ports", () => {
    expect(validarUrlDeEnlace("https://ejemplo.cl/nota").hostname).toBe("ejemplo.cl")
    expect(validarUrlDeEnlace("http://ejemplo.cl/nota").protocol).toBe("http:")
  })

  it.each([
    "file:///etc/passwd",
    "ftp://ejemplo.cl/a",
    "javascript:alert(1)",
    "gopher://ejemplo.cl",
    "no es una url",
    "https://usuario:clave@ejemplo.cl/",
    "https://ejemplo.cl:6379/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://localhost/",
    "http://servicio.localhost/",
    "http://interno.local/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::ffff:127.0.0.1]/",
  ])("rejects %s before any lookup", (texto) => {
    expect(() => validarUrlDeEnlace(texto)).toThrow(EnlaceNoPermitido)
  })
})

function html(texto: string, estado = 200, cabeceras: Record<string, string> = {}) {
  return new Response(texto, { status: estado, headers: { "content-type": "text/html", ...cabeceras } })
}

function entorno(respuestas: Record<string, () => Response>, direcciones: Record<string, string[]> = {}) {
  const pedidos: string[] = []
  const resueltos: string[] = []
  return {
    pedidos,
    resueltos,
    fetch: async (entrada: string | URL | Request) => {
      const url = String(entrada)
      pedidos.push(url)
      const respuesta = respuestas[url]
      if (!respuesta) throw new Error(`Pedido inesperado: ${url}`)
      return respuesta()
    },
    resolver: async (host: string) => {
      resueltos.push(host)
      return direcciones[host] ?? ["93.184.216.34"]
    },
  }
}

describe("descargarEnlace", () => {
  it("returns the body, the final URL and the content type", async () => {
    const e = entorno({ "https://ejemplo.cl/nota": () => html("<p>hola</p>") })

    const r = await descargarEnlace({ url: "https://ejemplo.cl/nota", fetch: e.fetch, resolver: e.resolver })

    expect(r.estado).toBe(200)
    expect(r.url).toBe("https://ejemplo.cl/nota")
    expect(r.tipo).toBe("text/html")
    expect(new TextDecoder().decode(r.bytes)).toBe("<p>hola</p>")
  })

  it("refuses a host that resolves to a private address, without fetching", async () => {
    const e = entorno({}, { "interno.ejemplo.cl": ["10.0.0.5"] })

    await expect(
      descargarEnlace({ url: "https://interno.ejemplo.cl/", fetch: e.fetch, resolver: e.resolver }),
    ).rejects.toBeInstanceOf(EnlaceNoPermitido)
    expect(e.pedidos).toEqual([])
  })

  it("refuses a host when any one of its addresses is private (DNS answering a public and a private one)", async () => {
    const e = entorno({}, { "doble.ejemplo.cl": ["93.184.216.34", "127.0.0.1"] })

    await expect(
      descargarEnlace({ url: "https://doble.ejemplo.cl/", fetch: e.fetch, resolver: e.resolver }),
    ).rejects.toBeInstanceOf(EnlaceNoPermitido)
  })

  it("refuses a host that does not resolve", async () => {
    const e = entorno({}, { "nada.ejemplo.cl": [] })

    await expect(
      descargarEnlace({ url: "https://nada.ejemplo.cl/", fetch: e.fetch, resolver: e.resolver }),
    ).rejects.toBeInstanceOf(EnlaceNoPermitido)
  })

  it("follows redirects by hand and validates every hop", async () => {
    const e = entorno({
      "https://ejemplo.cl/a": () => new Response(null, { status: 302, headers: { location: "/b" } }),
      "https://ejemplo.cl/b": () => new Response(null, { status: 301, headers: { location: "https://otro.cl/c" } }),
      "https://otro.cl/c": () => html("llegué"),
    })

    const r = await descargarEnlace({ url: "https://ejemplo.cl/a", fetch: e.fetch, resolver: e.resolver })

    expect(r.url).toBe("https://otro.cl/c")
    expect(e.resueltos).toEqual(["ejemplo.cl", "ejemplo.cl", "otro.cl"])
  })

  it("never lets the runtime follow a redirect on its own", async () => {
    const opciones: (RequestInit | undefined)[] = []
    await descargarEnlace({
      url: "https://ejemplo.cl/a",
      resolver: async () => ["93.184.216.34"],
      fetch: async (_entrada, init) => {
        opciones.push(init)
        return html("ok")
      },
    })

    expect(opciones[0]?.redirect).toBe("manual")
  })

  it("refuses a redirect that points at a private address", async () => {
    const e = entorno({
      "https://ejemplo.cl/a": () =>
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
    })

    await expect(
      descargarEnlace({ url: "https://ejemplo.cl/a", fetch: e.fetch, resolver: e.resolver }),
    ).rejects.toBeInstanceOf(EnlaceNoPermitido)
    expect(e.pedidos).toEqual(["https://ejemplo.cl/a"])
  })

  it("refuses a redirect to another scheme", async () => {
    const e = entorno({
      "https://ejemplo.cl/a": () => new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } }),
    })

    await expect(
      descargarEnlace({ url: "https://ejemplo.cl/a", fetch: e.fetch, resolver: e.resolver }),
    ).rejects.toBeInstanceOf(EnlaceNoPermitido)
  })

  it("refuses a redirect to a host that resolves to a loopback address", async () => {
    const e = entorno(
      {
        "https://ejemplo.cl/a": () => new Response(null, { status: 302, headers: { location: "https://rebote.cl/" } }),
      },
      { "rebote.cl": ["127.0.0.1"] },
    )

    await expect(
      descargarEnlace({ url: "https://ejemplo.cl/a", fetch: e.fetch, resolver: e.resolver }),
    ).rejects.toBeInstanceOf(EnlaceNoPermitido)
  })

  it("stops after 5 redirects", async () => {
    const respuestas: Record<string, () => Response> = {}
    for (let i = 0; i < 10; i++) {
      respuestas[`https://ejemplo.cl/${i}`] = () =>
        new Response(null, { status: 302, headers: { location: `/${i + 1}` } })
    }
    const e = entorno(respuestas)

    await expect(
      descargarEnlace({ url: "https://ejemplo.cl/0", fetch: e.fetch, resolver: e.resolver }),
    ).rejects.toBeInstanceOf(EnlaceNoPermitido)
    expect(e.pedidos).toHaveLength(6)
  })

  it("refuses a body over the cap when the server announces it", async () => {
    const e = entorno({ "https://ejemplo.cl/grande": () => html("x", 200, { "content-length": "9999999" }) })

    await expect(
      descargarEnlace({ url: "https://ejemplo.cl/grande", fetch: e.fetch, resolver: e.resolver, maximoBytes: 1000 }),
    ).rejects.toBeInstanceOf(EnlaceDemasiadoGrande)
  })

  it("refuses a body over the cap even when the server does not announce it", async () => {
    const e = entorno({ "https://ejemplo.cl/grande": () => html("x".repeat(5000)) })

    await expect(
      descargarEnlace({ url: "https://ejemplo.cl/grande", fetch: e.fetch, resolver: e.resolver, maximoBytes: 1000 }),
    ).rejects.toBeInstanceOf(EnlaceDemasiadoGrande)
  })

  it("gives up with a plain, retryable error when the server takes too long", async () => {
    const lento = (_entrada: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolver, rechazar) => {
        init?.signal?.addEventListener("abort", () => rechazar(init.signal?.reason))
      })

    const error = await descargarEnlace({
      url: "https://ejemplo.cl/lento",
      fetch: lento,
      resolver: async () => ["93.184.216.34"],
      esperaMs: 20,
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(EnlaceNoPermitido)
  })

  it("returns an error status as it is, for the caller to read", async () => {
    const e = entorno({ "https://ejemplo.cl/privado": () => html("login", 403) })

    const r = await descargarEnlace({ url: "https://ejemplo.cl/privado", fetch: e.fetch, resolver: e.resolver })

    expect(r.estado).toBe(403)
  })
})
