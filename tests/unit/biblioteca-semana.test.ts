import { describe, expect, it } from "vitest"
import {
  A_PEDIDO,
  COSTO_SIN_HISTORIA_USD,
  crucesQueNoSirvieron,
  estimarCostoDelMotor,
  etiquetaDePilarParaSubir,
  lineasDeTeoriaParaWav,
  MOTOR_NO_TERMINO,
  MOTOR_PEDIDO,
  NADA_QUE_SUBIR,
  NO_ARRANCO,
  nadaQueSubir,
  pilaresParaSubir,
  presentarCorrida,
  puedePedirMotor,
  RUTA_DE_SEMANA,
  respaldoDeTeoria,
  resumenDeCorrida,
  SIN_CORRIDA,
  SIN_CORRIDAS,
  SIN_CRUCES,
  TITULO_DE_LO_CRUZADO,
  TRABAJANDO,
  temasParaSubir,
  textoDeCosto,
  tituloDeSemana,
  YA_PROPUSO,
} from "@/lib/dominio/biblioteca/semana"

describe("the cost under «Proponer ahora» (4a)", () => {
  it("is the median of the latest four runs that cost something, to the cent", () => {
    expect(estimarCostoDelMotor([0.2, 0.4, 0.25, 0.3])).toBe(0.28)
    expect(estimarCostoDelMotor([0.21, 0.2, 0.25, 0.3])).toBe(0.23)
  })

  it("looks only at the latest four, newest first", () => {
    expect(estimarCostoDelMotor([0.1, 0.2, 0.3, 0.4, 9])).toBe(0.25)
  })

  it("takes the middle one of fewer than four, or the only one", () => {
    expect(estimarCostoDelMotor([0.31, 0.19, 0.22])).toBe(0.22)
    expect(estimarCostoDelMotor([0.4])).toBe(0.4)
  })

  it("ignores runs that cost nothing", () => {
    expect(estimarCostoDelMotor([0, 0.2, 0])).toBe(0.2)
  })

  it("says a fixed US$ 0,30 before any run cost something", () => {
    expect(COSTO_SIN_HISTORIA_USD).toBe(0.3)
    expect(estimarCostoDelMotor([])).toBe(0.3)
    expect(estimarCostoDelMotor([0, 0])).toBe(0.3)
  })

  it("is said in her words, under the button", () => {
    expect(textoDeCosto(0.25)).toBe("Cuesta cerca de US$ 0,25")
    expect(RUTA_DE_SEMANA).toBe("/biblioteca/semana")
  })
})

describe("puedePedirMotor (spec decision 4)", () => {
  const AHORA = new Date("2026-11-04T15:00:00Z")
  const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000).toISOString()

  it("lets her ask when this week has no run yet", () => {
    expect(puedePedirMotor(null, AHORA)).toBe(true)
  })

  it("refuses a week that is ready", () => {
    expect(puedePedirMotor({ estado: "lista", creadaEn: hace(600) }, AHORA)).toBe(false)
  })

  it("refuses a run still alive, up to the engine's own 30 minutes, and allows one older than that", () => {
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(29) }, AHORA)).toBe(false)
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(30) }, AHORA)).toBe(false)
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(31) }, AHORA)).toBe(true)
  })

  it("lets her ask again after a failed run", () => {
    expect(puedePedirMotor({ estado: "fallida", creadaEn: hace(5) }, AHORA)).toBe(true)
  })

  it("answers in her words", () => {
    expect(YA_PROPUSO).toBe("El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes.")
    expect(NO_ARRANCO).toBe("No pude pedirle ideas al motor. Inténtalo de nuevo en unos minutos.")
    expect(MOTOR_PEDIDO).toBe("El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos.")
  })
})

describe("the words of Semana", () => {
  it("names the run's state with a word and, where the pill has none, an icon (4j)", () => {
    expect(presentarCorrida("lista")).toEqual({ palabra: "Lista", tipo: "ok", icono: null })
    expect(presentarCorrida("corriendo")).toEqual({ palabra: "Trabajando", tipo: "neutro", icono: "reloj" })
    expect(presentarCorrida("fallida")).toEqual({ palabra: "Falló", tipo: "error", icono: null })
    expect(A_PEDIDO).toBe("A pedido")
  })

  it("throws on a state the database does not allow", () => {
    expect(() => presentarCorrida("x")).toThrow("Estado de corrida desconocido: x")
  })

  it("says the evidence level as backing, in her words (4h)", () => {
    expect(respaldoDeTeoria("alto")).toBe("Respaldo: fuerte")
    expect(respaldoDeTeoria("medio")).toBe("Respaldo: medio")
    expect(respaldoDeTeoria("debil")).toBe("Respaldo: débil")
    expect(respaldoDeTeoria(null)).toBeNull()
    expect(() => respaldoDeTeoria("x")).toThrow("Nivel de evidencia desconocido: x")
  })

  it("folds the score and the id for WAV, the score only when there is one", () => {
    expect(lineasDeTeoriaParaWav({ id: "t-1", puntaje: 0.8234 })).toEqual(["Puntaje: 0,82", "Teoría: t-1"])
    expect(lineasDeTeoriaParaWav({ id: "t-2", puntaje: null })).toEqual(["Teoría: t-2"])
  })

  it("names the week from Monday to Sunday, across a month too", () => {
    expect(tituloDeSemana("2026-11-08")).toBe("Semana del 2 al 8 de noviembre")
    expect(tituloDeSemana("2026-11-01")).toBe("Semana del 26 de octubre al 1 de noviembre")
  })

  it("sums up a ready run as ideas and what it cost", () => {
    expect(resumenDeCorrida({ ideas: 3, costoUsd: 0.21 })).toBe("3 ideas nuevas · Costó US$ 0,21")
    expect(resumenDeCorrida({ ideas: 1, costoUsd: 0 })).toBe("1 idea nueva · Costó US$ 0,00")
  })

  it("has her lines for every empty and failed case (4l)", () => {
    expect(TITULO_DE_LO_CRUZADO).toBe("Lo que el motor cruzó esta semana")
    expect(crucesQueNoSirvieron(2)).toBe("Cruces que no sirvieron (2)")
    expect(SIN_CRUCES).toBe("Esta semana el motor no encontró cruces nuevos.")
    expect(SIN_CORRIDAS).toBe("Todavía no corre el motor. La primera tanda llega el domingo a las 20:00.")
    expect(TRABAJANDO).toBe("El motor todavía está trabajando en esta semana.")
    expect(MOTOR_NO_TERMINO).toBe("El motor no terminó esta semana.")
    expect(NADA_QUE_SUBIR).toBe("Por ahora no falta nada: cada tema tiene varios autores y cada pilar tiene material.")
    expect(SIN_CORRIDA).toEqual({ corrida: null, teorias: [], descartadas: [], queSubir: null })
  })
})

describe("what to upload next (spec decision 8)", () => {
  it("links a single-author topic it can match, and keeps one it cannot as plain text", () => {
    const ids = new Map([["Descanso digital", "tema-1"]])
    expect(temasParaSubir(["Descanso digital", "Sueño y pantallas"], ids)).toEqual([
      { nombre: "Descanso digital", id: "tema-1" },
      { nombre: "Sueño y pantallas", id: null },
    ])
  })

  it("names each pillar with its network, in the engine's order, and drops layers and unknown slugs", () => {
    const pilares = [
      {
        id: "p-1",
        slug: "bienestar-e-impacto",
        nombreCorto: "Bienestar e impacto",
        red: "linkedin" as const,
        esCapa: false,
      },
      { id: "p-2", slug: "capa-tdah", nombreCorto: "Capa TDAH", red: "instagram" as const, esCapa: true },
      {
        id: "p-3",
        slug: "mi-nueva-partida",
        nombreCorto: "Mi nueva partida",
        red: "instagram" as const,
        esCapa: false,
      },
    ]
    const leidos = pilaresParaSubir(["mi-nueva-partida", "pareja", "capa-tdah", "bienestar-e-impacto"], pilares)
    expect(leidos).toEqual([
      { slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", red: "instagram" },
      { slug: "bienestar-e-impacto", nombreCorto: "Bienestar e impacto", red: "linkedin" },
    ])
    expect(leidos.map(etiquetaDePilarParaSubir)).toEqual([
      "Mi nueva partida · Instagram",
      "Bienestar e impacto · LinkedIn",
    ])
  })

  it("has nothing to ask for only when both lists are empty", () => {
    expect(nadaQueSubir({ unSoloAutor: [], pilaresSinMaterial: [] })).toBe(true)
    expect(nadaQueSubir({ unSoloAutor: [{ nombre: "x", id: null }], pilaresSinMaterial: [] })).toBe(false)
  })
})
