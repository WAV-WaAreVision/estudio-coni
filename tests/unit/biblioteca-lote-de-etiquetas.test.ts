import { describe, expect, it } from "vitest"
import { CONFIRMADA_POR_TI, CORREGIDA_POR_TI, NOMBRE_DE_CAMPO } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import {
  type ItemDeLote,
  lineaDeEtiquetasPorRevisar,
  pendientesDeLote,
  porQueEstaAqui,
  progresoDeLote,
  TEXTOS_DE_REVISION,
  tarjetaDeItem,
} from "@/lib/dominio/biblioteca/lote-de-etiquetas"
import {
  afirmacionDePrueba,
  CATALOGO_DE_PRUEBA,
  ID_DE_AFIRMACION,
  MARCA_EMOCION_LINKEDIN,
  marcaDePrueba,
} from "../fixtures/afirmaciones"

const item = (extra: Partial<ItemDeLote> = {}): ItemDeLote => ({
  posicion: 1,
  afirmacionId: ID_DE_AFIRMACION,
  campo: "emocion",
  red: "linkedin",
  marcaId: MARCA_EMOCION_LINKEDIN,
  motivo: "certeza_baja",
  hecha: false,
  ...extra,
})

describe("porQueEstaAqui", () => {
  it("says why each motivo brought the tag, with the reason of an Otro", () => {
    expect(porQueEstaAqui("certeza_baja", null)).toBe("Claude no estaba segura")
    expect(porQueEstaAqui("otro", "Soledad en el trabajo")).toBe("Quedó en Otro: Soledad en el trabajo")
    expect(porQueEstaAqui("otro", null)).toBe("Quedó en Otro")
    expect(porQueEstaAqui("gancho", null)).toBe("Tipo de gancho sugerido")
    expect(porQueEstaAqui("sin_clasificar", null)).toBe("Quedó sin clasificar")
  })
})

describe("progresoDeLote and pendientesDeLote", () => {
  it("count the done items over the whole batch", () => {
    const items = [item(), item({ posicion: 2, hecha: true }), item({ posicion: 3 })]
    expect(progresoDeLote(items)).toBe("1 de 3")
    expect(pendientesDeLote(items)).toBe(2)
    expect(pendientesDeLote([])).toBe(0)
  })
})

describe("lineaDeEtiquetasPorRevisar", () => {
  it("says one tag in singular and several in plural", () => {
    expect(lineaDeEtiquetasPorRevisar(1)).toBe("Tienes 1 etiqueta para revisar")
    expect(lineaDeEtiquetasPorRevisar(4)).toBe("Tienes 4 etiquetas para revisar")
  })
})

describe("TEXTOS_DE_REVISION", () => {
  it("has the page's sentences", () => {
    expect(TEXTOS_DE_REVISION).toMatchObject({
      titulo: "Etiquetas para revisar",
      listo: "Listo por esta semana. El próximo lote llega el lunes.",
      vacio: "No hay etiquetas dudosas esta semana.",
      error: "No pude cargar las etiquetas. Vuelve a intentarlo en un rato.",
      verAfirmacion: "Ver la afirmación",
    })
  })
})

describe("tarjetaDeItem", () => {
  it("builds a pending mark's card: claim, author, tag and phrase, why, the network in the title, and the way to the claim", () => {
    expect(tarjetaDeItem(item(), afirmacionDePrueba(), CATALOGO_DE_PRUEBA)).toMatchObject({
      estado: "pendiente",
      posicion: 1,
      afirmacionId: ID_DE_AFIRMACION,
      campo: "emocion",
      red: "linkedin",
      marcaId: MARCA_EMOCION_LINKEDIN,
      texto: "El aislamiento pesa más que las horas extra.",
      autor: "Daniela Ruiz",
      titulo: "Emoción en LinkedIn",
      valor: "escepticismo",
      etiqueta: "Escepticismo",
      frase: "No me lo creo",
      motivo: "Claude no estaba segura",
      conFrase: true,
      confirmable: true,
      href: `/biblioteca/afirmaciones/${ID_DE_AFIRMACION}?desde=%2Fbiblioteca%2Fetiquetas%2Frevisar`,
    })
  })

  it("quotes the reason of a mark left in Otro", () => {
    const otro = marcaDePrueba({
      id: "aaaaaaaa-0000-4000-8000-000000000009",
      marca: "problema",
      valor: "otro",
      porQue: "Soledad",
      certeza: "media",
    })
    const tarjeta = tarjetaDeItem(
      item({ campo: "problema", marcaId: otro.id, motivo: "otro" }),
      afirmacionDePrueba({ marcas: [otro] }),
      CATALOGO_DE_PRUEBA,
    )
    expect(tarjeta).toMatchObject({
      estado: "pendiente",
      etiqueta: "Otro",
      porQue: "Soledad",
      motivo: "Quedó en Otro: Soledad",
      confirmable: true,
    })
  })

  it("offers no «Está bien» on a tipo still sin_clasificar", () => {
    const tarjeta = tarjetaDeItem(
      item({ campo: "tipo", red: "todas", marcaId: null, motivo: "sin_clasificar" }),
      afirmacionDePrueba({ tipo: "sin_clasificar" }),
      CATALOGO_DE_PRUEBA,
    )
    expect(tarjeta).toMatchObject({
      estado: "pendiente",
      titulo: NOMBRE_DE_CAMPO.tipo,
      etiqueta: "Sin clasificar",
      motivo: "Quedó sin clasificar",
      conFrase: false,
      confirmable: false,
    })
  })

  it("shows the hook type with the hook's phrase", () => {
    const tarjeta = tarjetaDeItem(
      item({ campo: "tipo_de_gancho", red: "todas", marcaId: null, motivo: "gancho" }),
      afirmacionDePrueba(),
      CATALOGO_DE_PRUEBA,
    )
    expect(tarjeta).toMatchObject({
      estado: "pendiente",
      titulo: "Tipo de gancho",
      valor: "verdad_incomoda",
      etiqueta: "Verdad incómoda",
      frase: "El aislamiento pesa más que las horas extra.",
      motivo: "Tipo de gancho sugerido",
      conFrase: false,
      confirmable: true,
    })
  })

  it("says how a done item ended: confirmed, corrected, its mark removed, or no longer pending", () => {
    const deConi = afirmacionDePrueba({
      marcas: [marcaDePrueba({ origen: "coni", certeza: "alta" })],
      correcciones: [
        {
          campo: "emocion",
          red: "linkedin",
          accion: "confirma",
          marcaId: MARCA_EMOCION_LINKEDIN,
          creadaEn: "2026-11-26T10:00:00+00:00",
        },
        { campo: "tipo", red: "todas", accion: "corrige", marcaId: null, creadaEn: "2026-11-26T10:01:00+00:00" },
      ],
    })
    expect(tarjetaDeItem(item({ hecha: true }), deConi, CATALOGO_DE_PRUEBA)).toMatchObject({
      estado: "hecha",
      etiqueta: "Escepticismo",
      revision: CONFIRMADA_POR_TI,
    })
    const tipo = item({ campo: "tipo", red: "todas", marcaId: null, motivo: "sin_clasificar", hecha: true })
    expect(tarjetaDeItem(tipo, deConi, CATALOGO_DE_PRUEBA)).toMatchObject({
      estado: "hecha",
      revision: CORREGIDA_POR_TI,
    })
    expect(tarjetaDeItem(item({ marcaId: null, hecha: true }), deConi, CATALOGO_DE_PRUEBA)).toMatchObject({
      estado: "hecha",
      etiqueta: null,
      revision: "Ya no está",
    })
    const evidencia = item({ campo: "evidencia", red: "todas", marcaId: null, motivo: "sin_clasificar", hecha: true })
    expect(tarjetaDeItem(evidencia, deConi, CATALOGO_DE_PRUEBA)).toMatchObject({
      estado: "hecha",
      revision: "Ya no está pendiente",
    })
  })

  it("has no card for a claim it cannot read, nor for a pending mark that is gone", () => {
    expect(tarjetaDeItem(item(), null, CATALOGO_DE_PRUEBA)).toBeNull()
    const otraFila = item({ marcaId: "aaaaaaaa-0000-4000-8000-00000000000f" })
    expect(tarjetaDeItem(otraFila, afirmacionDePrueba(), CATALOGO_DE_PRUEBA)).toBeNull()
  })
})
