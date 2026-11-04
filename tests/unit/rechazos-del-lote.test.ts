// @vitest-environment node
import { describe, expect, it } from "vitest"
import { explicarRechazoDelLote } from "@/lib/datos/pilares-por-red"

const LOTE = "pilares-por-red-2026-11"
const ID = "11111111-1111-4111-8111-111111111111"
const explica = (message: string, details: string | null = null) => explicarRechazoDelLote({ message, details }, LOTE)

describe("los rechazos del lote, en palabras para Federico", () => {
  it.each([
    [
      "lote_ya_aplicado",
      null,
      `El lote ${LOTE} ya está aplicado. Para aplicarlo de nuevo, primero corre pnpm pilares:deshacer.`,
    ],
    ["lote_inexistente", null, `El lote ${LOTE} no está aplicado: no hay nada que deshacer.`],
    ["lote_vacio", null, "El CSV no trae ningún tema: no hay nada que aplicar."],
    [
      "filas_invalidas",
      "temas[2].tema_id",
      "El CSV tiene una fila mal armada (temas[2].tema_id). Vuelve a generarlo con pnpm pilares:proponer.",
    ],
    [
      "filas_invalidas",
      null,
      "Un tema del CSV tiene sus pilares mal armados. Vuelve a generarlo con pnpm pilares:proponer.",
    ],
    ["filas_repetidas", ID, `El id ${ID} aparece dos veces en el CSV. Deja una sola fila.`],
    ["tema_inexistente", ID, `El tema ${ID} no existe o se fusionó con otro. Sácalo del CSV y vuelve a aplicar.`],
    [
      "tema_ya_tiene_pilares",
      ID,
      `El tema ${ID} ya tiene pilares (los puso Coni o la ingesta). Sácalo del CSV y vuelve a aplicar.`,
    ],
    ["idea_inexistente", ID, `La idea ${ID} no existe. Sácala del CSV y vuelve a aplicar.`],
    [
      "idea_fuera_del_banco",
      ID,
      `La idea ${ID} ya no está en el banco (se usó o se descartó). Sácala del CSV y vuelve a aplicar.`,
    ],
    [
      "idea_en_pilar_retirado",
      null,
      "Quedan ideas del banco en un pilar anterior que el CSV no mueve. Agrégalas al CSV con su pilar nuevo, o vuelve a correr pnpm pilares:proponer.",
    ],
    ["pilar_desconocido", "otro-pilar", "«otro-pilar» no es un pilar activo de una red. Corrígelo en el CSV."],
    [
      "pilar_desconocido",
      null,
      "Un tema del CSV tiene un pilar que no es un pilar activo de una red. Corrígelo en el CSV.",
    ],
    ["pilar_repetido", null, "Un tema del CSV repite un pilar. Corrígelo en el CSV."],
    ["dos_principales", null, "Un tema del CSV tiene dos pilares principales en la misma red. Corrígelo en el CSV."],
    [
      "secundario_sin_principal",
      null,
      "Un tema del CSV tiene un secundario en una red donde no tiene pilar. Corrígelo en el CSV.",
    ],
    ["fuerza_invalida", null, "Un tema del CSV tiene un pilar con una fuerza que no corresponde. Corrígelo en el CSV."],
  ])("explains %s (%s)", (codigo, detalle, mensaje) => {
    expect(explica(codigo, detalle)).toBe(mensaje)
  })

  it("keeps what the database said when it is something else", () => {
    expect(explica("permission denied for function aplicar_lote_de_pilares", "algo")).toBe(
      "La base rechazó el lote: permission denied for function aplicar_lote_de_pilares (algo).",
    )
  })

  it("never shows an em dash", () => {
    expect(explica("lote_ya_aplicado")).not.toMatch(/[—–]/)
  })
})
