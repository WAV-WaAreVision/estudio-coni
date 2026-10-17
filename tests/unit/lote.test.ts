import { describe, expect, it } from "vitest"
import {
  botonDeAlcance,
  cuantasAlcanzan,
  preguntaDeAlcance,
  textoDeDescartadas,
  textoDeEmpezadas,
  textoDeRestauradas,
} from "@/lib/dominio/lote"

describe("cuantasAlcanzan", () => {
  it("counts the scripts the month still covers, the way reservar_gasto refuses (usado + estimado > tope)", () => {
    expect(cuantasAlcanzan({ tope: 40, usado: 0, estimadoPorGuion: 1.1, pedidas: 5 })).toBe(5)
    expect(cuantasAlcanzan({ tope: 40, usado: 37.8, estimadoPorGuion: 1.1, pedidas: 5 })).toBe(2)
    // Exactly at the cap still passes: 2 x 1.1 = 2.2 = 40 - 37.8.
    expect(cuantasAlcanzan({ tope: 40, usado: 37.8, estimadoPorGuion: 1.1, pedidas: 2 })).toBe(2)
  })

  it("says none when the month is spent or past the cap, and never more than asked", () => {
    expect(cuantasAlcanzan({ tope: 40, usado: 40, estimadoPorGuion: 1.1, pedidas: 3 })).toBe(0)
    expect(cuantasAlcanzan({ tope: 40, usado: 41, estimadoPorGuion: 1.1, pedidas: 3 })).toBe(0)
    expect(cuantasAlcanzan({ tope: 0, usado: 0, estimadoPorGuion: 1.1, pedidas: 3 })).toBe(0)
    expect(cuantasAlcanzan({ tope: 1000, usado: 0, estimadoPorGuion: 1.1, pedidas: 3 })).toBe(3)
  })
})

describe("batch copy", () => {
  it("speaks in the singular and the plural", () => {
    expect(textoDeEmpezadas(1)).toBe("Escribiendo 1 guion. Te aviso cuando esté.")
    expect(textoDeEmpezadas(3)).toBe("Escribiendo 3 guiones. Te aviso cuando estén.")
    expect(textoDeDescartadas(1)).toBe("Descarté 1 idea.")
    expect(textoDeDescartadas(2)).toBe("Descarté 2 ideas.")
    expect(preguntaDeAlcance(1)).toBe("Alcanza para 1 este mes. ¿Hago ese?")
    expect(preguntaDeAlcance(2)).toBe("Alcanza para 2 este mes. ¿Hago esos?")
    expect(botonDeAlcance(1)).toBe("Sí, hacer 1 guion")
    expect(botonDeAlcance(2)).toBe("Sí, hacer 2 guiones")
  })

  it("tells how many came back after Deshacer", () => {
    expect(textoDeRestauradas(1, 1)).toBe("Volvió al banco.")
    expect(textoDeRestauradas(3, 3)).toBe("Volvieron al banco.")
    expect(textoDeRestauradas(1, 3)).toBe("Volvieron 1 de 3. Las demás quedaron descartadas.")
    expect(textoDeRestauradas(0, 2)).toBe("Ya pasaron los 8 segundos: quedaron descartadas.")
  })
})
