// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { leerHojas } from "@/lib/metricas/excel-linkedin/archivo"
import { leerExcelDeLinkedin } from "@/lib/metricas/excel-linkedin/leer"
import { EXCEL_DE_PRUEBA, POST_AJENO, POST_COMPARTIDO, POST_UGC } from "../fixtures/excel-linkedin"

describe("leerHojas", () => {
  it("reads the synthetic export end to end, blank cells as empty text", async () => {
    const leidas = await leerHojas(new Blob([new Uint8Array(readFileSync(EXCEL_DE_PRUEBA))]))
    if (!leidas.ok) throw new Error(leidas.error)
    expect(leidas.hojas.get("PUBLICACIONES PRINCIPALES")?.[1]?.every((texto) => texto === "")).toBe(true)

    const lectura = leerExcelDeLinkedin(leidas.hojas)
    if (!lectura.ok) throw new Error(lectura.error)
    expect(lectura.excel).toEqual({
      periodo: { desde: "2026-10-01", hasta: "2026-10-30" },
      publicaciones: [
        { tipo: "ugcPost", numero: POST_UGC, fecha: "2026-10-07", impresiones: 2300, interacciones: 40 },
        { tipo: "share", numero: POST_COMPARTIDO, fecha: "2026-10-03", impresiones: 1200, interacciones: 12 },
        { tipo: "share", numero: POST_AJENO, fecha: "2026-10-20", impresiones: 300, interacciones: 5 },
      ],
      seguidores: 830,
      llegoAlTope: false,
      sinIdentificar: 0,
    })
  })

  it("answers no_es_el_excel for a file that is not an xlsx", async () => {
    expect(await leerHojas(new Blob(["hola"]))).toEqual({ ok: false, error: "no_es_el_excel" })
  })
})
