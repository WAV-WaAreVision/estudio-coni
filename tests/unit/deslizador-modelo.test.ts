import { describe, expect, it } from "vitest"
import {
  ARMADO_MAXIMO_MS,
  apruebaAlSoltar,
  ESPERA_MINIMA_MS,
  esToque,
  progresoDeArrastre,
  respuestaAlToque,
  TOQUE_MAXIMO_PX,
  UMBRAL_DE_APROBACION,
} from "@/lib/diseno/deslizador"

describe("slider model", () => {
  it("follows the finger 1 to 1 over the free travel", () => {
    expect(progresoDeArrastre({ inicioX: 10, actualX: 160, recorrido: 300 })).toBe(50)
  })
  it("clamps to 0 and 100", () => {
    expect(progresoDeArrastre({ inicioX: 100, actualX: 0, recorrido: 300 })).toBe(0)
    expect(progresoDeArrastre({ inicioX: 0, actualX: 999, recorrido: 300 })).toBe(100)
  })
  it("never divides by a zero travel", () => {
    expect(progresoDeArrastre({ inicioX: 0, actualX: 50, recorrido: 0 })).toBe(0)
  })
  it("approves only from 96 percent, on release", () => {
    expect(UMBRAL_DE_APROBACION).toBe(96)
    expect(apruebaAlSoltar(95.9)).toBe(false)
    expect(apruebaAlSoltar(96)).toBe(true)
  })
})

describe("tap model", () => {
  it("counts a pointer that moved 8 px or less as a tap", () => {
    expect(TOQUE_MAXIMO_PX).toBe(8)
    expect(esToque({ dx: 8, dy: 0 })).toBe(true)
    expect(esToque({ dx: 8.1, dy: 0 })).toBe(false)
    expect(esToque({ dx: 6, dy: 6 })).toBe(false)
  })

  it("arms at rest, ignores a second tap under 400 ms, signs from 400 ms to 4 s, and arms again after", () => {
    expect([ESPERA_MINIMA_MS, ARMADO_MAXIMO_MS]).toEqual([400, 4000])
    expect(respuestaAlToque(null, 1000)).toBe("armar")
    expect(respuestaAlToque(1000, 1399)).toBe("ignorar")
    expect(respuestaAlToque(1000, 1400)).toBe("firmar")
    expect(respuestaAlToque(1000, 5000)).toBe("firmar")
    expect(respuestaAlToque(1000, 5001)).toBe("armar")
  })
})
