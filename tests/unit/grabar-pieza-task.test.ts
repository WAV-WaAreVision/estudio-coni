// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CONFIGURACION_GRABAR, grabarPiezaTask } from "../../trigger/grabar-pieza"
import config from "../../trigger.config"

describe("grabarPiezaTask", () => {
  it("loads with the id the rest of the system triggers", () => {
    expect(grabarPiezaTask.id).toBe("grabar-pieza")
  })

  it("runs on a medium-1x machine or larger, one run at a time (design P1)", () => {
    expect(CONFIGURACION_GRABAR.machine).toBe("medium-1x")
    expect(CONFIGURACION_GRABAR.queue).toEqual({ concurrencyLimit: 1 })
  })
})

describe("trigger.config.ts", () => {
  it("adds ffmpeg, the subtitle fonts and a pg_dump as new as the database to the container", () => {
    const extensiones = (config.build?.extensions ?? []).map((extension) => extension.name)
    expect(extensiones).toEqual(["ffmpeg", "additionalFiles", "postgresql-client-17"])
  })

  it("makes process.cwd() the build folder in dev as in production, where the fonts are found", () => {
    expect(config.legacyDevProcessCwdBehaviour).toBe(false)
  })
})
