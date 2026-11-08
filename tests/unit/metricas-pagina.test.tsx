// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { modelo } = vi.hoisted(() => ({
  modelo: {
    valor: {
      mes: "noviembre",
      resumen: "",
      contacto: "",
      aviso: null,
      vacio: true,
      periodo: "",
      grupos: [],
      semanas: [],
      comparacion: null as unknown,
    },
  },
}))
vi.mock("@/lib/sesion/coni", () => ({ exigirConi: async () => ({ estado: "coni", db: {} }) }))
vi.mock("@/lib/datos/metricas", () => ({ leerDatosDeMetricas: async () => ({ zona: "America/Santiago" }) }))
vi.mock("@/lib/datos/metricas-linkedin", () => ({
  leerLinkedinParaAnotar: async () => ({ posts: [], seguidores: null, seguidoresAutomaticos: false }),
}))
vi.mock("@/lib/metricas/modelo", () => ({ construirMetricas: () => modelo.valor }))
vi.mock("@/app/(app)/metricas/acciones", () => ({ anotarNumerosDeLinkedinAccion: vi.fn() }))

import type { ReactElement, ReactNode } from "react"
import Metricas from "@/app/(app)/metricas/page"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode; className?: string }>

function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

async function porTestId(testId: string): Promise<Elemento | undefined> {
  return elementos(await Metricas()).find((elemento) => elemento.props["data-testid"] === testId)
}

const clases = (elemento: Elemento | undefined) => (elemento?.props.className ?? "").split(/\s+/)

beforeEach(() => {
  modelo.valor.comparacion = null
})

describe("the Métricas page on a computer (issue 103)", () => {
  it("puts the month's figures beside the theme comparison when there is one", async () => {
    modelo.valor.comparacion = { tipo: "sin_numeros", titulo: "Todavía no hay con qué comparar", texto: "" }
    expect(clases(await porTestId("metricas-cifras"))).toContain("md:grid-cols-2")
    expect(await porTestId("metricas-cabecera")).toBeDefined()
    expect(await porTestId("metricas-comparacion")).toBeDefined()
  })

  it("leaves the month's figures alone in their row, not in half of an empty one, without a comparison", async () => {
    expect(clases(await porTestId("metricas-cifras"))).not.toContain("md:grid-cols-2")
    expect(await porTestId("metricas-comparacion")).toBeUndefined()
  })
})
