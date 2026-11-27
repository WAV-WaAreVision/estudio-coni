// @vitest-environment node
import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { contarEtiquetasParaInicio, leerRevisionDeEtiquetas } from "@/lib/datos/lote-de-etiquetas"
import type { Database } from "@/lib/supabase/database.types"
import { servidor } from "../msw"

const BASE = "http://127.0.0.1:9"
afterEach(() => vi.restoreAllMocks())

const caida = () => servidor.use(http.all(`${BASE}/*`, () => HttpResponse.json({ message: "caída" }, { status: 500 })))

describe("contarEtiquetasParaInicio", () => {
  it("counts 0 and logs the failure when the batch cannot be read, so Inicio still opens", async () => {
    caida()
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await contarEtiquetasParaInicio(createClient<Database>(BASE, "clave-de-prueba"))).toBe(0)
    expect(registro).toHaveBeenCalledWith("No pude contar las etiquetas para revisar para Inicio", expect.any(Error))
  })
})

describe("leerRevisionDeEtiquetas", () => {
  it("says it failed and logs why, so the page can say it in her words", async () => {
    caida()
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await leerRevisionDeEtiquetas(createClient<Database>(BASE, "clave-de-prueba"))).toEqual({ estado: "error" })
    expect(registro).toHaveBeenCalledWith("No pude cargar las etiquetas para revisar", expect.any(Error))
  })
})
