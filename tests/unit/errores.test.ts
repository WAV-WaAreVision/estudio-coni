import { describe, expect, it } from "vitest"
import { mensajeErrorHeygen } from "@/lib/proveedores/errores"

describe("mensajeErrorHeygen", () => {
  it("une mensaje y pista cuando el cuerpo es JSON", () => {
    const cuerpo = JSON.stringify({ error: { message: "Sin créditos", hint: "Recarga en HeyGen" } })
    expect(mensajeErrorHeygen(cuerpo)).toBe("Sin créditos · Recarga en HeyGen")
  })

  it("devuelve el texto tal cual cuando el cuerpo no es JSON", () => {
    expect(mensajeErrorHeygen("command not found")).toBe("command not found")
  })

  it("dice sin detalle cuando el cuerpo viene vacío", () => {
    expect(mensajeErrorHeygen("")).toBe("sin detalle")
  })
})
