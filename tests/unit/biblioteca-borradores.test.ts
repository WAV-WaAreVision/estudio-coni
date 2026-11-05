// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  AVISOS,
  armarBorradorDePilar,
  armarBorradorDeRed,
  camposDeBorradorDePilar,
  camposDeBorradorDeRed,
  conAviso,
  ERRORES_DE_PILAR,
  FALTA_NOMBRE_DE_RED,
  formatoDePeso,
  hrefDeAprobarBorrador,
  hrefDeEditarBorrador,
  hrefDePilarNuevo,
  leerAviso,
  leerPeso,
  leerRedPedida,
  RUTA_DE_BORRADORES,
  RUTA_DE_RED_NUEVA,
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
