// @vitest-environment node
import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import {
  crearPost,
  estadoDelDocumento,
  RechazoDeLinkedin,
  subirDocumento,
  VERSION_DE_LINKEDIN,
} from "@/lib/proveedores/linkedin"
import { DOCUMENTO, simularLinkedin } from "../linkedin-msw"

const TOKEN = "AQV_token_de_prueba"
const MIEMBRO = "urn:li:person:abc123XYZ"
const PDF = new TextEncoder().encode("%PDF-1.7 carrusel")

describe("subirDocumento", () => {
  it("initializes for the member, PUTs the whole PDF with her token and returns the document URN", async () => {
    const sim = simularLinkedin()
    expect(await subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF })).toBe(DOCUMENTO)
    expect(sim.documentosIniciados).toEqual([{ initializeUploadRequest: { owner: MIEMBRO } }])
    expect(sim.subidasDeDocumento).toHaveLength(1)
    expect(sim.subidasDeDocumento[0]?.datos).toEqual(PDF)
    expect(sim.subidasDeDocumento[0]?.autorizacion).toBe(`Bearer ${TOKEN}`)
    expect(sim.cabeceras.every((c) => c.version === VERSION_DE_LINKEDIN && c.protocolo === "2.0.0")).toBe(true)
  })

  it("is a definitive rejection when LinkedIn refuses the upload", async () => {
    simularLinkedin({ iniciarDocumento: () => HttpResponse.json({ status: 403 }, { status: 403 }) })
    await expect(subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF })).rejects.toBeInstanceOf(
      RechazoDeLinkedin,
    )
  })

  it("refuses an answer that does not carry a document URN", async () => {
    simularLinkedin({
      iniciarDocumento: () =>
        HttpResponse.json({ value: { uploadUrl: "https://x.test/u", document: "urn:li:video:1" } }),
    })
    await expect(subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF })).rejects.toThrow(/inesperada/)
  })

  it("never puts the upload URL or the token in its error", async () => {
    simularLinkedin({ subidaDeDocumento: () => new HttpResponse(`fallo ${TOKEN}`, { status: 500 }) })
    const error = await subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF }).catch((e: unknown) => e)
    expect(String(error)).not.toContain(TOKEN)
    expect(String(error)).not.toContain("dms-uploads")
  })

  it.each([
    "https://subidas.atacante.test/u",
    "http://www.linkedin.com/dms-uploads/u",
    "https://linkedin.com.atacante.test/u",
    "https://www.licdn.com.atacante.test/u",
  ])("never sends her token to an upload address that is not LinkedIn's (%s)", async (uploadUrl) => {
    const sim = simularLinkedin({
      iniciarDocumento: () =>
        HttpResponse.json({ value: { uploadUrlExpiresAt: 4_102_444_800_000, uploadUrl, document: DOCUMENTO } }),
    })
    const error = await subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RechazoDeLinkedin)
    expect(String(error)).not.toContain(TOKEN)
    expect(String(error)).not.toContain(uploadUrl)
    expect(sim.subidasDeDocumento).toHaveLength(0)
  })

  it.each(["https://www.linkedin.com/dms-uploads/u", "https://api.linkedin.com/u", "https://media.licdn.com/u"])(
    "uploads to LinkedIn's own addresses (%s)",
    async (uploadUrl) => {
      const sim = simularLinkedin({
        iniciarDocumento: () =>
          HttpResponse.json({ value: { uploadUrlExpiresAt: 4_102_444_800_000, uploadUrl, document: DOCUMENTO } }),
        subidaDeDocumentoEn: uploadUrl,
      })
      expect(await subirDocumento({ token: TOKEN, miembro: MIEMBRO, datos: PDF })).toBe(DOCUMENTO)
      expect(sim.subidasDeDocumento).toHaveLength(1)
    },
  )
})

describe("estadoDelDocumento", () => {
  it.each([
    ["AVAILABLE", "listo"],
    ["PROCESSING", "procesando"],
    ["WAITING_UPLOAD", "procesando"],
    ["PROCESSING_FAILED", "fallido"],
  ])("handles %s when LinkedIn answers it: %s", async (status, esperado) => {
    simularLinkedin({ documentos: [status] })
    expect((await estadoDelDocumento({ token: TOKEN, documento: DOCUMENTO })).estado).toBe(esperado)
  })

  it("asks for the document by its URN", async () => {
    const sim = simularLinkedin()
    await estadoDelDocumento({ token: TOKEN, documento: DOCUMENTO })
    expect(sim.consultasDeDocumento).toEqual([DOCUMENTO])
  })

  it("refuses an answer without a status", async () => {
    simularLinkedin({ documento: () => HttpResponse.json({ id: DOCUMENTO }) })
    await expect(estadoDelDocumento({ token: TOKEN, documento: DOCUMENTO })).rejects.toThrow(/inesperada/)
  })
})

describe("crearPost with a document", () => {
  it("posts the document with its title and returns the URN from x-restli-id", async () => {
    const sim = simularLinkedin()
    const urn = await crearPost({
      token: TOKEN,
      miembro: MIEMBRO,
      documento: DOCUMENTO,
      titulo: "Lo que un chatbot no ve de ti",
      commentary: "Hola \\(1\\)",
    })
    expect(urn).toBe("urn:li:share:71")
    expect(sim.posts[0]).toEqual({
      author: MIEMBRO,
      commentary: "Hola \\(1\\)",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: DOCUMENTO, title: "Lo que un chatbot no ve de ti" } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    })
  })

  it("keeps a video post without a title", async () => {
    const sim = simularLinkedin()
    await crearPost({ token: TOKEN, miembro: MIEMBRO, video: "urn:li:video:C1", commentary: "x" })
    expect(sim.posts[0]?.content).toEqual({ media: { id: "urn:li:video:C1" } })
  })
})

describe("the document title (coordinator amendment: at most 100 characters, cut at a word)", () => {
  const post = async (titulo: string) => {
    const sim = simularLinkedin()
    await crearPost({ token: TOKEN, miembro: MIEMBRO, documento: DOCUMENTO, titulo, commentary: "x" })
    return (sim.posts[0]?.content as { media: { title: string } }).media.title
  }

  it("sends a cover of 100 characters or less unchanged, only trimmed", async () => {
    const cien = `${"palabra ".repeat(11)}cuatro`.padEnd(100, "s")
    expect(cien).toHaveLength(100)
    expect(await post(`  ${cien}\n`)).toBe(cien)
  })

  it("cuts a longer cover at the last whole word within 100 characters", async () => {
    const portada =
      "Lo que un chatbot no ve de ti cuando le cuentas lo que te pasa a las tres de la mañana y nadie más te escucha"
    expect(portada.length).toBeGreaterThan(100)
    const titulo = await post(portada)
    expect(titulo.length).toBeLessThanOrEqual(100)
    expect(titulo).toBe(titulo.trim())
    expect(portada.startsWith(titulo)).toBe(true)
    expect(portada[titulo.length]).toBe(" ")
    expect(titulo).toBe(
      "Lo que un chatbot no ve de ti cuando le cuentas lo que te pasa a las tres de la mañana y nadie más",
    )
  })
})
