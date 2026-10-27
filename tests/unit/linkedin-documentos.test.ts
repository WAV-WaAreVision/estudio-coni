// @vitest-environment node
import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { RechazoDeLinkedin, subirDocumento, VERSION_DE_LINKEDIN } from "@/lib/proveedores/linkedin"
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
})
