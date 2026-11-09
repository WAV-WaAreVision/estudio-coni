// @vitest-environment node
import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { contarPropuestasParaInicio } from "@/lib/datos/fusiones"
import type { Database } from "@/lib/supabase/database.types"
import { servidor } from "../msw"

const BASE = "http://127.0.0.1:9"
afterEach(() => vi.restoreAllMocks())

describe("contarPropuestasParaInicio", () => {
  it("counts 0 and logs the failure when the merges cannot be read, so Inicio still opens", async () => {
    servidor.use(http.all(`${BASE}/*`, () => HttpResponse.json({ message: "caída" }, { status: 500 })))
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await contarPropuestasParaInicio(createClient<Database>(BASE, "clave-de-prueba"))).toBe(0)
    expect(registro).toHaveBeenCalledWith("No pude contar las fusiones por decidir para Inicio", expect.any(Error))
  })
})
