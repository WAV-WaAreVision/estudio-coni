import { describe, expect, it } from "vitest"
import { FILAS_POR_PAGINA, leerTodas } from "@/lib/datos/paginas"

describe("leerTodas", () => {
  it("reads page after page until a short one, asking for contiguous ranges", async () => {
    const pedidos: [number, number][] = []
    const filas = await leerTodas("las pruebas", async (desde, hasta) => {
      pedidos.push([desde, hasta])
      const cantidad = desde === 0 ? FILAS_POR_PAGINA : 5
      return { data: Array.from({ length: cantidad }, (_, i) => desde + i), error: null }
    })
    expect(filas).toHaveLength(1005)
    expect(filas.at(-1)).toBe(1004)
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it("asks once more after a full last page and stops on an empty one", async () => {
    let llamadas = 0
    const filas = await leerTodas("las pruebas", async (desde) => {
      llamadas += 1
      return { data: desde === 0 ? Array.from({ length: FILAS_POR_PAGINA }, () => 1) : [], error: null }
    })
    expect(filas).toHaveLength(1000)
    expect(llamadas).toBe(2)
  })

  it("says what it could not read", async () => {
    await expect(leerTodas("las pruebas", async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow(
      "No pude leer las pruebas: boom",
    )
  })
})
