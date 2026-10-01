// @vitest-environment node
import { describe, expect, it } from "vitest"
import { irA } from "@/lib/sesion/redireccion"

describe("irA", () => {
  it("answers with a relative Location so the browser keeps the host it is on", () => {
    const respuesta = irA("/ajustes?instagram=conectada")

    expect(respuesta.status).toBe(307)
    expect(respuesta.headers.get("location")).toBe("/ajustes?instagram=conectada")
  })
})
