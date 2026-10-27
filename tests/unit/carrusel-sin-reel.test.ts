import { describe, expect, it } from "vitest"
import { type Evento, type Pieza, piezaNueva, TransicionInvalida, transicionar } from "@/lib/dominio/estados"
import { puedeEntregarseParaSubir, puedeGrabar, puedeGrabarVoz, puedePublicar } from "@/lib/dominio/puertas"

const AHORA = "2026-10-26T15:00:00.000Z"
const firmado: Pieza = {
  ...piezaNueva("carrusel"),
  estado: "armando_carrusel",
  version: 5,
  puerta1: { hash: "h", en: AHORA },
}

describe("a carousel never reaches the voice, HeyGen or Instagram paths", () => {
  it("is never fit to record, voice, publish or hand over as a reel", () => {
    expect(puedeGrabar(firmado, "h")).toEqual({ ok: false, motivo: "estado" })
    expect(puedeGrabarVoz(firmado, "Un guion")).toEqual({ ok: false, motivo: "estado" })
    expect(puedePublicar(firmado, { hashTexto: "t", ahora: AHORA })).toEqual({ ok: false, motivo: "estado" })
    expect(puedeEntregarseParaSubir(firmado, { hashTexto: "t", ahora: AHORA })).toEqual({ ok: false, motivo: "estado" })
  })

  it("refuses every voice, render and Instagram event in every state it can be in", () => {
    const deReel: Evento[] = [
      { tipo: "pedir_voz" },
      { tipo: "voz_lista", audioId: "voces/x.mp3" },
      { tipo: "aprobar_guion", actor: "coni", hashVisto: "h", hashActual: "h", en: AHORA },
      { tipo: "render_entregado" },
      { tipo: "video_listo", videoId: "videos/x.mp4" },
      { tipo: "regrabar" },
      { tipo: "entregar_para_subir" },
      { tipo: "subido_a_mano", actor: "coni", destino: "instagram", quedanPendientes: false },
      { tipo: "publicado" },
    ]
    for (const estado of [
      "idea",
      "guion_en_proceso",
      "guion_por_aprobar",
      "armando_carrusel",
      "carrusel_por_aprobar",
    ] as const) {
      for (const evento of deReel) {
        expect(() => transicionar({ ...firmado, estado }, evento), `${estado} + ${evento.tipo}`).toThrow(
          TransicionInvalida,
        )
      }
    }
  })
})
