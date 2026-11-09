// @vitest-environment node
import { describe, expect, it } from "vitest"
import { COLA_DE_MANTENIMIENTO } from "../../trigger/mantenimiento"
import {
  aplicarModeloDeHuellasTask,
  CONFIGURACION_DEL_MODELO,
  probarModeloDeHuellasTask,
  revertirModeloDeHuellasTask,
} from "../../trigger/modelo-de-huellas"

describe("model tasks", () => {
  it("load with the ids the runbook uses", () => {
    expect(probarModeloDeHuellasTask.id).toBe("probar-modelo-de-huellas")
    expect(aplicarModeloDeHuellasTask.id).toBe("aplicar-modelo-de-huellas")
    expect(revertirModeloDeHuellasTask.id).toBe("revertir-modelo-de-huellas")
  })

  it("share the maintenance queue, so topics never move while a model is tried, applied or reverted", () => {
    expect(CONFIGURACION_DEL_MODELO.queue).toBe(COLA_DE_MANTENIMIENTO)
  })

  it("never retry: a retry would pay again, and Claude re-runs by hand", () => {
    expect(CONFIGURACION_DEL_MODELO.retry).toEqual({ maxAttempts: 1 })
  })
})
