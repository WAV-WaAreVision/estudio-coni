// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CONFIGURACION_VOZ } from "../../trigger/grabar-voz"

describe("grabar-voz", () => {
  it("is a small machine with its own queue, apart from the renders", () => {
    expect(CONFIGURACION_VOZ).toEqual({
      id: "grabar-voz",
      machine: "small-1x",
      maxDuration: 600,
      queue: { concurrencyLimit: 1 },
    })
  })
})
