import { afterEach, describe, expect, it, vi } from "vitest"
import { type AdminDelPuente, abrirPuente, TEXTO_FALLO_DEL_PUENTE } from "@/lib/sesion/puente"

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef01234567"
const CORREO = "coni@estudio.test"

function adminQueDa(hashedToken: string): AdminDelPuente & { generateLink: ReturnType<typeof vi.fn> } {
  return {
    generateLink: vi.fn(async () => ({ data: { properties: { hashed_token: hashedToken } }, error: null })),
  }
}

function leer(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html")
}

async function paginaPara(
  urlDeIngesta: string,
  token = TOKEN,
  entorno = "production",
): Promise<{ html: string; doc: Document }> {
  const puente = await abrirPuente({ admin: adminQueDa(token), correo: CORREO, urlDeIngesta, entorno })
  if (puente.tipo !== "formulario") throw new Error("Se esperaba la página del puente")
  return { html: puente.html, doc: leer(puente.html) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("abrirPuente", () => {
  it("mints a magic link for Coni's own address and nobody else's", async () => {
    const admin = adminQueDa(TOKEN)

    await abrirPuente({ admin, correo: CORREO, urlDeIngesta: "https://ingesta.example", entorno: "production" })

    expect(admin.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: CORREO })
  })

  it("puts the token only in the body of a POST form to Ingesta's bridge, never in its address", async () => {
    const { html, doc } = await paginaPara("https://ingesta.example")

    const formulario = doc.querySelector("form")
    expect(formulario?.getAttribute("method")).toBe("post")
    expect(formulario?.getAttribute("action")).toBe("https://ingesta.example/ingreso/puente")
    const campo = doc.querySelector('input[name="token_hash"]')
    expect(campo?.getAttribute("type")).toBe("hidden")
    expect(campo?.getAttribute("value")).toBe(TOKEN)
    expect(html.split(TOKEN)).toHaveLength(2)
  })

  it.each(["https://ingesta.example/", "https://ingesta.example/otra/ruta"])(
    "aims at the bridge whatever path INGESTA_URL carries (%s)",
    async (url) => {
      const { doc } = await paginaPara(url)
      expect(doc.querySelector("form")?.getAttribute("action")).toBe("https://ingesta.example/ingreso/puente")
    },
  )

  it.each([
    ["production", "https://ingesta.example"],
    ["development", "https://ingesta.example"],
    ["development", "http://localhost:3300"],
    ["test", "http://localhost:3300"],
  ])("accepts INGESTA_URL in %s when it is %s", async (entorno, url) => {
    const { doc } = await paginaPara(url, TOKEN, entorno)
    expect(doc.querySelector("form")?.getAttribute("action")).toBe(new URL("/ingreso/puente", url).toString())
  })

  it("refuses a plain http INGESTA_URL in production, without minting a link", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const admin = adminQueDa(TOKEN)

    expect(
      await abrirPuente({ admin, correo: CORREO, urlDeIngesta: "http://ingesta.example", entorno: "production" }),
    ).toEqual({ tipo: "fallo" })
    expect(admin.generateLink).not.toHaveBeenCalled()
    expect(registro).toHaveBeenCalledTimes(1)
  })

  it("never carries a user or password from INGESTA_URL into the form", async () => {
    const { html, doc } = await paginaPara("https://u:p@ingesta.example")

    expect(doc.querySelector("form")?.getAttribute("action")).toBe("https://ingesta.example/ingreso/puente")
    expect(html).not.toContain("u:p")
  })

  it("submits itself, and offers a button for a browser without JavaScript", async () => {
    const { doc } = await paginaPara("https://ingesta.example")

    expect(doc.querySelector('button[type="submit"]')?.textContent).toBe("Abrir la Biblioteca")
    expect(doc.querySelector("script")?.textContent).toContain('getElementById("puente").submit()')
    expect(doc.documentElement.getAttribute("lang")).toBe("es-CL")
  })

  it("escapes the token so it can never close its attribute", async () => {
    const raro = '"><script>alert(1)</script>'
    const { doc } = await paginaPara("https://ingesta.example", raro)

    expect(doc.querySelectorAll("script")).toHaveLength(1)
    expect(doc.querySelector('input[name="token_hash"]')?.getAttribute("value")).toBe(raro)
  })

  it.each([undefined, "", "no es una url", "ftp://ingesta.example"])(
    "fails without minting a link when INGESTA_URL is %j",
    async (urlDeIngesta) => {
      const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
      const admin = adminQueDa(TOKEN)

      expect(await abrirPuente({ admin, correo: CORREO, urlDeIngesta, entorno: "development" })).toEqual({
        tipo: "fallo",
      })
      expect(admin.generateLink).not.toHaveBeenCalled()
      expect(registro).toHaveBeenCalledTimes(1)
    },
  )

  it("fails without minting a link when the session carries no address", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const admin = adminQueDa(TOKEN)

    expect(
      await abrirPuente({ admin, correo: null, urlDeIngesta: "https://ingesta.example", entorno: "production" }),
    ).toEqual({
      tipo: "fallo",
    })
    expect(admin.generateLink).not.toHaveBeenCalled()
  })

  it("maps a generateLink error to the plain failure, logging the cause for WAV", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const admin: AdminDelPuente = {
      generateLink: vi.fn(async () => ({
        data: { properties: null },
        error: { message: "User not found", status: 404, code: "user_not_found" },
      })),
    }

    expect(
      await abrirPuente({ admin, correo: CORREO, urlDeIngesta: "https://ingesta.example", entorno: "production" }),
    ).toEqual({
      tipo: "fallo",
    })
    expect(registro).toHaveBeenCalledWith("No pude generar el enlace de la Biblioteca", {
      status: 404,
      code: "user_not_found",
      mensaje: "User not found",
    })
  })

  it("says the failure in plain Spanish", () => {
    expect(TEXTO_FALLO_DEL_PUENTE).toBe("No pude abrir la Biblioteca. Vuelve a intentarlo en un momento.")
  })
})
