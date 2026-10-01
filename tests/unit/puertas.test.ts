import { describe, expect, it } from "vitest"
import { claveIdempotencia, hashPuerta1, hashTexto } from "@/lib/dominio/puertas"

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
