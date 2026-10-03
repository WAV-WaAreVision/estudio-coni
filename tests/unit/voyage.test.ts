// @vitest-environment node
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { costoVoyage, DIMENSIONES, embeber, MODELO_VOYAGE } from "@/lib/proveedores/voyage"
import { servidor } from "../msw"

const URL_VOYAGE = "https://api.voyageai.com/v1/embeddings"
const CLAVE = "pa-secreta-de-prueba"

const vector = (n = DIMENSIONES) => Array.from({ length: n }, (_, i) => i / n)

function responder(vectores: number[][], tokens = 12) {
  const capturas: { cabeceras: Headers; cuerpo: Record<string, unknown> }[] = []
  servidor.use(
    http.post(URL_VOYAGE, async ({ request }) => {
      capturas.push({ cabeceras: request.headers, cuerpo: (await request.json()) as Record<string, unknown> })
      return HttpResponse.json({
        object: "list",
        data: vectores.map((embedding, index) => ({ object: "embedding", embedding, index })),
        model: MODELO_VOYAGE,
        usage: { total_tokens: tokens },
      })
    }),
  )
  return capturas
}

describe("embeber", () => {
  it("posts the texts with the key, the model and the input type, and returns the vectors with the tokens", async () => {
    const capturas = responder([vector(), vector()], 20)

    const r = await embeber({ clave: CLAVE, textos: ["uno", "dos"], tipo: "query" })

    expect(capturas).toHaveLength(1)
    expect(capturas[0]?.cabeceras.get("authorization")).toBe(`Bearer ${CLAVE}`)
    expect(capturas[0]?.cuerpo).toEqual({ input: ["uno", "dos"], model: "voyage-3.5", input_type: "query" })
    expect(r.vectores).toHaveLength(2)
    expect(r.vectores[0]).toHaveLength(1024)
    expect(r.tokens).toBe(20)
  })

  it("sends document as the input type for cards", async () => {
    const capturas = responder([vector()])
    await embeber({ clave: CLAVE, textos: ["ficha"], tipo: "document" })
    expect(capturas[0]?.cuerpo.input_type).toBe("document")
  })

  it("never leaks the key when Voyage answers 401, and does not retry a configuration error", async () => {
    servidor.use(http.post(URL_VOYAGE, () => HttpResponse.json({ detail: `bad key ${CLAVE}` }, { status: 401 })))

    const error = await embeber({ clave: CLAVE, textos: ["x"], tipo: "document" }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(String((error as Error).message)).not.toContain(CLAVE)
    expect(String((error as Error).message)).toContain("401")
  })

  it("raises a plain error on a 500 so it can be retried", async () => {
    servidor.use(http.post(URL_VOYAGE, () => HttpResponse.text("boom", { status: 500 })))
    const error = await embeber({ clave: CLAVE, textos: ["x"], tipo: "document" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(FallaDeConfiguracion)
  })

  it("fails when a vector does not have 1024 dimensions", async () => {
    responder([vector(512)])
    await expect(embeber({ clave: CLAVE, textos: ["x"], tipo: "document" })).rejects.toThrow(/1024/)
  })

  it("fails when the answer has an unexpected shape", async () => {
    servidor.use(http.post(URL_VOYAGE, () => HttpResponse.json({ data: "nada" })))
    await expect(embeber({ clave: CLAVE, textos: ["x"], tipo: "document" })).rejects.toThrow(/formato inesperado/)
  })

  it("fails when the number of vectors differs from the number of texts", async () => {
    responder([vector()])
    await expect(embeber({ clave: CLAVE, textos: ["a", "b"], tipo: "document" })).rejects.toThrow(/vectores/)
  })
})

describe("costoVoyage", () => {
  it("prices a million tokens at the list rate of voyage-3.5", () => {
    expect(costoVoyage(1_000_000)).toBeCloseTo(0.06, 10)
    expect(costoVoyage(0)).toBe(0)
  })
})
