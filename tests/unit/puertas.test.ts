import { describe, expect, it } from "vitest"
import { type Pieza, piezaNueva } from "@/lib/dominio/estados"
import { claveIdempotencia, hashPuerta1, hashTexto, puedeGrabar, puedePublicar } from "@/lib/dominio/puertas"

describe("hashes de las puertas", () => {
  const base = { guion: "Soy Coni del Rosario.", audioId: "audio_1" }

  it("da el mismo hash cuando el guion y el audio no cambian", () => {
    expect(hashPuerta1(base)).toBe(hashPuerta1({ ...base }))
    expect(hashPuerta1(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("cambia el hash de la puerta 1 cuando cambia el guion o el audio", () => {
    expect(hashPuerta1({ ...base, guion: "Soy Coni." })).not.toBe(hashPuerta1(base))
    expect(hashPuerta1({ ...base, audioId: "audio_2" })).not.toBe(hashPuerta1(base))
  })

  it("no confunde campos cuando un separador aparece dentro del texto", () => {
    expect(hashPuerta1({ guion: "a|b", audioId: "c" })).not.toBe(hashPuerta1({ guion: "a", audioId: "b|c" }))
  })

  it("separa el hash del texto de publicación del hash del guion", () => {
    expect(hashTexto("Soy Coni del Rosario.")).not.toBe(hashPuerta1(base))
    expect(hashTexto("Hola")).not.toBe(hashTexto("Hola."))
  })
})

describe("claveIdempotencia", () => {
  const clave = { piezaId: "pieza_1", paso: "grabar" as const, hash: "a".repeat(64), intento: 0 }

  it("repite la clave cuando es el mismo intento, para que un reintento ciego no cobre dos veces", () => {
    expect(claveIdempotencia(clave)).toBe("pieza_1:grabar:aaaaaaaaaaaaaaaa:0")
    expect(claveIdempotencia({ ...clave })).toBe(claveIdempotencia(clave))
  })

  it("cambia la clave cuando sube el intento o cambia el artefacto", () => {
    expect(claveIdempotencia({ ...clave, intento: 1 })).not.toBe(claveIdempotencia(clave))
    expect(claveIdempotencia({ ...clave, hash: "b".repeat(64) })).not.toBe(claveIdempotencia(clave))
  })

  it("falla cuando el intento no es un entero no negativo", () => {
    expect(() => claveIdempotencia({ ...clave, intento: Number.NaN })).toThrow("Intento inválido")
    expect(() => claveIdempotencia({ ...clave, intento: -1 })).toThrow("Intento inválido")
    expect(() => claveIdempotencia({ ...clave, intento: 1.5 })).toThrow("Intento inválido")
  })

  it("falla cuando el hash no es un sha-256", () => {
    expect(() => claveIdempotencia({ ...clave, hash: "abc" })).toThrow("SHA-256")
    expect(() => claveIdempotencia({ ...clave, hash: "A".repeat(64) })).toThrow("SHA-256")
  })
})

const HORA = "2026-10-08T22:00:00.000Z"
const APROBADA = "2026-10-06T15:00:00.000Z"

function pieza(cambios: Partial<Pieza>): Pieza {
  return { ...piezaNueva(), ...cambios }
}

describe("puedeGrabar", () => {
  const enRender = pieza({ estado: "en_render", audioId: "audio_1", puerta1: { hash: "h1", en: APROBADA } })

  it("deja grabar cuando lo actual es lo que coni aprobó", () => {
    expect(puedeGrabar(enRender, "h1")).toEqual({ ok: true })
  })

  it("no deja grabar cuando no hay aprobación", () => {
    expect(puedeGrabar({ ...enRender, puerta1: null }, "h1")).toEqual({ ok: false, motivo: "sin_aprobacion" })
  })

  it("no deja grabar cuando el guion o la voz cambiaron después de aprobar", () => {
    expect(puedeGrabar(enRender, "h2")).toEqual({ ok: false, motivo: "artefacto_cambio" })
  })

  it("no deja grabar cuando la pieza no está en render", () => {
    expect(puedeGrabar({ ...enRender, estado: "guion_por_aprobar" }, "h1")).toEqual({ ok: false, motivo: "estado" })
  })
})

describe("puedePublicar", () => {
  const programada = pieza({
    estado: "programado",
    videoId: "video_1",
    puerta2: { videoId: "video_1", hashTexto: "t1", publicarEn: HORA, en: APROBADA },
  })
  const actual = (ahora: string, hashTexto = "t1") => ({ ahora, hashTexto })

  it("deja publicar desde la hora aprobada hasta 30 minutos después", () => {
    expect(puedePublicar(programada, actual(HORA))).toEqual({ ok: true })
    expect(puedePublicar(programada, actual("2026-10-08T22:30:00.000Z"))).toEqual({ ok: true })
  })

  it("no publica antes de la hora aprobada", () => {
    expect(puedePublicar(programada, actual("2026-10-08T21:59:00.000Z"))).toEqual({
      ok: false,
      motivo: "antes_de_hora",
    })
  })

  it("no publica cuando la hora aprobada venció hace más de 30 minutos", () => {
    expect(puedePublicar(programada, actual("2026-10-08T22:30:01.000Z"))).toEqual({
      ok: false,
      motivo: "hora_vencida",
    })
  })

  it("no publica cuando el texto o el video cambiaron después de aprobar", () => {
    expect(puedePublicar(programada, actual(HORA, "t2"))).toEqual({ ok: false, motivo: "artefacto_cambio" })
    expect(puedePublicar({ ...programada, videoId: "video_2" }, actual(HORA))).toEqual({
      ok: false,
      motivo: "artefacto_cambio",
    })
  })

  it("no publica cuando la pieza no está programada o no tiene puerta 2", () => {
    expect(puedePublicar({ ...programada, estado: "video_por_aprobar" }, actual(HORA))).toEqual({
      ok: false,
      motivo: "estado",
    })
    expect(puedePublicar({ ...programada, puerta2: null }, actual(HORA))).toEqual({
      ok: false,
      motivo: "sin_aprobacion",
    })
  })

  it("no publica cuando la hora no se puede leer", () => {
    expect(puedePublicar(programada, actual("no es una fecha"))).toEqual({ ok: false, motivo: "hora_vencida" })
    const ilegible = { ...programada, puerta2: programada.puerta2 && { ...programada.puerta2, publicarEn: "pronto" } }
    expect(puedePublicar(ilegible, actual(HORA))).toEqual({ ok: false, motivo: "hora_vencida" })
  })
})
