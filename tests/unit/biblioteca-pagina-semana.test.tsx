// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    leerSemana: vi.fn(
      async (..._: unknown[]): Promise<unknown> => ({
        corrida: null,
        teorias: [],
        descartadas: [],
        queSubir: null,
      }),
    ),
    leerCostosDelMotor: vi.fn(async (..._: unknown[]): Promise<number[]> => [0.2, 0.25, 0.3]),
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "alguien@ejemplo.cl" } } }) },
    rpc: async () => ({ data: esConi.valor, error: null }),
  }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (ruta: string) => {
    throw new Error(`NEXT_REDIRECT ${ruta}`)
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/lib/datos/semana", () => datos)
// No provider paused: the pages read the open pauses through the same session.
vi.mock("@/lib/datos/pausas", () => ({ leerPausasAbiertas: async () => [] }))
vi.mock("@/app/(app)/biblioteca/semana/acciones", () => ({ proponerAhoraAccion: vi.fn() }))

import type { ReactElement, ReactNode } from "react"
import { NavDeBiblioteca } from "@/app/(app)/biblioteca/nav-de-biblioteca"
import Semana from "@/app/(app)/biblioteca/semana/page"
import { VistaDeSemana } from "@/app/(app)/biblioteca/semana/vista-de-semana"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

beforeEach(() => vi.clearAllMocks())

describe("the Semana page", () => {
  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(Semana()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerSemana).not.toHaveBeenCalled()
  })

  it("reads the week and the costs with her client, estimates the cost and draws the Semana tab", async () => {
    esConi.valor = true
    const vista = elementos(await Semana()).find((elemento) => elemento.type === VistaDeSemana)
    expect(vista?.props.costoUsd).toBe(0.25)
    expect(vista?.props.semana).toEqual({ corrida: null, teorias: [], descartadas: [], queSubir: null })
    expect(datos.leerSemana).toHaveBeenCalledTimes(1)
    expect(datos.leerCostosDelMotor).toHaveBeenCalledTimes(1)
    const encabezado = elementos(vista?.props.encabezado as ReactNode)
    expect(encabezado.find((elemento) => elemento.type === "h1")?.props.children).toBe("Biblioteca")
    expect(encabezado.find((elemento) => elemento.type === NavDeBiblioteca)?.props.actual).toBe("semana")
  })
})
