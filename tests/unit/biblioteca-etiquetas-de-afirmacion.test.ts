import { describe, expect, it } from "vitest"
import {
  catalogoDeFilas,
  esMarca,
  etiquetaDe,
  opcionesDe,
  pidePorQue,
  tituloDeEtiqueta,
  YA_NO_ESTA,
} from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import type { FilaDeVocabulario } from "@/lib/dominio/vocabulario"
import { CATALOGO_DE_PRUEBA } from "../fixtures/afirmaciones"
import { FILAS_DE_VOCABULARIO } from "../fixtures/vocabulario"

const C = CATALOGO_DE_PRUEBA

/** The starting lists with one retired value added to `lista` (and `red`). */
function conRetirado(lista: string, red: string, valor: FilaDeVocabulario["valores"][number]): FilaDeVocabulario[] {
  return FILAS_DE_VOCABULARIO.map((fila) =>
    fila.lista === lista && fila.red === red
      ? { ...fila, valores: [...fila.valores, { ...valor, retirado: true }] }
      : fila,
  )
}

describe("catalogoDeFilas", () => {
  it("keeps every list with its labels, grupo and activación, marking a retired value inactive", () => {
    const catalogo = catalogoDeFilas(
      conRetirado("emocion", "todas", { valor: "nostalgia", etiqueta: "Nostalgia", grupo: "puente" }),
    )
    expect(catalogo.emocion).toHaveLength(23)
    expect(catalogo.emocion[0]).toMatchObject({ valor: "agobio", grupo: "problema", activacion: "alta", activo: true })
    expect(catalogo.emocion.at(-1)).toEqual({
      valor: "nostalgia",
      etiqueta: "Nostalgia",
      grupo: "puente",
      activo: false,
    })
    expect(catalogo.publico.instagram.map((v) => v.valor)).toEqual([
      "profesional_con_techo",
      "se_reinventa",
      "se_descubre_tarde",
    ])
    expect(catalogo.evidencia.find((v) => v.valor === "clinica")?.etiqueta).toBe("Práctica profesional")
    expect(catalogo.gancho).toHaveLength(12)
  })

  it("fails when a list has no vigente version", () => {
    expect(() => catalogoDeFilas(FILAS_DE_VOCABULARIO.filter((fila) => fila.lista !== "gancho"))).toThrow(/gancho/)
  })
})

describe("etiquetaDe", () => {
  it("reads labels from the lists, per network where the list is", () => {
    expect(etiquetaDe(C, "tipo", "todas", "limite")).toBe("Límite")
    expect(etiquetaDe(C, "evidencia", "todas", "clinica")).toBe("Práctica profesional")
    expect(etiquetaDe(C, "problema", "instagram", "techo_profesional")).toBe("Techo profesional")
    expect(etiquetaDe(C, "solucion", "linkedin", "rrhh_tarde")).toBe("RR.HH. llega tarde")
    expect(etiquetaDe(C, "publico", "linkedin", "gerencia")).toBe("Gerencia")
    expect(etiquetaDe(C, "emocion", "linkedin", "otra")).toBe("Otra")
    expect(etiquetaDe(C, "tipo_de_gancho", "todas", "escena")).toBe("Escena")
  })

  it("names the values that are not list values, and one that left the list", () => {
    expect(etiquetaDe(C, "tipo", "todas", "sin_clasificar")).toBe("Sin clasificar")
    expect(etiquetaDe(C, "problema", "linkedin", "otro")).toBe("Otro")
    expect(etiquetaDe(C, "tipo_de_gancho", "todas", "ninguno")).toBe("Ninguno de la lista")
    expect(etiquetaDe(C, "emocion", "instagram", "nostalgia")).toBe(YA_NO_ESTA)
    const conNostalgia = catalogoDeFilas(
      conRetirado("emocion", "todas", { valor: "nostalgia", etiqueta: "Nostalgia", grupo: "puente" }),
    )
    expect(etiquetaDe(conNostalgia, "emocion", "instagram", "nostalgia")).toBe("Nostalgia")
  })

  it("gives dato and caso their own short label", () => {
    expect(etiquetaDe(C, "dato", "todas", "70 %")).toBe("70 %")
    expect(etiquetaDe(C, "caso", "todas", "Una gerenta")).toBe("Una gerenta")
  })
})

describe("opcionesDe", () => {
  it("groups the emotions by grupo, in order, with activación in each detail", () => {
    const grupos = opcionesDe(C, "emocion", "instagram")
    expect(grupos.map((grupo) => grupo.titulo)).toEqual(["Problema", "Puente", "Solución", "Respaldo"])
    expect(grupos[0]?.opciones[0]).toEqual({
      valor: "agobio",
      etiqueta: "Agobio",
      detalle: "Activación alta. Demasiado, ahora: sobrecarga, no doy abasto.",
    })
    expect(grupos[3]?.opciones.map((opcion) => opcion.valor)).toEqual(["informativa", "otra"])
    expect(grupos[3]?.opciones[0]?.detalle).toBe("Un dato sin reacción buscada. Si el dato sorprende, es sorpresa.")
  })

  it("offers the network's pains plus «Otro» for problema and solución, without retired values", () => {
    const catalogo = catalogoDeFilas(conRetirado("dolor", "linkedin", { valor: "viejo", etiqueta: "Viejo" }))
    const [grupo] = opcionesDe(catalogo, "solucion", "linkedin")
    expect(grupo?.titulo).toBeNull()
    expect(grupo?.opciones.map((opcion) => opcion.valor)).toEqual([
      "herramienta_sin_uso",
      "rrhh_tarde",
      "adopcion_no_impacto",
      "liderar_incertidumbre",
      "resistencia_miedo",
      "juzgada_por_ia",
      "otro",
    ])
    expect(opcionesDe(C, "publico", "instagram")[0]?.opciones.map((opcion) => opcion.valor)).toEqual([
      "profesional_con_techo",
      "se_reinventa",
      "se_descubre_tarde",
      "otro",
    ])
  })

  it("offers «Ninguno de la lista» after the hook types, only the list for tipo and evidencia, nothing for dato", () => {
    const gancho = opcionesDe(C, "tipo_de_gancho", "todas")[0]?.opciones ?? []
    expect(gancho).toHaveLength(13)
    expect(gancho.at(-1)).toEqual({ valor: "ninguno", etiqueta: "Ninguno de la lista", detalle: null })
    expect(opcionesDe(C, "evidencia", "todas")[0]?.opciones.map((opcion) => opcion.valor)).toEqual([
      "estudio",
      "guia_consenso",
      "clinica",
      "opinion",
      "testimonio",
    ])
    expect(opcionesDe(C, "dato", "todas")).toEqual([])
    expect(opcionesDe(C, "caso", "todas")).toEqual([])
  })
})

describe("names and rules", () => {
  it("names a tag by its field and network, in Coni's words", () => {
    expect(tituloDeEtiqueta("emocion", "instagram")).toBe("Emoción en Instagram")
    expect(tituloDeEtiqueta("solucion", "linkedin")).toBe("Solución en LinkedIn")
    expect(tituloDeEtiqueta("tipo", "todas")).toBe("Qué tipo de idea es")
    expect(tituloDeEtiqueta("evidencia", "todas")).toBe("Qué la respalda")
    expect(tituloDeEtiqueta("tipo_de_gancho", "todas")).toBe("Tipo de gancho")
  })

  it("asks why only for otro and otra, and knows which fields are marks", () => {
    expect([pidePorQue("otro"), pidePorQue("otra"), pidePorQue("calma")]).toEqual([true, true, false])
    expect([esMarca("problema"), esMarca("dato"), esMarca("tipo"), esMarca("tipo_de_gancho")]).toEqual([
      true,
      true,
      false,
      false,
    ])
  })
})
