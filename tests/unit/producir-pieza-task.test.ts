// @vitest-environment node
import { describe, expect, it } from "vitest"
import { producirPiezaTask } from "../../trigger/producir-pieza"

describe("producirPiezaTask", () => {
  it("loads with the id the rest of the system triggers", () => {
    expect(producirPiezaTask.id).toBe("producir-pieza")
  })
})
