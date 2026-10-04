// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ajenoDelRespaldo, huellaDeRespaldo, paraElGuion, type Respaldo } from "@/lib/dominio/respaldo"

const RESPALDO: Respaldo = {
  teoria: {
    id: "t1",
    titulo: "El deseo se cuida",
    tesis: "El deseo baja con la rutina.",
    porQue: "Le pasa a muchas parejas.",
  },
  afirmaciones: [
    {
      id: "b",
      texto: "La novedad aviva el deseo.",
      cita: "Novelty is the fuel of desire",
      aporte: "Explica el mecanismo",
      autor: "Siembra Ana Pérez",
      deConi: false,
      esPersona: true,
    },
    {
      id: "a",
      texto: "El deseo responde al contexto.",
      cita: "el deseo no se apaga, se esconde bajo la rutina diaria de la casa",
      aporte: "Su voz",
      autor: "Constanza del Rosario",
      deConi: true,
      esPersona: true,
    },
  ],
}

describe("huellaDeRespaldo", () => {
  it("is empty when the piece has no backing", () => {
    expect(huellaDeRespaldo(null)).toBe("")
  })

  it("does not depend on the order the claims were stored in", () => {
    const invertido = { ...RESPALDO, afirmaciones: [...RESPALDO.afirmaciones].reverse() }
    expect(huellaDeRespaldo(invertido)).toBe(huellaDeRespaldo(RESPALDO))
  })

  it("changes when any part of the theory or of a claim changes", () => {
    const base = huellaDeRespaldo(RESPALDO)
    const [primera, segunda] = RESPALDO.afirmaciones
    if (!primera || !segunda) throw new Error("fixture")
    expect(huellaDeRespaldo({ ...RESPALDO, teoria: { ...RESPALDO.teoria, tesis: "Otra tesis." } })).not.toBe(base)
    expect(huellaDeRespaldo({ ...RESPALDO, afirmaciones: [{ ...primera, cita: "otra cita" }, segunda] })).not.toBe(base)
    expect(huellaDeRespaldo({ ...RESPALDO, afirmaciones: [primera] })).not.toBe(base)
  })
})

describe("ajenoDelRespaldo", () => {
  it("keeps the quotes and names of third parties and leaves out Coni's own", () => {
    expect(ajenoDelRespaldo(RESPALDO)).toEqual({
      citas: ["Novelty is the fuel of desire"],
      autores: ["Siembra Ana Pérez"],
      personas: ["Siembra Ana Pérez"],
    })
  })

  it("has nothing to check when there is no backing", () => {
    expect(ajenoDelRespaldo(null)).toEqual({ citas: [], autores: [], personas: [] })
  })
})

describe("ajenoDelRespaldo personas", () => {
  it("lists as persona only third-party authors of type persona, never accounts, institutions or Coni", () => {
    const [persona, delRosario] = RESPALDO.afirmaciones
    if (!persona || !delRosario) throw new Error("fixture")
    const respaldo: Respaldo = {
      ...RESPALDO,
      afirmaciones: [
        persona,
        delRosario,
        { ...persona, id: "c", autor: "Cuenta Terapia", esPersona: false },
        { ...persona, id: "d", autor: "Instituto Gottman", esPersona: false },
      ],
    }
    expect(ajenoDelRespaldo(respaldo).personas).toEqual(["Siembra Ana Pérez"])
    expect(ajenoDelRespaldo(respaldo).autores).toEqual(["Siembra Ana Pérez", "Cuenta Terapia", "Instituto Gottman"])
  })
})

describe("paraElGuion", () => {
  it("sends the theory and the claims without ids or author names", () => {
    const datos = paraElGuion(RESPALDO)
    expect(datos).toEqual({
      teoria: {
        titulo: "El deseo se cuida",
        tesis: "El deseo baja con la rutina.",
        porQue: "Le pasa a muchas parejas.",
      },
      afirmaciones: [
        { texto: "La novedad aviva el deseo.", cita: "Novelty is the fuel of desire", aporte: "Explica el mecanismo" },
        {
          texto: "El deseo responde al contexto.",
          cita: "el deseo no se apaga, se esconde bajo la rutina diaria de la casa",
          aporte: "Su voz",
        },
      ],
    })
    expect(JSON.stringify(datos)).not.toContain("Siembra Ana")
  })
})
