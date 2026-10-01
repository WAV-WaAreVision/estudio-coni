// @vitest-environment node
import { describe, expect, it } from "vitest"
import { enSerie } from "@/lib/mantenimiento/ejecutar"

describe("enSerie", () => {
  it("runs every job even when one fails, and raises all the failures at the end", async () => {
    const corridos: string[] = []
    const trabajos = {
      uno: async () => {
        corridos.push("uno")
        throw new Error("falló uno")
      },
      dos: async () => {
        corridos.push("dos")
        return 2
      },
      tres: async () => {
        corridos.push("tres")
        throw new Error("falló tres")
      },
    }

    const error = await enSerie(trabajos).then(
      () => new Error("se esperaba un rechazo"),
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    )

    expect(corridos).toEqual(["uno", "dos", "tres"])
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toContain("uno: falló uno")
    expect(error.message).toContain("tres: falló tres")
  })

  it("returns what each job returned when none fails", async () => {
    expect(await enSerie({ a: async () => 1, b: async () => "x" })).toEqual({ a: 1, b: "x" })
  })
})
