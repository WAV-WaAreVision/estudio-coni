// @vitest-environment node
import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { contarLinkedinSinNumeros } from "@/lib/datos/metricas-linkedin"
import type { Database } from "@/lib/supabase/database.types"
import { servidor } from "../msw"

const BASE = "http://127.0.0.1:9"

afterEach(() => vi.restoreAllMocks())

describe("contarLinkedinSinNumeros", () => {
  it("counts 0 and logs the failure when LinkedIn's data cannot be read, so Inicio still opens", async () => {
    servidor.use(http.all(`${BASE}/*`, () => HttpResponse.json({ message: "caída" }, { status: 500 })))
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})

    const cuenta = await contarLinkedinSinNumeros(createClient<Database>(BASE, "clave-de-prueba"), Date.now())

    expect(cuenta).toBe(0)
    expect(registro).toHaveBeenCalledWith("No pude leer los recordatorios de LinkedIn para Inicio", expect.any(Error))
  })
})
