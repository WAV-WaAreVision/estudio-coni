// @vitest-environment node
import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import {
  crearPost,
  estadoDelVideo,
  RechazoDeLinkedin,
  RespuestaDudosa,
  subirVideo,
  TokenDeLinkedinVencido,
  VERSION_DE_LINKEDIN,
} from "@/lib/proveedores/linkedin"
import { PARTE, simularLinkedin } from "../linkedin-msw"

const TOKEN = "AQV_token_de_prueba"
const MIEMBRO = "urn:li:person:abc123XYZ"

describe("subirVideo", () => {
  it("initializes for the member, uploads each byte range and finalizes with the ETags in order", async () => {
    const sim = simularLinkedin()
    const datos = new Uint8Array(PARTE * 2 + 10)

    const video = await subirVideo({ token: TOKEN, miembro: MIEMBRO, datos })

    expect(video).toBe("urn:li:video:C5505AQprueba")
    expect(sim.iniciadas[0]).toEqual({
      initializeUploadRequest: {
        owner: MIEMBRO,
        fileSizeBytes: PARTE * 2 + 10,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    })
    expect(sim.partes).toEqual([
      { indice: 0, bytes: PARTE },
      { indice: 1, bytes: PARTE },
      { indice: 2, bytes: 10 },
    ])
    expect(sim.finalizadas[0]).toEqual({
      finalizeUploadRequest: {
        video: "urn:li:video:C5505AQprueba",
        uploadToken: "",
        uploadedPartIds: ["etag-0", "etag-1", "etag-2"],
      },
    })
    expect(sim.cabeceras.every((c) => c.version === VERSION_DE_LINKEDIN && c.protocolo === "2.0.0")).toBe(true)
  })

  it("fails without an ETag on a part", async () => {
    simularLinkedin({ parte: () => new HttpResponse(null, { status: 200 }) })
    await expect(subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) })).rejects.toThrow(/ETag/)
  })
})

describe("estadoDelVideo", () => {
  it.each([
    ["AVAILABLE", "listo"],
    ["PROCESSING", "procesando"],
    ["WAITING_UPLOAD", "procesando"],
    ["PROCESSING_FAILED", "fallido"],
  ])("handles %s when LinkedIn answers it: %s", async (status, esperado) => {
    simularLinkedin({ estados: [status] })
    expect((await estadoDelVideo({ token: TOKEN, video: "urn:li:video:C5505AQprueba" })).estado).toBe(esperado)
  })

  it("encodes the URN in the path", async () => {
    const sim = simularLinkedin()
    await estadoDelVideo({ token: TOKEN, video: "urn:li:video:C5505AQprueba" })
    expect(sim.consultasDeVideo[0]).toBe("urn:li:video:C5505AQprueba")
  })
})

describe("crearPost", () => {
  it("posts the little text publicly with the video and returns the URN from x-restli-id", async () => {
    const sim = simularLinkedin()
    const urn = await crearPost({
      token: TOKEN,
      miembro: MIEMBRO,
      video: "urn:li:video:C1",
      commentary: "Hola \\(1\\)",
    })
    expect(urn).toBe("urn:li:share:71")
    expect(sim.posts[0]).toEqual({
      author: MIEMBRO,
      commentary: "Hola \\(1\\)",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: "urn:li:video:C1" } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    })
  })

  it("treats a 201 without a valid id as in doubt", async () => {
    simularLinkedin({ post: () => new HttpResponse(null, { status: 201 }) })
    await expect(crearPost({ token: TOKEN, miembro: MIEMBRO, video: "v", commentary: "x" })).rejects.toBeInstanceOf(
      RespuestaDudosa,
    )
  })
})

describe("errors", () => {
  it("turns 401 into TokenDeLinkedinVencido", async () => {
    simularLinkedin({ iniciar: () => HttpResponse.json({ status: 401, message: "Expired" }, { status: 401 }) })
    await expect(subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) })).rejects.toBeInstanceOf(
      TokenDeLinkedinVencido,
    )
  })

  it.each([403, 422, 426])("turns %s into a RechazoDeLinkedin with its status", async (status) => {
    simularLinkedin({ iniciar: () => HttpResponse.json({ status, message: "no" }, { status }) })
    const error = await subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(RechazoDeLinkedin)
    expect((error as RechazoDeLinkedin).http).toBe(status)
  })

  it.each([429, 500, 503])("keeps %s as a temporary plain error", async (status) => {
    simularLinkedin({ iniciar: () => new HttpResponse(null, { status }) })
    const error = await subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(RechazoDeLinkedin)
    expect(error).not.toBeInstanceOf(TokenDeLinkedinVencido)
  })

  it("never puts the token in an error message", async () => {
    simularLinkedin({ iniciar: () => HttpResponse.json({ echo: TOKEN }, { status: 400 }) })
    const error = (await subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) }).catch(
      (e: unknown) => e,
    )) as Error
    expect(error.message).not.toContain(TOKEN)
  })
})
