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

  it("dice sin detalle cuando el cuerpo trae solo espacios", () => {
    expect(mensajeErrorHeygen("   ")).toBe("sin detalle")
    expect(mensajeErrorHeygen("\n")).toBe("sin detalle")
  })

  it("dice sin detalle cuando error no trae mensaje ni pista", () => {
    expect(mensajeErrorHeygen('{"error":{}}')).toBe("sin detalle")
    expect(mensajeErrorHeygen('{"error":{"message":"","hint":"  "}}')).toBe("sin detalle")
  })

  it("usa el mensaje cuando el cuerpo es el de la API v3", () => {
    const cuerpo = '{"error":{"code":"insufficient_credit","message":"Not enough credits","doc_url":"https://x"}}'
    expect(mensajeErrorHeygen(cuerpo)).toBe("Not enough credits")
  })

  it("usa la pista cuando el mensaje no es texto", () => {
    expect(mensajeErrorHeygen('{"error":{"message":5,"hint":"h"}}')).toBe("h")
  })

  it("devuelve el cuerpo cuando el JSON no trae error", () => {
    expect(mensajeErrorHeygen('{"detail":"x"}')).toBe('{"detail":"x"}')
    expect(mensajeErrorHeygen("[1]")).toBe("[1]")
    expect(mensajeErrorHeygen("null")).toBe("null")
    expect(mensajeErrorHeygen('{"error":[]}')).toBe('{"error":[]}')
  })

  it("recorta a 400 caracteres cuando el cuerpo no es JSON", () => {
    const resultado = mensajeErrorHeygen(`<html>${"x".repeat(1000)}`)
    expect(resultado).toHaveLength(400)
    expect(resultado.startsWith("<html>")).toBe(true)
  })

  it("recorta a 400 caracteres cuando el mensaje de error es enorme", () => {
    const cuerpo = JSON.stringify({ error: { message: "y".repeat(1000), hint: "h" } })
    expect(mensajeErrorHeygen(cuerpo)).toHaveLength(400)
  })
})
