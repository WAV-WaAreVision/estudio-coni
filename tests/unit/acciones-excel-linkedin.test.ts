// @vitest-environment node
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import {
  ERROR_MISMO_POST,
  ERROR_PUBLICACION_AJENA,
  ERROR_PUBLICACION_VIEJA,
  ESQUEMA_DE_DUDOSOS,
  guardarDudososDeLinkedin,
  importarExcelDeLinkedin,
} from "@/lib/acciones/excel-linkedin"
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

describe("guardarDudososDeLinkedin", () => {
  it("refuses the same Excel post for two pieces before saving anything", async () => {
    const { deps: d, avisos } = deps()
    const dos = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
    const elegidos = dos.map((piezaId) => ({ piezaId, clave: "share:1", impresiones: 10, interacciones: 1 }))

    const resultado = await guardarDudososDeLinkedin(d, { medidoEn: "2026-10-30", elegidos })

    expect(resultado).toEqual({ ok: false, error: ERROR_MISMO_POST })
    expect(avisos.aWavEnviados).toEqual([])
  })

  describe("against the LinkedIn pieces she has", () => {
    const SUYA = "33333333-3333-4333-8333-333333333333"
    const AJENA = "44444444-4444-4444-8444-444444444444"

    function conPublicaciones() {
      const guardados: unknown[] = []
      servidor.use(
        http.get(`${BASE}/rest/v1/ajustes`, () => HttpResponse.json([])),
        http.get(`${BASE}/rest/v1/publicaciones`, () =>
          HttpResponse.json([
            {
              pieza_id: SUYA,
              post_urn: null,
              marcado_en: "2026-10-07T15:00:00Z",
              piezas: { titulo: "Suya", puerta2_publicar_en: null },
            },
          ]),
        ),
        http.post(`${BASE}/rest/v1/rpc/importar_excel_linkedin`, async ({ request }) => {
          guardados.push(await request.json())
          return HttpResponse.json(1)
        }),
      )
      return guardados
    }
    const elegir = (piezaId: string) => [{ piezaId, clave: "share:1", impresiones: 10, interacciones: 1 }]

    it("refuses a piece that is not one of her LinkedIn pieces and saves nothing", async () => {
      const guardados = conPublicaciones()
      const { deps: d } = deps()

      const resultado = await guardarDudososDeLinkedin(d, { medidoEn: "2026-10-30", elegidos: elegir(AJENA) })

      expect(resultado).toEqual({ ok: false, error: ERROR_PUBLICACION_AJENA })
      expect(guardados).toEqual([])
    })

    it("refuses a day older than the last four weeks and saves nothing", async () => {
      const guardados = conPublicaciones()
      const { deps: d } = deps()

      const resultado = await guardarDudososDeLinkedin(d, { medidoEn: "2026-10-11", elegidos: elegir(SUYA) })

      expect(resultado).toEqual({ ok: false, error: ERROR_PUBLICACION_VIEJA })
      expect(guardados).toEqual([])
    })

    it("saves her own piece on a day inside the last four weeks", async () => {
      const guardados = conPublicaciones()
      const { deps: d } = deps()

      const resultado = await guardarDudososDeLinkedin(d, { medidoEn: "2026-10-12", elegidos: elegir(SUYA) })

      expect(resultado.ok).toBe(true)
      expect(guardados).toHaveLength(1)
    })
  })
})

describe("ESQUEMA_DE_DUDOSOS", () => {
  const elegido = (piezaId: string, clave: string) => ({ piezaId, clave, impresiones: 2300, interacciones: 40 })
  const A = "11111111-1111-4111-8111-111111111111"
  const B = "22222222-2222-4222-8222-222222222222"

  it("accepts one pick per piece and per Excel post", () => {
    expect(ESQUEMA_DE_DUDOSOS.safeParse({ medidoEn: "2026-10-30", elegidos: [elegido(A, "ugcPost:1")] }).success).toBe(
      true,
    )
  })

  it("refuses one Excel post for two pieces, a piece twice, or nothing picked", () => {
    const mismoPost = { medidoEn: "2026-10-30", elegidos: [elegido(A, "share:1"), elegido(B, "share:1")] }
    const mismaPieza = { medidoEn: "2026-10-30", elegidos: [elegido(A, "share:1"), elegido(A, "share:2")] }
    expect(ESQUEMA_DE_DUDOSOS.safeParse(mismoPost).success).toBe(false)
    expect(ESQUEMA_DE_DUDOSOS.safeParse(mismaPieza).success).toBe(false)
    expect(ESQUEMA_DE_DUDOSOS.safeParse({ medidoEn: "2026-10-30", elegidos: [] }).success).toBe(false)
  })
})
