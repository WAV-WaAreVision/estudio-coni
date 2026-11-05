// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  AVISO_DE_LA_GUIA,
  AVISOS,
  armarBorradorDePilar,
  armarBorradorDeRed,
  armarPesos,
  avisoDePesos,
  camposDeBorradorDePilar,
  camposDeBorradorDeRed,
  conAviso,
  ERRORES_DE_PILAR,
  etapasDeAprobacion,
  etiquetaDeEtapa,
  FALTA_NOMBRE_DE_RED,
  formatoDePeso,
  hrefDeAprobarBorrador,
  hrefDeEditarBorrador,
  hrefDePilarNuevo,
  leerAviso,
  leerPeso,
  leerRedPedida,
  NUEVO,
  RUTA_DE_BORRADORES,
  RUTA_DE_RED_NUEVA,
  totalDePesos,
} from "@/lib/dominio/biblioteca/borradores"

const ID = "11111111-2222-4333-8444-555555555555"
const CAMPOS = { nombre: "  Liderazgo sereno  ", nombreCorto: " Sereno ", descripcion: " Cómo decide. ", peso: "12,5" }

describe("leerPeso and formatoDePeso", () => {
  it.each([
    ["15", 15],
    ["12,5", 12.5],
    ["12.5", 12.5],
    [" 100 ", 100],
    ["0,01", 0.01],
  ])("reads %j as %s", (texto, peso) => {
    expect(leerPeso(texto)).toBe(peso)
  })

  it.each(["", "0", "100,01", "101", "12,345", "-5", "diez", "1e2", "12,"])("refuses %j", (texto) => {
    expect(leerPeso(texto)).toBeNull()
  })

  it("writes a weight as she does", () => {
    expect(formatoDePeso(110)).toBe("110")
    expect(formatoDePeso(12.5)).toBe("12,5")
    expect(formatoDePeso(0.01)).toBe("0,01")
  })
})

describe("armarBorradorDePilar", () => {
  it("trims every field and reads the weight", () => {
    expect(armarBorradorDePilar(CAMPOS)).toEqual({
      ok: true,
      datos: { nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: "Cómo decide.", peso: 12.5 },
    })
  })

  it.each([
    [{ ...CAMPOS, nombre: "  " }, ERRORES_DE_PILAR.nombre, "nombre"],
    [{ ...CAMPOS, nombre: "x".repeat(121) }, "El nombre puede tener hasta 120 caracteres.", "nombre"],
    [{ ...CAMPOS, nombreCorto: "" }, ERRORES_DE_PILAR.nombreCorto, "nombreCorto"],
    [{ ...CAMPOS, nombreCorto: "x".repeat(41) }, "El nombre corto puede tener hasta 40 caracteres.", "nombreCorto"],
    [{ ...CAMPOS, descripcion: "" }, ERRORES_DE_PILAR.descripcion, "descripcion"],
    [{ ...CAMPOS, descripcion: "x".repeat(1501) }, "La definición puede tener hasta 1500 caracteres.", "descripcion"],
    [{ ...CAMPOS, peso: "0" }, ERRORES_DE_PILAR.peso, "peso"],
    [{ ...CAMPOS, peso: "120" }, ERRORES_DE_PILAR.peso, "peso"],
  ])("says what is wrong and which field: %#", (campos, error, campo) => {
    expect(armarBorradorDePilar(campos)).toEqual({ ok: false, error, campo })
  })

  it("says the empty fields in her words", () => {
    expect(ERRORES_DE_PILAR).toEqual({
      nombre: "Escribe el nombre del pilar.",
      nombreCorto: "Escribe el nombre corto: es el texto del botón en Temas.",
      descripcion: "Escribe la definición del pilar.",
      peso: "Escribe el peso como un número mayor que 0 y hasta 100, por ejemplo 15 o 12,5.",
    })
  })

  it("prefills the form of a saved draft", () => {
    expect(
      camposDeBorradorDePilar({
        id: ID,
        red: "linkedin",
        nombre: "Liderazgo sereno",
        nombreCorto: "Sereno",
        descripcion: "Cómo decide.",
        peso: 12.5,
      }),
    ).toEqual({ nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: "Cómo decide.", peso: "12,5" })
  })
})

describe("armarBorradorDeRed", () => {
  it("needs only a name; the notes may stay empty", () => {
    expect(armarBorradorDeRed({ nombre: " TikTok ", manual: "", receta: " ", conexion: "" })).toEqual({
      ok: true,
      datos: { nombre: "TikTok", manual: "", receta: "", conexion: "" },
    })
  })

  it("says a missing name and a note too long", () => {
    expect(armarBorradorDeRed({ nombre: "", manual: "", receta: "", conexion: "" })).toEqual({
      ok: false,
      error: FALTA_NOMBRE_DE_RED,
      campo: "nombre",
    })
    expect(armarBorradorDeRed({ nombre: "TikTok", manual: "x".repeat(4001), receta: "", conexion: "" })).toEqual({
      ok: false,
      error: "El manual puede tener hasta 4000 caracteres.",
      campo: "manual",
    })
  })

  it("prefills the form of a saved draft", () => {
    expect(camposDeBorradorDeRed({ id: ID, nombre: "TikTok", manual: "M", receta: "", conexion: "C" })).toEqual({
      nombre: "TikTok",
      manual: "M",
      receta: "",
      conexion: "C",
    })
  })
})

describe("routes and notes", () => {
  it("gives every page of the drafts its address", () => {
    expect(hrefDePilarNuevo("instagram")).toBe("/biblioteca/temas/pilar-nuevo?red=instagram")
    expect(RUTA_DE_RED_NUEVA).toBe("/biblioteca/temas/red-nueva")
    expect(RUTA_DE_BORRADORES).toBe("/biblioteca/temas/borradores")
    expect(hrefDeEditarBorrador(ID)).toBe(`/biblioteca/temas/borradores/${ID}/editar`)
    expect(hrefDeAprobarBorrador(ID)).toBe(`/biblioteca/temas/borradores/${ID}/aprobar`)
  })

  it("takes the network of a new pillar from the address, else the last one she used, else LinkedIn", () => {
    expect(leerRedPedida({ red: "instagram" }, "linkedin")).toBe("instagram")
    expect(leerRedPedida({ red: "youtube" }, "instagram")).toBe("instagram")
    expect(leerRedPedida({ red: ["linkedin", "instagram"] }, null)).toBe("linkedin")
    expect(leerRedPedida({}, null)).toBe("linkedin")
  })

  it("adds a note to an address and reads it back; anything else is no note", () => {
    expect(conAviso("/biblioteca/temas?red=linkedin", "borrador-guardado")).toBe(
      "/biblioteca/temas?red=linkedin&aviso=borrador-guardado",
    )
    expect(conAviso("/biblioteca/temas/borradores", "borrador-descartado")).toBe(
      "/biblioteca/temas/borradores?aviso=borrador-descartado",
    )
    expect(leerAviso({ aviso: "borrador-guardado" })).toBe(
      "Guardé el borrador. Apruébalo en Borradores cuando quieras.",
    )
    expect(leerAviso({ aviso: "otra-cosa" })).toBeNull()
    expect(leerAviso({})).toBeNull()
    expect(Object.values(AVISOS).every((texto) => !texto.includes("\u2014"))).toBe(true)
  })
})

describe("the weights of an approval, stage by stage", () => {
  const BORRADOR = {
    id: ID,
    red: "linkedin" as const,
    nombre: "Liderazgo sereno: decidir con IA",
    nombreCorto: "Liderazgo sereno",
    descripcion: "Cómo decide.",
    peso: 10,
  }
  const HOY = "2026-11-05"
  const ETAPAS = etapasDeAprobacion(
    BORRADOR,
    [
      {
        desde: HOY,
        pesos: [
          { id: "a", nombreCorto: "Diagnóstico doble", peso: 30 },
          { id: "b", nombreCorto: "Bienestar e impacto", peso: 25 },
          { id: "c", nombreCorto: "Psicología en la mesa", peso: 30 },
          { id: "d", nombreCorto: "Mujeres líderes", peso: 15 },
        ],
      },
      {
        desde: "2027-01-01",
        pesos: [
          { id: "a", nombreCorto: "Diagnóstico doble", peso: 25 },
          { id: "b", nombreCorto: "Bienestar e impacto", peso: 25 },
          { id: "c", nombreCorto: "Psicología en la mesa", peso: 35 },
          { id: "d", nombreCorto: "Mujeres líderes", peso: 15 },
        ],
      },
    ],
    HOY,
  )
  const [DE_HOY, DE_ENERO] = ETAPAS
  if (!DE_HOY || !DE_ENERO) throw new Error("Faltan etapas")

  it("names a stage «Hoy» or by its date", () => {
    expect(etiquetaDeEtapa(HOY, HOY)).toBe("Hoy")
    expect(etiquetaDeEtapa("2027-07-01", HOY)).toBe("Desde el 1 de julio de 2027")
  })

  it("gives one stage per date, today first, each with the network's pillars and the new one at the draft's weight", () => {
    expect(ETAPAS.map((etapa) => [etapa.desde, etapa.esHoy, etapa.etiqueta])).toEqual([
      [HOY, true, "Hoy"],
      ["2027-01-01", false, "Desde el 1 de enero de 2027"],
    ])
    expect(DE_HOY.filas).toEqual([
      { clave: "a", nombre: "Diagnóstico doble", peso: "30" },
      { clave: "b", nombre: "Bienestar e impacto", peso: "25" },
      { clave: "c", nombre: "Psicología en la mesa", peso: "30" },
      { clave: "d", nombre: "Mujeres líderes", peso: "15" },
      { clave: NUEVO, nombre: "Liderazgo sereno", peso: "10" },
    ])
    expect(DE_ENERO.filas.map((fila) => fila.peso)).toEqual(["25", "25", "35", "15", "10"])
  })

  it("adds each stage's total and warns in her words only when it is not 100, naming a later stage's date", () => {
    expect(totalDePesos(DE_HOY.filas)).toBe(110)
    expect(avisoDePesos("linkedin", 110, DE_HOY)).toBe(
      "Los pesos de LinkedIn suman 110 %. Puedes aprobar igual y ajustarlos después.",
    )
    expect(avisoDePesos("linkedin", 110, DE_ENERO)).toBe(
      "Los pesos de LinkedIn desde el 1 de enero de 2027 suman 110 %. Puedes aprobar igual y ajustarlos después.",
    )
    expect(avisoDePesos("instagram", 99.5, DE_HOY)).toBe(
      "Los pesos de Instagram suman 99,5 %. Puedes aprobar igual y ajustarlos después.",
    )
    expect(avisoDePesos("instagram", 100, DE_ENERO)).toBeNull()
  })

  it("has no total while a weight cannot be read", () => {
    expect(totalDePesos(DE_HOY.filas.map((fila) => (fila.clave === "b" ? { ...fila, peso: "" } : fila)))).toBeNull()
  })

  it("sends every stage's weights as numbers, the new one under «nuevo», and names the first it cannot read with its stage", () => {
    expect(armarPesos(ETAPAS)).toEqual({
      ok: true,
      pesos: {
        [HOY]: { a: 30, b: 25, c: 30, d: 15, nuevo: 10 },
        "2027-01-01": { a: 25, b: 25, c: 35, d: 15, nuevo: 10 },
      },
    })
    const conError = [
      DE_HOY,
      { ...DE_ENERO, filas: DE_ENERO.filas.map((fila) => (fila.clave === "b" ? { ...fila, peso: "abc" } : fila)) },
    ]
    expect(armarPesos(conError)).toEqual({
      ok: false,
      error:
        "Escribe el peso de Bienestar e impacto (Desde el 1 de enero de 2027) como un número mayor que 0 y hasta 100.",
      desde: "2027-01-01",
      clave: "b",
    })
  })

  it("says that the guide is not updated by the app", () => {
    expect(AVISO_DE_LA_GUIA).toBe("La guía editorial no se actualiza sola: agrega a mano el texto de este pilar.")
  })
})
