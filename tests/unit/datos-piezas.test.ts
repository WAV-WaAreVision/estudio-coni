import { describe, expect, it } from "vitest"
import { cambiosDesdePieza, type FilaPieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { type Pieza, piezaNueva } from "@/lib/dominio/estados"

/** What a write reads back as: the row also carries the type, which the server never writes. */
const releida = (pieza: Pieza): FilaPieza => ({ ...cambiosDesdePieza(pieza), tipo: pieza.tipo })

const filaNueva: FilaPieza = {
  tipo: "reel",
  estado: "idea",
  version: 0,
  intento: 0,
  estado_antes_del_error: null,
  audio_id: null,
  video_id: null,
  puerta1_hash: null,
  puerta1_en: null,
  puerta2_video_id: null,
  puerta2_carrusel_id: null,
  puerta2_hash_texto: null,
  puerta2_publicar_en: null,
  puerta2_en: null,
  puerta2_formula: null,
  explicacion: null,
}

const filaProgramada: FilaPieza = {
  tipo: "reel",
  estado: "programado",
  version: 7,
  intento: 2,
  estado_antes_del_error: null,
  audio_id: "audio-1",
  video_id: "video-1",
  puerta1_hash: "a".repeat(64),
  puerta1_en: "2026-10-08T20:00:00.000Z",
  puerta2_video_id: "video-1",
  puerta2_carrusel_id: null,
  puerta2_hash_texto: "b".repeat(64),
  puerta2_publicar_en: "2026-10-09T22:00:00.000Z",
  puerta2_en: "2026-10-08T21:00:00.000Z",
  puerta2_formula: null,
  explicacion: null,
}

const piezaProgramada: Pieza = {
  tipo: "reel",
  estado: "programado",
  version: 7,
  intento: 2,
  estadoAntesDelError: null,
  audioId: "audio-1",
  videoId: "video-1",
  puerta1: { hash: "a".repeat(64), en: "2026-10-08T20:00:00.000Z" },
  puerta2: {
    videoId: "video-1",
    hashTexto: "b".repeat(64),
    publicarEn: "2026-10-09T22:00:00.000Z",
    en: "2026-10-08T21:00:00.000Z",
    formula: 1,
  },
  explicacion: null,
}

describe("piezaDesdeFila", () => {
  it("devuelve la pieza nueva del dominio cuando la fila no tiene datos", () => {
    expect(piezaDesdeFila(filaNueva)).toEqual(piezaNueva())
  })

  it("mapea cada columna a su campo cuando la fila tiene las dos puertas", () => {
    expect(piezaDesdeFila(filaProgramada)).toEqual(piezaProgramada)
  })

  it("reads a null puerta2_formula as formula 1 and a 2 as formula 2", () => {
    expect(piezaDesdeFila(filaProgramada).puerta2?.formula).toBe(1)
    expect(piezaDesdeFila({ ...filaProgramada, puerta2_formula: 2 }).puerta2?.formula).toBe(2)
  })

  it("mapea estado_antes_del_error a estadoAntesDelError cuando la pieza falló", () => {
    const pieza = piezaDesdeFila({
      ...filaProgramada,
      estado: "error_publicacion",
      estado_antes_del_error: "programado",
      explicacion: "Meta no respondió",
    })
    expect(pieza).toMatchObject({
      estado: "error_publicacion",
      estadoAntesDelError: "programado",
      explicacion: "Meta no respondió",
    })
  })

  it("ignora las columnas que no son del dominio cuando la fila trae más datos", () => {
    const filaCompleta = { ...filaProgramada, id: "x", titulo: "Un título", puerta1_por: "u", guion: "g" }
    const pieza = piezaDesdeFila(filaCompleta)
    expect(pieza).toEqual(piezaProgramada)
  })
})

describe("instantes de la base", () => {
  const conPuerta1En = (en: string | Date | null): FilaPieza => ({ ...filaProgramada, puerta1_en: en })
  const puerta1En = (en: string | Date | null) => piezaDesdeFila(conPuerta1En(en)).puerta1?.en

  it("normaliza a ISO con milisegundos cuando supabase-js entrega microsegundos", () => {
    expect(puerta1En("2026-10-08T22:00:00.123456+00:00")).toBe("2026-10-08T22:00:00.123Z")
  })

  it("normaliza a ISO con milisegundos cuando postgres entrega espacio y offset corto", () => {
    expect(puerta1En("2026-10-08 22:00:00.123456+00")).toBe("2026-10-08T22:00:00.123Z")
  })

  it("normaliza a ISO con milisegundos cuando node-postgres entrega un Date", () => {
    expect(puerta1En(new Date("2026-10-08T22:00:00.123Z"))).toBe("2026-10-08T22:00:00.123Z")
  })

  it("convierte a UTC cuando el offset no es cero", () => {
    expect(puerta1En("2026-10-08 19:00:00-03")).toBe("2026-10-08T22:00:00.000Z")
    expect(puerta1En("2026-10-08T19:30:00.5-03:30")).toBe("2026-10-08T23:00:00.500Z")
  })

  it("acepta segundos enteros y el sufijo Z", () => {
    expect(puerta1En("2026-10-08 22:00:00+00")).toBe("2026-10-08T22:00:00.000Z")
    expect(puerta1En("2026-10-08T22:00:00.987654Z")).toBe("2026-10-08T22:00:00.987Z")
  })

  it("trunca y no redondea cuando los microsegundos pasan de 500", () => {
    expect(puerta1En("2026-10-08T22:00:00.999999+00:00")).toBe("2026-10-08T22:00:00.999Z")
  })

  it("normaliza los tres instantes de la puerta 2 cuando llegan en formato de postgres", () => {
    const pieza = piezaDesdeFila({
      ...filaProgramada,
      puerta2_publicar_en: "2026-10-09 22:00:00.5+00",
      puerta2_en: "2026-10-08 21:00:00.250000+00",
    })
    expect(pieza.puerta2).toMatchObject({
      publicarEn: "2026-10-09T22:00:00.500Z",
      en: "2026-10-08T21:00:00.250Z",
    })
  })

  it("lanza Error cuando el instante no se puede leer", () => {
    expect(() => puerta1En("mañana")).toThrow(Error)
    expect(() => puerta1En("2026-10-08 22:00:00")).toThrow(/instante/i)
    expect(() => puerta1En("2026-02-30 22:00:00+00")).toThrow(Error)
    expect(() => puerta1En(new Date("no es una fecha"))).toThrow(Error)
  })
})

describe("filas incoherentes", () => {
  it("lanza Error cuando la puerta 1 trae el hash sin la hora", () => {
    expect(() => piezaDesdeFila({ ...filaProgramada, puerta1_en: null })).toThrow(Error)
  })

  it("lanza Error cuando la puerta 1 trae la hora sin el hash", () => {
    expect(() => piezaDesdeFila({ ...filaProgramada, puerta1_hash: null })).toThrow(Error)
  })

  it("lanza Error cuando la puerta 2 está a medias", () => {
    expect(() => piezaDesdeFila({ ...filaProgramada, puerta2_publicar_en: null })).toThrow(Error)
    expect(() => piezaDesdeFila({ ...filaProgramada, puerta2_video_id: null })).toThrow(Error)
    expect(() => piezaDesdeFila({ ...filaProgramada, puerta2_en: null })).toThrow(Error)
  })

  it("lanza Error cuando estado_antes_del_error no es un paso reintentable", () => {
    expect(() => piezaDesdeFila({ ...filaNueva, estado: "error_produccion", estado_antes_del_error: "idea" })).toThrow(
      Error,
    )
  })
})

describe("cambiosDesdePieza", () => {
  it("devuelve exactamente las columnas que el servidor puede escribir", () => {
    expect(Object.keys(cambiosDesdePieza(piezaProgramada)).sort()).toEqual(
      [
        "estado",
        "version",
        "intento",
        "estado_antes_del_error",
        "audio_id",
        "video_id",
        "puerta1_hash",
        "puerta1_en",
        "puerta2_video_id",
        "puerta2_carrusel_id",
        "puerta2_hash_texto",
        "puerta2_publicar_en",
        "puerta2_en",
        "puerta2_formula",
        "explicacion",
      ].sort(),
    )
  })

  it("nunca incluye quién aprobó cuando la pieza tiene las dos puertas", () => {
    const cambios = cambiosDesdePieza(piezaProgramada)
    expect(cambios).not.toHaveProperty("puerta1_por")
    expect(cambios).not.toHaveProperty("puerta2_por")
  })

  it("devuelve las puertas en null cuando la pieza no tiene aprobaciones", () => {
    expect(releida(piezaNueva())).toEqual(filaNueva)
  })

  it("devuelve los valores de la pieza cuando tiene las dos puertas", () => {
    expect(releida(piezaProgramada)).toEqual(filaProgramada)
  })

  it("writes formula 2 as 2 and formula 1 as null, so an old approval stays byte for byte as it was", () => {
    const aprobacion = piezaProgramada.puerta2
    if (aprobacion?.videoId === undefined) throw new Error("La pieza de prueba es un reel aprobado.")
    const con2: Pieza = { ...piezaProgramada, puerta2: { ...aprobacion, formula: 2 } }
    expect(cambiosDesdePieza(con2).puerta2_formula).toBe(2)
    expect(cambiosDesdePieza(piezaProgramada).puerta2_formula).toBeNull()
    expect(piezaDesdeFila(releida(con2))).toEqual(con2)
  })

  it("recupera la misma pieza cuando se vuelve a leer lo que se escribió", () => {
    expect(piezaDesdeFila(releida(piezaProgramada))).toEqual(piezaProgramada)
  })

  it("recupera la misma pieza cuando falló en un paso reintentable", () => {
    const fallida: Pieza = {
      ...piezaProgramada,
      tipo: "reel",
      estado: "error_produccion",
      estadoAntesDelError: "subtitulando",
      puerta2: null,
      explicacion: "HeyGen falló",
    }
    expect(piezaDesdeFila(releida(fallida))).toEqual(fallida)
  })
})

describe("the piece type", () => {
  it("reads the type of the row and never writes it", () => {
    const pieza = piezaDesdeFila({ ...filaNueva, tipo: "carrusel" })
    expect(pieza.tipo).toBe("carrusel")
    expect(cambiosDesdePieza(pieza)).not.toHaveProperty("tipo")
  })

  it("refuses a type the domain does not know", () => {
    expect(() => piezaDesdeFila({ ...filaNueva, tipo: "video" })).toThrow("Tipo de pieza desconocido")
  })
})

describe("the gate 2 of a carousel", () => {
  const filaDeCarrusel: FilaPieza = {
    ...filaProgramada,
    tipo: "carrusel",
    audio_id: null,
    video_id: null,
    puerta2_video_id: null,
    puerta2_carrusel_id: "11111111-1111-4111-8111-111111111111",
  }

  it("reads it with its carousel id and writes it back the same", () => {
    const pieza = piezaDesdeFila(filaDeCarrusel)
    expect(pieza.puerta2).toEqual({
      carruselId: "11111111-1111-4111-8111-111111111111",
      hashTexto: "b".repeat(64),
      publicarEn: "2026-10-09T22:00:00.000Z",
      en: "2026-10-08T21:00:00.000Z",
    })
    expect(releida(pieza)).toEqual(filaDeCarrusel)
  })

  it("refuses a gate 2 with both a video and a carousel", () => {
    expect(() => piezaDesdeFila({ ...filaDeCarrusel, puerta2_video_id: "video-1" })).toThrow(Error)
  })
})
