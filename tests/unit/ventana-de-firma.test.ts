import { describe, expect, it } from "vitest"
import { avisoAlVolver, ventanaDeDeshacer } from "@/app/(app)/guion/[id]/ventana-de-firma"

const FIRMA = "2026-10-15T12:00:00.000Z"
const enRender = { estado: "en_render" as const, explicacion: null, version: 7, firmaEn: FIRMA }

describe("ventanaDeDeshacer", () => {
  it("leaves the time left of a fresh signature on a render without a reason", () => {
    expect(ventanaDeDeshacer(enRender, undefined, "2026-10-15T12:00:03.000Z")).toEqual({ quedanMs: 5000, version: 7 })
  })

  it("closes once the window is over", () => {
    expect(ventanaDeDeshacer(enRender, undefined, "2026-10-15T12:00:09.000Z").quedanMs).toBe(0)
  })

  it("offers no undo while the render is stopped with a reason, nor once it is subtitling", () => {
    const ahora = "2026-10-15T12:00:01.000Z"
    expect(ventanaDeDeshacer({ ...enRender, explicacion: "Tope del mes" }, undefined, ahora).quedanMs).toBe(0)
    expect(ventanaDeDeshacer({ ...enRender, estado: "subtitulando" }, undefined, ahora).quedanMs).toBe(0)
  })

  it("offers no undo without a signature", () => {
    expect(ventanaDeDeshacer({ ...enRender, firmaEn: null }, undefined, "2026-10-15T12:00:01.000Z").quedanMs).toBe(0)
  })

  it("undoes the version she signed at, and the row's when the address carries none or a wrong one", () => {
    const ahora = "2026-10-15T12:00:01.000Z"
    expect(ventanaDeDeshacer(enRender, "6", ahora).version).toBe(6)
    for (const firmada of [undefined, "", "abc", "0", "-3", "6.5"]) {
      expect(ventanaDeDeshacer(enRender, firmada, ahora).version).toBe(7)
    }
  })
})

describe("avisoAlVolver", () => {
  it("says the undo only on a script back at gate 1", () => {
    expect(avisoAlVolver("1", "guion_por_aprobar")).toBe("Listo, no grabé nada. Puedes seguir revisando.")
    expect(avisoAlVolver("1", "grabando_voz")).toBeNull()
    expect(avisoAlVolver(undefined, "guion_por_aprobar")).toBeNull()
    expect(avisoAlVolver("si", "guion_por_aprobar")).toBeNull()
  })
})
