// @vitest-environment node
import { describe, expect, it } from "vitest"
import { leerRespaldo, respaldoAJson } from "@/lib/datos/respaldo"
import {
  afirmacionesDelRespaldo,
  ajenoDelRespaldo,
  huellaDeRespaldo,
  MAXIMO_AFIRMACIONES_DE_RESPALDO,
  paraElGuion,
  type Respaldo,
} from "@/lib/dominio/respaldo"

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
      citadas: [],
    })
  })

  it("has nothing to check when there is no backing", () => {
    expect(ajenoDelRespaldo(null)).toEqual({ citas: [], autores: [], personas: [], citadas: [] })
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

// A backing stored before sources existed, exactly as production keeps it.
const GUARDADO = {
  teoria: { id: "t1", titulo: "T", tesis: "Te", porQue: "P" },
  afirmaciones: [
    { id: "a2", texto: "x2", cita: "c2", aporte: "ap2", autor: "Ana Pérez", deConi: false, esPersona: true },
    { id: "a1", texto: "x1", cita: "c1", aporte: "ap1", autor: "OMS", deConi: false, esPersona: false },
  ],
}

describe("respaldo guardado antes de las fuentes", () => {
  it("hashes byte for byte as before (gate 1, formula 3)", () => {
    expect(huellaDeRespaldo(leerRespaldo(GUARDADO))).toBe(
      '["t1","T","Te","P",[["a1","x1","c1","ap1","OMS",false,false],["a2","x2","c2","ap2","Ana Pérez",false,true]]]',
    )
  })

  it("writes back the same JSON", () => {
    expect(respaldoAJson(leerRespaldo(GUARDADO))).toEqual(GUARDADO)
  })
})

describe("respaldo con fuente", () => {
  const conFuente = {
    ...GUARDADO,
    afirmaciones: GUARDADO.afirmaciones.map((a) => ({
      ...a,
      fuente: { autor: a.autor, titulo: "Informe", anio: 2025 },
    })),
  }

  it("signs the source it shows", () => {
    expect(huellaDeRespaldo(leerRespaldo(conFuente))).toContain('"OMS","Informe",2025')
  })

  it("keeps the source when written back", () => {
    expect(respaldoAJson(leerRespaldo(conFuente))).toEqual(conFuente)
  })

  it("lists the cited authors for the revision", () => {
    expect(ajenoDelRespaldo(leerRespaldo(conFuente)).citadas).toEqual(["Ana Pérez", "OMS"])
  })
})

describe("afirmacionesDelRespaldo", () => {
  const de = (id: string, evidencia: string) => ({ id, evidencia })

  it("keeps studies and clinical practice first, then the lowest ids, and returns them by id", () => {
    const elegidas = afirmacionesDelRespaldo(
      [de("d", "opinion"), de("z", "estudio"), de("a", "opinion"), de("y", "clinica"), de("b", "opinion")],
      4,
    )
    expect(elegidas.map((a) => a.id)).toEqual(["a", "b", "y", "z"])
  })

  it("caps at MAXIMO_AFIRMACIONES_DE_RESPALDO by default", () => {
    const muchas = Array.from({ length: 15 }, (_, i) => de(String(i).padStart(2, "0"), "opinion"))
    expect(afirmacionesDelRespaldo(muchas)).toHaveLength(MAXIMO_AFIRMACIONES_DE_RESPALDO)
  })
})
