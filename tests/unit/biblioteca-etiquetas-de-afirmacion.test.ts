import { describe, expect, it } from "vitest"
import {
  agruparMarcas,
  CONFIRMADA_POR_TI,
  CORREGIDA_POR_TI,
  catalogoDeFilas,
  esAfirmacionNueva,
  esMarca,
  etiquetaDe,
  hrefDeAfirmacion,
  insigniasDeIdea,
  insigniasPorIdea,
  opcionesDe,
  pidePorQue,
  RECHAZOS_DE_ETIQUETA,
  revisionDe,
  tituloDeEtiqueta,
  volverDesde,
  YA_NO_ESTA,
} from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import type { FilaDeVocabulario } from "@/lib/dominio/vocabulario"
import {
  afirmacionAntiguaDePrueba,
  afirmacionDePrueba,
  CATALOGO_DE_PRUEBA,
  ID_DE_AFIRMACION,
  ID_DE_MATERIAL,
  marcaDePrueba,
} from "../fixtures/afirmaciones"
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

describe("esAfirmacionNueva", () => {
  it("reads the column the migration set: old only when marked old, new with zero marks otherwise", () => {
    expect(esAfirmacionNueva(afirmacionDePrueba())).toBe(true)
    expect(esAfirmacionNueva(afirmacionAntiguaDePrueba())).toBe(false)
    expect(esAfirmacionNueva(afirmacionDePrueba({ marcas: [], gancho: null }))).toBe(true)
    expect(esAfirmacionNueva(afirmacionDePrueba({ etiquetasAntiguas: true }))).toBe(false)
  })
})

describe("agruparMarcas", () => {
  it("puts each mark under its network and field, and dato and caso apart, in the order read", () => {
    const problema = marcaDePrueba({ id: "p1", marca: "problema", valor: "rrhh_tarde" })
    const otroProblema = marcaDePrueba({ id: "p2", marca: "problema", valor: "otro", porQue: "Soledad" })
    const caso = marcaDePrueba({ id: "c1", marca: "caso", red: "todas", valor: "Una gerenta" })
    const perdida = marcaDePrueba({ id: "x1", marca: "publico", red: "todas", valor: "gerencia" })
    const grupos = agruparMarcas([...afirmacionDePrueba().marcas, problema, otroProblema, caso, perdida])
    expect(grupos.linkedin.emocion.map((m) => m.valor)).toEqual(["escepticismo"])
    expect(grupos.instagram.emocion.map((m) => m.valor)).toEqual(["curiosidad"])
    expect(grupos.linkedin.problema.map((m) => m.id)).toEqual(["p1", "p2"])
    expect(grupos.instagram.problema).toEqual([])
    expect(grupos.dato.map((m) => m.valor)).toEqual(["70 %"])
    expect(grupos.caso.map((m) => m.id)).toEqual(["c1"])
    expect([...grupos.linkedin.publico, ...grupos.instagram.publico]).toEqual([])
  })
})

describe("revisionDe", () => {
  const en = (minuto: number) => `2026-11-26T10:0${minuto}:00+00:00`
  it("says the latest of Coni's actions on that field and network, and nothing without one", () => {
    const correcciones = [
      { campo: "emocion" as const, red: "instagram" as const, accion: "confirma" as const, creadaEn: en(1) },
      { campo: "emocion" as const, red: "instagram" as const, accion: "corrige" as const, creadaEn: en(2) },
      { campo: "tipo" as const, red: "todas" as const, accion: "confirma" as const, creadaEn: en(3) },
      { campo: "problema" as const, red: "linkedin" as const, accion: "quita" as const, creadaEn: en(4) },
    ]
    expect(revisionDe(correcciones, "emocion", "instagram")).toBe(CORREGIDA_POR_TI)
    expect(revisionDe(correcciones, "tipo", "todas")).toBe(CONFIRMADA_POR_TI)
    expect(revisionDe(correcciones, "emocion", "linkedin")).toBeNull()
    expect(revisionDe(correcciones, "problema", "linkedin")).toBeNull()
    expect([CORREGIDA_POR_TI, CONFIRMADA_POR_TI]).toEqual(["Corregida por ti", "Confirmada por ti"])
  })
})

describe("insigniasDeIdea", () => {
  const emocion = (
    red: "linkedin" | "instagram",
    valor: string,
    certeza: "alta" | "media" | "baja",
    origen: "extraccion" | "coni" = "extraccion",
    creadaEn = "2026-11-26T10:00:00+00:00",
  ) => ({ afirmacionId: ID_DE_AFIRMACION, red, valor, certeza, origen, creadaEn })

  it("gives tipo, evidencia and one emotion per network: Coni's first, then the most certain", () => {
    expect(
      insigniasDeIdea(
        { tipo: "consejo", evidencia: "clinica" },
        [
          emocion("linkedin", "agobio", "media"),
          emocion("linkedin", "calma", "alta"),
          emocion("instagram", "alivio", "alta"),
          emocion("instagram", "curiosidad", "baja", "coni"),
        ],
        C,
      ),
    ).toEqual({
      tipo: "Consejo",
      evidencia: "Práctica profesional",
      emociones: [
        { red: "linkedin", etiqueta: "Calma" },
        { red: "instagram", etiqueta: "Curiosidad" },
      ],
    })
  })

  it("breaks a tie of origin and certainty with the oldest emotion, whatever order they come in", () => {
    const insignias = insigniasDeIdea(
      { tipo: "consejo", evidencia: "clinica" },
      [
        emocion("linkedin", "agobio", "alta", "extraccion", "2026-11-26T10:05:00+00:00"),
        emocion("linkedin", "calma", "alta", "extraccion", "2026-11-26T09:59:00Z"),
        emocion("instagram", "alivio", "media", "coni", "2026-11-26T11:00:00+00:00"),
        emocion("instagram", "curiosidad", "media", "coni", "2026-11-26T10:30:00+00:00"),
      ],
      C,
    )
    expect(insignias.emociones).toEqual([
      { red: "linkedin", etiqueta: "Calma" },
      { red: "instagram", etiqueta: "Curiosidad" },
    ])
  })

  it("gives an old claim only tipo and evidencia, and builds one entry per idea", () => {
    const mapa = insigniasPorIdea(
      [
        { id: "a", tipo: "sin_clasificar", evidencia: "opinion" },
        { id: "b", tipo: "mito", evidencia: "estudio" },
      ],
      [{ ...emocion("linkedin", "sorpresa", "alta"), afirmacionId: "b" }],
      C,
    )
    expect(mapa.get("a")).toEqual({ tipo: "Sin clasificar", evidencia: "Opinión", emociones: [] })
    expect(mapa.get("b")?.emociones).toEqual([{ red: "linkedin", etiqueta: "Sorpresa" }])
  })
})

describe("the claim's address and the way back", () => {
  const AUTOR = "/biblioteca/autores/99999999-2222-4333-8444-555555555555"

  it("keeps where she came from in the address", () => {
    expect(hrefDeAfirmacion(ID_DE_AFIRMACION)).toBe(`/biblioteca/afirmaciones/${ID_DE_AFIRMACION}`)
    expect(hrefDeAfirmacion(ID_DE_AFIRMACION, AUTOR)).toBe(
      `/biblioteca/afirmaciones/${ID_DE_AFIRMACION}?desde=${encodeURIComponent(AUTOR)}`,
    )
  })

  it("goes back to an author, topic, material or hook page it came from, else to the claim's material", () => {
    expect(volverDesde({ desde: AUTOR }, ID_DE_MATERIAL)).toEqual({ href: AUTOR, texto: "Autor" })
    expect(volverDesde({ desde: AUTOR.replace("autores", "temas") }, ID_DE_MATERIAL).texto).toBe("Tema")
    expect(volverDesde({ desde: AUTOR.replace("autores", "ganchos") }, ID_DE_MATERIAL).texto).toBe("Gancho")
    const alMaterial = { href: `/biblioteca/materiales/${ID_DE_MATERIAL}`, texto: "Material" }
    expect(volverDesde({}, ID_DE_MATERIAL)).toEqual(alMaterial)
    expect(volverDesde({ desde: "https://otro.sitio/biblioteca/autores/x" }, ID_DE_MATERIAL)).toEqual(alMaterial)
    expect(volverDesde({ desde: "/ajustes" }, ID_DE_MATERIAL)).toEqual(alMaterial)
    expect(volverDesde({ desde: [AUTOR, "/x"] }, ID_DE_MATERIAL)).toEqual({ href: AUTOR, texto: "Autor" })
  })
})

describe("RECHAZOS_DE_ETIQUETA", () => {
  it("says every refusal Coni can cause in her words; the ones only a bug causes stay out", () => {
    expect(Object.keys(RECHAZOS_DE_ETIQUETA).sort()).toEqual([
      "afirmacion_antigua",
      "afirmacion_inexistente",
      "falta_frase",
      "falta_por_que",
      "marca_ambigua",
      "sin_gancho",
      "sin_marca",
      "valor_fuera_de_lista",
    ])
    expect(RECHAZOS_DE_ETIQUETA.falta_por_que).toBe("Escribe en una línea por qué.")
  })
})
