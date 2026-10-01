import { describe, expect, it } from "vitest"
import { decidirRuta } from "@/lib/sesion/rutas"

describe("decidirRuta", () => {
  it("sends someone without a session to sign in", () => {
    expect(decidirRuta({ ruta: "/", haySesion: false })).toBe("a_ingreso")
    expect(decidirRuta({ ruta: "/guion/abc", haySesion: false })).toBe("a_ingreso")
  })

  it("lets the sign-in page through without a session", () => {
    expect(decidirRuta({ ruta: "/ingreso", haySesion: false })).toBe("seguir")
  })

  it("sends someone who is already in away from the sign-in page", () => {
    expect(decidirRuta({ ruta: "/ingreso", haySesion: true })).toBe("a_inicio")
  })

  it("lets a session through everywhere else", () => {
    expect(decidirRuta({ ruta: "/video/abc", haySesion: true })).toBe("seguir")
  })
})
