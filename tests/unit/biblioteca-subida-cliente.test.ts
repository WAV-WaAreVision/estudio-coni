import { describe, expect, it, vi } from "vitest"
import { subirArchivos } from "@/app/(app)/biblioteca/subir/subida-cliente"

const archivo = (nombre: string, tipo: string) => new File(["contenido"], nombre, { type: tipo })

describe("subirArchivos", () => {
  it("puts each file straight to its URL with the content type that was signed, in order", async () => {
    const enviar = vi.fn(async (..._: unknown[]) => new Response(null, { status: 200 }))
    const avances: [number, number][] = []

    await subirArchivos({
      subidas: [
        { orden: 1, url: "https://r2.test/a", tipoContenido: "image/jpeg" },
        { orden: 2, url: "https://r2.test/b", tipoContenido: "image/png" },
      ],
      archivos: [archivo("a.jpg", "image/jpeg"), archivo("b.png", "")],
      enviar,
      alAvanzar: (hechos, total) => avances.push([hechos, total]),
    })

    expect(enviar).toHaveBeenNthCalledWith(1, "https://r2.test/a", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: expect.any(File),
    })
    expect(enviar).toHaveBeenNthCalledWith(
      2,
      "https://r2.test/b",
      expect.objectContaining({ headers: { "Content-Type": "image/png" } }),
    )
    expect(avances).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ])
  })

  it("says which file failed when the store answers with an error, and stops there", async () => {
    const enviar = vi.fn(async (..._: unknown[]) => new Response(null, { status: 403 }))
    await expect(
      subirArchivos({
        subidas: [
          { orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" },
          { orden: 2, url: "https://r2.test/b", tipoContenido: "application/pdf" },
        ],
        archivos: [archivo("tesis.pdf", "application/pdf"), archivo("otra.pdf", "application/pdf")],
        enviar,
      }),
    ).rejects.toThrow("No pude subir tesis.pdf. Revisa tu conexión e inténtalo de nuevo.")
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it("says the same when the network drops", async () => {
    const enviar = vi.fn(async (..._: unknown[]): Promise<Response> => {
      throw new TypeError("Failed to fetch")
    })
    await expect(
      subirArchivos({
        subidas: [{ orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" }],
        archivos: [archivo("tesis.pdf", "application/pdf")],
        enviar,
      }),
    ).rejects.toThrow("No pude subir tesis.pdf. Revisa tu conexión e inténtalo de nuevo.")
  })

  it("pairs each file with its URL by its order, not by where the signed upload sits", async () => {
    const enviar = vi.fn(async (..._: unknown[]) => new Response(null, { status: 200 }))
    await subirArchivos({
      subidas: [
        { orden: 2, url: "https://r2.test/b", tipoContenido: "image/png" },
        { orden: 1, url: "https://r2.test/a", tipoContenido: "image/jpeg" },
      ],
      archivos: [archivo("a.jpg", "image/jpeg"), archivo("b.png", "image/png")],
      enviar,
    })
    const enviados = enviar.mock.calls.map(([url, pedido]) => [url, ((pedido as RequestInit).body as File).name])
    expect(enviados).toEqual([
      ["https://r2.test/b", "b.png"],
      ["https://r2.test/a", "a.jpg"],
    ])
  })

  it.each([
    ["a signed upload has no file", [{ orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" }], []],
    [
      "a file has no signed upload",
      [{ orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" }],
      [archivo("a.pdf", "application/pdf"), archivo("b.pdf", "application/pdf")],
    ],
    [
      "two signed uploads share an order",
      [
        { orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" },
        { orden: 1, url: "https://r2.test/b", tipoContenido: "application/pdf" },
      ],
      [archivo("a.pdf", "application/pdf"), archivo("b.pdf", "application/pdf")],
    ],
    [
      "an order points past the files",
      [{ orden: 2, url: "https://r2.test/a", tipoContenido: "application/pdf" }],
      [archivo("a.pdf", "application/pdf")],
    ],
  ])("sends nothing and says it in plain words when %s", async (_caso, subidas, archivos) => {
    const enviar = vi.fn()
    await expect(subirArchivos({ subidas, archivos, enviar })).rejects.toThrow(
      "No pude subir tus archivos. Inténtalo de nuevo.",
    )
    expect(enviar).not.toHaveBeenCalled()
  })
})
