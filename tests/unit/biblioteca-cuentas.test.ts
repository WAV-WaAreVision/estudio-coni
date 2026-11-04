import { describe, expect, it } from "vitest"
import { conCuenta, cuentasDeAutor, cuentasDeTema } from "@/lib/dominio/biblioteca/cuentas"
import { etiquetaDeTipoDeAutor } from "@/lib/dominio/biblioteca/modelo"

describe("counts without zeros (4i)", () => {
  it("adds a count to a quick filter only when there is something to count", () => {
    expect(conCuenta("Sin tratar", 2)).toBe("Sin tratar · 2")
    expect(conCuenta("Sin tratar", 0)).toBe("Sin tratar")
  })

  it.each([
    [{ materiales: 3, ideas: 12 }, "3 materiales · 12 ideas sacadas"],
    [{ materiales: 1, ideas: 1 }, "1 material · 1 idea sacada"],
    [{ materiales: 1, ideas: 0 }, "1 material"],
    [{ materiales: 0, ideas: 0 }, null],
  ])("says what an author gave: %j is %s", (cuentas, texto) => {
    expect(cuentasDeAutor(cuentas)).toBe(texto)
  })

  it.each([
    [{ ideas: 12, autores: 3 }, "12 ideas sacadas · 3 autores"],
    [{ ideas: 1, autores: 1 }, "1 idea sacada · 1 autor"],
    [{ ideas: 0, autores: 0 }, null],
  ])("says what a topic holds: %j is %s", (cuentas, texto) => {
    expect(cuentasDeTema(cuentas)).toBe(texto)
  })
})

describe("etiquetaDeTipoDeAutor", () => {
  it.each([
    ["coni", "Coni"],
    ["persona", "Persona"],
    ["cuenta", "Cuenta de redes"],
    ["institucion", "Institución"],
    ["otra", "otra"],
  ])("says %s as «%s»", (tipo, etiqueta) => {
    expect(etiquetaDeTipoDeAutor(tipo)).toBe(etiqueta)
  })
})
