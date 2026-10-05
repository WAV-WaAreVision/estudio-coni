import { describe, expect, it } from "vitest"
import { etiquetaDeAlerta } from "@/lib/dominio/revision"

describe("etiquetaDeAlerta", () => {
  it("writes an alert type as a sentence-case label", () => {
    expect(etiquetaDeAlerta("verificar dato")).toBe("Verificar dato")
    expect(etiquetaDeAlerta("líneas de ayuda")).toBe("Líneas de ayuda")
  })
})
