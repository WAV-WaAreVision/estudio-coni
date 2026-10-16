// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CONFIGURACION_GRABAR, ENTRADA_DE_GRABAR, grabarPiezaTask } from "../../trigger/grabar-pieza"
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

describe("la entrada de grabar-pieza", () => {
  const piezaId = "11111111-2222-4333-8444-555555555555"

  it("carries the attempt the run was started for", () => {
    expect(ENTRADA_DE_GRABAR.parse({ piezaId, intento: 3 })).toEqual({ piezaId, intento: 3 })
  })

  it("still accepts the payload of a run queued by the app deployed before the attempt was sent", () => {
    expect(ENTRADA_DE_GRABAR.parse({ piezaId })).toEqual({ piezaId })
  })

  it("refuses an attempt that is not a whole non-negative number", () => {
    expect(ENTRADA_DE_GRABAR.safeParse({ piezaId, intento: -1 }).success).toBe(false)
    expect(ENTRADA_DE_GRABAR.safeParse({ piezaId, intento: 1.5 }).success).toBe(false)
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
