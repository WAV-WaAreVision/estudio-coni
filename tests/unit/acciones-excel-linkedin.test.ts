// @vitest-environment node
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { importarExcelDeLinkedin } from "@/lib/acciones/excel-linkedin"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"
import { ERROR_MUY_GRANDE, ERROR_NO_ES_EL_EXCEL } from "@/lib/metricas/excel-linkedin/resumen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { EXCEL_DE_PRUEBA } from "../fixtures/excel-linkedin"
import { servidor } from "../msw"

const BASE = "http://127.0.0.1:9"

function deps() {
  const avisos = notificadorEnMemoria()
  return {
    avisos,
    deps: {
      db: createClient<Database>(BASE, "clave-de-prueba"),
      ahora: () => "2026-11-09T15:00:00.000Z",
      avisos: () => avisos,
    },
  }
}

describe("importarExcelDeLinkedin", () => {
  it("refuses a file over 2 MB before reading it", async () => {
    const { deps: d, avisos } = deps()
    const resultado = await importarExcelDeLinkedin(d, new Blob([new Uint8Array(2_000_001)]))
    expect(resultado).toEqual({ ok: false, error: ERROR_MUY_GRANDE })
    expect(avisos.aWavEnviados).toEqual([])
  })

  it("says it is not LinkedIn's Excel in Spanish and saves nothing", async () => {
    const { deps: d } = deps()
    expect(await importarExcelDeLinkedin(d, new Blob(["hola"]))).toEqual({ ok: false, error: ERROR_NO_ES_EL_EXCEL })
  })

  it("asks her to retry and tells WAV through the screen error notice when the save fails", async () => {
    servidor.use(http.all(`${BASE}/*`, () => HttpResponse.json({ message: "caída" }, { status: 500 })))
    const { deps: d, avisos } = deps()

    const resultado = await importarExcelDeLinkedin(d, new Blob([new Uint8Array(readFileSync(EXCEL_DE_PRUEBA))]))

    expect(resultado).toEqual({ ok: false, error: ERROR_GENERICO })
    expect(avisos.aWavEnviados).toEqual([
      {
        asunto: "Coni vio una pantalla de error",
        detalle: expect.stringContaining("Pantalla: Importar Excel de LinkedIn"),
        idempotencia: "pantalla:Importar Excel de LinkedIn:2026-11-09",
      },
    ])
  })
})
