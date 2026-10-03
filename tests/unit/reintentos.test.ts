import { describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { decisionDeReintento } from "@/lib/produccion/reintentos"
import { RechazoDeClaude, RespuestaCortada } from "@/lib/proveedores/anthropic"

describe("decisionDeReintento", () => {
  it("skips the retries of a configuration problem", () => {
    expect(decisionDeReintento(new FallaDeConfiguracion("Falta la llave"))).toEqual({ skipRetrying: true })
  })

  it("skips the retries when Claude refused, because asking again gets the same answer", () => {
    expect(decisionDeReintento(new RechazoDeClaude())).toEqual({ skipRetrying: true })
  })

  it("skips the retries when Claude's answer was cut at max_tokens", () => {
    expect(decisionDeReintento(new RespuestaCortada())).toEqual({ skipRetrying: true })
  })

  it("keeps the retry policy for a plain error, which may be transient", () => {
    expect(decisionDeReintento(new Error("ElevenLabs respondió HTTP 503"))).toBeUndefined()
  })

  it("keeps the retry policy for an error written for Coni", () => {
    expect(decisionDeReintento(new Falla("Esta pieza cambió mientras la mirabas."))).toBeUndefined()
  })

  it("keeps the retry policy for something that is not an error", () => {
    expect(decisionDeReintento("boom")).toBeUndefined()
    expect(decisionDeReintento(undefined)).toBeUndefined()
  })
})
