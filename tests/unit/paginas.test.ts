// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { FILAS_POR_PAGINA, leerTodas } from "@/lib/datos/paginas"

const filas = (desde: number, cantidad: number) =>
  Array.from({ length: cantidad }, (_, i) => ({ id: String(desde + i).padStart(6, "0") }))

describe("leerTodas (keyset by id)", () => {
  it("asks for the first page with no cursor, then after the last id read, and stops on a short page", async () => {
    const pedidos: [string | null, number][] = []
    const leidas = await leerTodas("las pruebas", async (despuesDe, limite) => {
      pedidos.push([despuesDe, limite])
      return { data: despuesDe === null ? filas(0, FILAS_POR_PAGINA) : filas(FILAS_POR_PAGINA, 5), error: null }
    })
    expect(leidas).toHaveLength(FILAS_POR_PAGINA + 5)
    expect(leidas.at(-1)?.id).toBe("001004")
    expect(pedidos).toEqual([
      [null, FILAS_POR_PAGINA],
      ["000999", FILAS_POR_PAGINA],
    ])
  })

  it("asks once more after a full last page and stops on an empty one", async () => {
    let llamadas = 0
    const leidas = await leerTodas("las pruebas", async (despuesDe) => {
      llamadas += 1
      return { data: despuesDe === null ? filas(0, FILAS_POR_PAGINA) : [], error: null }
    })
    expect(leidas).toHaveLength(FILAS_POR_PAGINA)
    expect(llamadas).toBe(2)
  })

  it("says what it could not read", async () => {
    await expect(leerTodas("las pruebas", async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow(
      "No pude leer las pruebas: boom",
    )
  })
})

describe("FILAS_POR_PAGINA", () => {
  it("equals PostgREST's max_rows in supabase/config.toml, or a short page would stop the read early", () => {
    const config = readFileSync(join(__dirname, "..", "..", "supabase", "config.toml"), "utf-8")
    expect(config.match(/^max_rows = (\d+)$/m)?.[1]).toBe(String(FILAS_POR_PAGINA))
  })
})
