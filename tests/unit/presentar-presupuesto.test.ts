// @vitest-environment node
import { describe, expect, it } from "vitest"
import { filaDePresupuesto, type PresupuestoDelMes, presentarPresupuesto } from "@/lib/presupuesto/presentar"

const BASE: PresupuestoDelMes = {
  tope: 40,
  limiteExplicito: null,
  limite: 80,
  reactivado: false,
  usado: 12.8,
  porProveedor: { anthropic: 2.5, elevenlabs: 0.3, heygen: 10, voyage: 0 },
  motor: { activo: true, usd: 1.2 },
  fusiones: { activas: false, usd: 0 },
  avisoSinLeer: false,
  margenUsd: 1.1,
}

describe("presentarPresupuesto", () => {
  it("says the month against the cap, in ink, with the four marks in words", () => {
    const vista = presentarPresupuesto(BASE)
    expect(vista.linea).toBe("Llevas US$ 12,80 de tu tope de US$ 40,00 este mes")
    expect(vista.tono).toBe("tinta")
    expect(vista.escala).toBe(80)
    expect(vista.relleno).toBe(16)
    expect(vista.marcas).toEqual([
      { etiqueta: "50 % del tope", monto: "US$ 20,00", porcentaje: 25 },
      { etiqueta: "80 % del tope", monto: "US$ 32,00", porcentaje: 40 },
      { etiqueta: "Tope", monto: "US$ 40,00", porcentaje: 50 },
      { etiqueta: "Límite", monto: "US$ 80,00", porcentaje: 100 },
    ])
    expect(vista.pasado).toBeNull()
    expect(vista.etiquetaDelLimite).toBe("US$ 80 (el doble del tope)")
    expect(vista.enElLimite).toBe(false)
  })

  it("warns from 80 percent of the cap", () => {
    expect(presentarPresupuesto({ ...BASE, usado: 32 }).tono).toBe("aviso")
  })

  it("says the app goes on past the cap, up to the limit", () => {
    const vista = presentarPresupuesto({ ...BASE, usado: 45 })
    expect(vista.tono).toBe("pasado")
    expect(vista.pasado).toBe("Pasaste tu tope. La app sigue hasta tu límite de US$ 80,00.")
  })

  it("is at the limit when not even one more script fits, and proposes the limit plus the cap", () => {
    const vista = presentarPresupuesto({ ...BASE, usado: 79 })
    expect(vista.enElLimite).toBe(true)
    expect(vista.textoEnElLimite).toBe(
      "Llegaste a tu límite de US$ 80,00. Lo nuevo quedó en pausa; lo que ya firmaste sigue.",
    )
    expect(vista.propuestaDeReactivar).toBe(120)
  })

  it("is at the limit while the month's limit notice is unread", () => {
    expect(presentarPresupuesto({ ...BASE, usado: 50, avisoSinLeer: true }).enElLimite).toBe(true)
  })

  it("names her own limit without the default's words, and a reactivated month", () => {
    expect(presentarPresupuesto({ ...BASE, limiteExplicito: 100, limite: 100 }).etiquetaDelLimite).toBe("US$ 100")
    expect(presentarPresupuesto({ ...BASE, reactivado: true, limite: 130 }).reactivado).toBe(
      "Este mes tu límite es US$ 130,00 porque lo reactivaste.",
    )
    expect(presentarPresupuesto(BASE).reactivado).toBeNull()
  })

  it("stretches the bar to what was spent when it passed the limit", () => {
    const vista = presentarPresupuesto({ ...BASE, usado: 90 })
    expect(vista.escala).toBe(90)
    expect(vista.relleno).toBe(100)
  })

  it("lists every provider, in a fixed order, even at zero", () => {
    expect(presentarPresupuesto(BASE).porProveedor).toEqual([
      { nombre: "Claude", monto: "US$ 2,50" },
      { nombre: "ElevenLabs", monto: "US$ 0,30" },
      { nombre: "HeyGen", monto: "US$ 10,00" },
      { nombre: "Voyage", monto: "US$ 0,00" },
    ])
  })
})

describe("filaDePresupuesto", () => {
  it("is the short line of the Ajustes row, in whole dollars", () => {
    expect(filaDePresupuesto(31.6, 40)).toBe("Presupuesto · US$ 32 de 40")
  })
})
