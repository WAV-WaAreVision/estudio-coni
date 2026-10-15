// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CONFIGURACION_PRODUCIR, producirPiezaTask } from "../../trigger/producir-pieza"

describe("producirPiezaTask", () => {
  it("loads with the id the rest of the system triggers", () => {
    expect(producirPiezaTask.id).toBe("producir-pieza")
  })

  it("has time for Claude's worst case and her voice of the draft, one run at a time", () => {
    expect(CONFIGURACION_PRODUCIR).toEqual({ id: "producir-pieza", maxDuration: 1200, queue: { concurrencyLimit: 1 } })
  })
})
