import { describe, expect, it } from "vitest"
import { EVIDENCIA, TIPO_DE_AFIRMACION } from "@/lib/dominio/biblioteca/etiquetas"
import { adaptacionDe, esEnlaceWeb, leerEdicion, leerFicha, textoDeUbicacion } from "@/lib/dominio/biblioteca/ficha"

const MATERIAL = "11111111-2222-4333-8444-555555555555"
const IDEAS = ["Una", "Dos", "Tres", "Cuatro", "Cinco"]

describe("the words of ideas", () => {
  it("says every claim type and evidence kind the task writes", () => {
    expect(Object.keys(TIPO_DE_AFIRMACION)).toEqual([
      "definicion",
      "causa",
      "consecuencia",
      "mito",
      "consejo",
      "dato",
      "experiencia",
    ])
    expect(EVIDENCIA).toEqual({ estudio: "Estudio", clinica: "Clínica", opinion: "Opinión", testimonio: "Testimonio" })
  })
})

describe("leerFicha", () => {
  it("reads the json columns the task writes, and null when they have another shape", () => {
    const fila = {
      resumen: "R",
      ideas_clave: IDEAS,
      citas: [{ texto: "c", ubicacion: { pagina: 3 } }],
      fuente: { autor: null, anio: 2024, enlace: null },
    }
    expect(leerFicha(fila)).toEqual({
      resumen: "R",
      ideasClave: IDEAS,
      citas: [{ texto: "c", ubicacion: { pagina: 3 } }],
      fuente: { autor: null, anio: 2024, enlace: null },
    })
    expect(leerFicha({ ...fila, ideas_clave: "no" })).toBeNull()
  })
})

describe("textoDeUbicacion and adaptacionDe", () => {
  it("says where a quote is as she reads it", () => {
    expect(textoDeUbicacion({ pagina: 12 })).toBe("página 12")
    expect(textoDeUbicacion({ segundo: 75.4, pista: "voz" })).toBe("1:15")
    expect(textoDeUbicacion({ imagen: 3 })).toBe("imagen 3")
    expect(textoDeUbicacion({ pagina: null })).toBeNull()
  })

  it("says whether the card was translated", () => {
    expect(adaptacionDe("es")).toBe("Adaptado a la voz de Coni")
    expect(adaptacionDe("en")).toBe("Traducido del inglés y adaptado a la voz de Coni")
    expect(adaptacionDe("sv")).toBe("Traducido de otro idioma y adaptado a la voz de Coni")
  })
})

describe("leerEdicion", () => {
  const edicion = {
    materialId: MATERIAL,
    resumen: " Resumen ",
    ideasClave: [...IDEAS, ""],
    citas: [{ texto: "", ubicacion: { pagina: 1 } }],
    fuente: { autor: " ", anio: null, enlace: "https://ejemplo.cl" },
  }

  it("trims, drops blank ideas and quotes, and keeps the rest", () => {
    expect(leerEdicion(edicion)).toEqual({
      ok: true,
      datos: {
        ...edicion,
        resumen: "Resumen",
        ideasClave: IDEAS,
        citas: [],
        fuente: { autor: null, anio: null, enlace: "https://ejemplo.cl" },
      },
    })
  })

  it("says what is wrong in her words", () => {
    expect(leerEdicion({ ...edicion, resumen: " " })).toEqual({ ok: false, error: "El resumen no puede quedar vacío." })
    expect(leerEdicion({ ...edicion, ideasClave: ["Una"] })).toEqual({
      ok: false,
      error: "Deja entre 5 y 10 ideas clave.",
    })
    expect(leerEdicion({ ...edicion, fuente: { autor: null, anio: null, enlace: "ftp://x" } })).toEqual({
      ok: false,
      error: "El enlace de la fuente no es válido.",
    })
    expect(leerEdicion({ materialId: "x" })).toEqual({
      ok: false,
      error: "No entendí esa solicitud. Vuelve a abrir la pantalla.",
    })
  })

  it.each(["autor", "enlace"])("refuses a source %s over 2000 characters, and takes one of 2000", (campo) => {
    const fuente = (largo: number) => ({ ...edicion.fuente, enlace: null, [campo]: `https://${"a".repeat(largo - 8)}` })
    expect(leerEdicion({ ...edicion, fuente: fuente(2001) })).toEqual({
      ok: false,
      error: "No entendí esa solicitud. Vuelve a abrir la pantalla.",
    })
    expect(leerEdicion({ ...edicion, fuente: fuente(2000) }).ok).toBe(true)
  })
})

describe("esEnlaceWeb", () => {
  it.each(["https://ejemplo.cl/estudio", "http://ejemplo.cl", "HTTPS://EJEMPLO.CL"])(
    "takes %s as a web link",
    (enlace) => {
      expect(esEnlaceWeb(enlace)).toBe(true)
    },
  )

  it.each([
    "javascript:alert(1)",
    " javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "/biblioteca",
    "ejemplo.cl/estudio",
    "//ejemplo.cl",
    "mailto:alguien@ejemplo.cl",
    "",
  ])("refuses %j: it is shown as text, never as a link", (enlace) => {
    expect(esEnlaceWeb(enlace)).toBe(false)
  })
})
