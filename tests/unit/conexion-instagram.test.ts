// @vitest-environment node
import { describe, expect, it } from "vitest"
import { estadoCoincide, leerAppDeMeta, nuevoEstado } from "@/lib/acciones/instagram"

describe("nuevoEstado", () => {
  it("is long, random and different every time", () => {
    const a = nuevoEstado()
    const b = nuevoEstado()

    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe("estadoCoincide", () => {
  it("accepts only the state it handed out", () => {
    const estado = nuevoEstado()

    expect(estadoCoincide(estado, estado)).toBe(true)
    expect(estadoCoincide(estado, nuevoEstado())).toBe(false)
  })

  it("refuses a missing state on either side, and one of another length", () => {
    expect(estadoCoincide(undefined, "abc")).toBe(false)
    expect(estadoCoincide("abc", null)).toBe(false)
    expect(estadoCoincide("", "")).toBe(false)
    expect(estadoCoincide("abc", "abcd")).toBe(false)
  })
})

describe("leerAppDeMeta", () => {
  const completo = {
    META_APP_ID: "123",
    META_APP_SECRET: "secreto",
    META_REDIRECT_URI: "https://estudio.example/api/meta/callback",
  }

  it("reads the Meta app of the environment", () => {
    expect(leerAppDeMeta(completo)).toEqual({
      appId: "123",
      appSecret: "secreto",
      redirectUri: "https://estudio.example/api/meta/callback",
    })
  })

  it("is null while any of the three is missing: the app is not configured yet", () => {
    for (const falta of Object.keys(completo)) {
      expect(leerAppDeMeta({ ...completo, [falta]: "" })).toBeNull()
    }
  })
})
