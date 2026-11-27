// @vitest-environment node
import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { contarEtiquetasParaInicio, leerRevisionDeEtiquetas } from "@/lib/datos/lote-de-etiquetas"
import type { Database } from "@/lib/supabase/database.types"
import { servidor } from "../msw"

const BASE = "http://127.0.0.1:9"
afterEach(() => vi.restoreAllMocks())

// Every list the catalog needs, empty: enough for the read to get past it.
const LISTAS_VIGENTES = [
  ["tipo", "todas"],
  ["evidencia", "todas"],
  ["publico", "linkedin"],
  ["publico", "instagram"],
  ["dolor", "linkedin"],
  ["dolor", "instagram"],
  ["emocion", "todas"],
  ["gancho", "todas"],
].map(([lista, red], i) => ({ id: i + 1, lista, red, valores: [] }))

const caida = () => servidor.use(http.all(`${BASE}/*`, () => HttpResponse.json({ message: "caída" }, { status: 500 })))

describe("contarEtiquetasParaInicio", () => {
  it("counts 0 and logs the failure when the batch cannot be read, so Inicio still opens", async () => {
    caida()
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await contarEtiquetasParaInicio(createClient<Database>(BASE, "clave-de-prueba"))).toBe(0)
    expect(registro).toHaveBeenCalledWith("No pude contar las etiquetas para revisar para Inicio", expect.any(Error))
  })

  it("counts the pending cards the page draws: a pending item whose claim is gone is not counted", async () => {
    servidor.use(
      http.post(`${BASE}/rest/v1/rpc/lote_de_la_semana`, () =>
        HttpResponse.json([
          {
            posicion: 1,
            afirmacion_id: "00000000-0000-4000-8000-000000000001",
            campo: "tipo",
            red: "todas",
            marca_id: null,
            motivo: "sin_clasificar",
            hecha: false,
          },
        ]),
      ),
      http.get(`${BASE}/rest/v1/versiones_de_vocabulario`, () => HttpResponse.json(LISTAS_VIGENTES)),
      http.get(`${BASE}/rest/v1/afirmaciones`, () => HttpResponse.json([])),
    )
    const registro = vi.spyOn(console, "error")
    expect(await contarEtiquetasParaInicio(createClient<Database>(BASE, "clave-de-prueba"))).toBe(0)
    expect(registro).not.toHaveBeenCalled()
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
