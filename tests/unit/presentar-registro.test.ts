// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { RegistroDeDatos } from "@/lib/datos-personales/leer"
import { fraseDeBorrado, paisEnPalabras, presentarRegistro } from "@/lib/datos-personales/presentar"

const ZONA = "America/Santiago"

describe("paisEnPalabras", () => {
  it("adds «por confirmar» until WAV confirms the country", () => {
    expect(paisEnPalabras("Estados Unidos", false)).toBe("Estados Unidos (por confirmar)")
    expect(paisEnPalabras("Estados Unidos", true)).toBe("Estados Unidos")
  })

  it("says «país por confirmar» when the country itself is still unknown", () => {
    expect(paisEnPalabras("Por confirmar", false)).toBe("país por confirmar")
    expect(paisEnPalabras("por confirmar", true)).toBe("país por confirmar")
  })
})

describe("fraseDeBorrado", () => {
  it("says what was deleted and when, in her words", () => {
    expect(
      fraseDeBorrado({ id: "1", regla: "videos_de_piezas", cantidad: 3, borradoEn: "2026-11-02T06:00:00Z" }, ZONA),
    ).toBe("Se borraron 3 archivos de videos y voces el 2 de noviembre.")
    expect(fraseDeBorrado({ id: "2", regla: "respaldos", cantidad: 1, borradoEn: "2026-11-02T06:00:00Z" }, ZONA)).toBe(
      "Se borró 1 respaldo de la base el 2 de noviembre.",
    )
    expect(
      fraseDeBorrado({ id: "3", regla: "huella_de_visitas", cantidad: 5, borradoEn: "2026-11-03T06:00:00Z" }, ZONA),
    ).toBe("Se borraron 5 huellas de visitas el 3 de noviembre.")
  })

  it("still says something for a rule the code no longer has", () => {
    expect(fraseDeBorrado({ id: "4", regla: "reposts", cantidad: 2, borradoEn: "2026-11-02T06:00:00Z" }, ZONA)).toBe(
      "Se borraron 2 elementos de reposts el 2 de noviembre.",
    )
  })
})

describe("presentarRegistro", () => {
  const REGISTRO: RegistroDeDatos = {
    filas: [
      {
        clave: "respaldos",
        dato: "Respaldo nocturno de la base",
        para_que: "Recuperar la app si algo se pierde.",
        proveedor: "Cloudflare R2",
        pais: "Por confirmar",
        pais_confirmado: false,
        plazo: "Se guardan los últimos 90 días.",
        regla_de_borrado: "respaldos",
        plazo_dias: 90,
      },
    ],
    borrados: [{ id: "b1", regla: "respaldos", cantidad: 2, borradoEn: "2026-11-02T06:00:00Z" }],
    ultimaRevision: null,
    vence: "2027-11-15",
    zona: ZONA,
  }

  it("turns each row into a card, flags a mismatch with the code and words the review dates", () => {
    expect(presentarRegistro(REGISTRO)).toEqual({
      tarjetas: [
        {
          clave: "respaldos",
          dato: "Respaldo nocturno de la base",
          paraQue: "Recuperar la app si algo se pierde.",
          donde: "Cloudflare R2, país por confirmar",
          plazo: "Se guardan los últimos 90 días.",
          discrepancia: "No coincide con lo que la app borra (30 días)",
        },
      ],
      borrados: [{ id: "b1", frase: "Se borraron 2 respaldos de la base el 2 de noviembre." }],
      revision: { ultima: null, vence: "15 de noviembre de 2027" },
    })
  })

  it("names the provider and says its country is still to confirm", () => {
    const fila = { ...REGISTRO.filas[0], clave: "metricas", proveedor: "Supabase", pais: "Por confirmar" }
    expect(presentarRegistro({ ...REGISTRO, filas: [fila] }).tarjetas[0].donde).toBe("Supabase, país por confirmar")
  })

  it("words her latest review with its year", () => {
    expect(presentarRegistro({ ...REGISTRO, ultimaRevision: "2026-11-02T15:00:00Z" }).revision.ultima).toBe(
      "2 de noviembre de 2026",
    )
  })
})
