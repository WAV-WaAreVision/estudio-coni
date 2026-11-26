import { describe, expect, it } from "vitest"
import { vocabularioDeRespuesta } from "@/lib/datos/vocabulario"
import { FILAS_DE_VOCABULARIO } from "../fixtures/vocabulario"

describe("vocabularioDeRespuesta", () => {
  it("reads a value whose optional fields come back as null and drops the nulls", () => {
    const filas = FILAS_DE_VOCABULARIO.map((f) =>
      f.lista === "emocion"
        ? {
            ...f,
            valores: [
              {
                valor: "otra",
                etiqueta: "Otra",
                descripcion: null,
                grupo: "problema",
                activacion: null,
                retirado: null,
              },
              ...f.valores.slice(1),
            ],
          }
        : f,
    )
    const vocab = vocabularioDeRespuesta(filas)
    const otra = vocab.emocion.todas.valores.find((v) => v.valor === "otra")
    expect(otra).toEqual({ valor: "otra", etiqueta: "Otra", grupo: "problema" })
  })
})
