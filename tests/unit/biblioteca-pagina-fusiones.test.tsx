import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true; destino: string } | { ok: false; error: string }

const { datos, acciones, replace } = vi.hoisted(() => ({
  replace: vi.fn(),
  datos: {
    leerFusiones: vi.fn(
      async (..._: unknown[]): Promise<unknown> => ({ propuestas: [], recientes: [], rechazadas: [] }),
    ),
  },
  acciones: {
    decidirFusionAccion: vi.fn(
      async (..._: unknown[]): Promise<Respuesta> => ({
        ok: true,
        destino: "/biblioteca/temas/fusiones?aviso=fusion-separada",
      }),
    ),
    deshacerFusionAccion: vi.fn(
      async (..._: unknown[]): Promise<Respuesta> => ({
        ok: false,
        error: "Después de esta fusión hubo otra con el mismo tema, así que no la puedo deshacer.",
      }),
    ),
    unirTemasAccion: vi.fn(
      async (..._: unknown[]): Promise<Respuesta> => ({ ok: true, destino: "/biblioteca/temas/fusiones" }),
    ),
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "coni@ejemplo.cl" } } }) },
    rpc: async () => ({ data: true, error: null }),
  }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (ruta: string) => {
    throw new Error(`NEXT_REDIRECT ${ruta}`)
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }),
}))
vi.mock("@/lib/datos/fusiones", () => datos)
vi.mock("@/app/(app)/biblioteca/temas/fusiones/acciones", () => acciones)

import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import { DecidirFusion, DeshacerFusion } from "@/app/(app)/biblioteca/temas/fusiones/botones-de-fusion"
import Fusiones from "@/app/(app)/biblioteca/temas/fusiones/page"
import {
  TarjetaDeFusionReciente,
  TarjetaDeParRechazado,
  TarjetaDePropuesta,
} from "@/app/(app)/biblioteca/temas/fusiones/tarjetas-de-fusion"
import { AVISOS_DE_FUSION } from "@/lib/dominio/fusiones"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}
const textos = (arbol: Elemento[]) =>
  arbol.map((e) => e.props.children).filter((c): c is string => typeof c === "string")

const ID = "11111111-2222-4333-8444-555555555555"
const PROPUESTA = {
  id: ID,
  ganador: "Deseo bajo",
  perdedor: "Poco deseo",
  razon: "Hablan de lo mismo.",
  motivo: "Claude no está seguro de que sean el mismo tema.",
}
const RECIENTE = {
  id: ID,
  ganador: "Sueño liviano",
  perdedor: "Dormir mal",
  razon: null,
  aplicadaEn: "2026-11-10T02:30:00Z",
}
const RECHAZADO = {
  a: ID,
  b: "22222222-2222-4333-8444-555555555555",
  nombreA: "Pausas",
  nombreB: "Descanso",
  origen: "coni" as const,
  razon: null,
}

const abrir = (params: Record<string, string> = {}) => Fusiones({ searchParams: Promise.resolve(params) })

beforeEach(() => vi.clearAllMocks())

describe("the Fusiones page", () => {
  it("says there are no merges yet when all three lists are empty", async () => {
    const arbol = elementos(await abrir())
    expect(textos(arbol)).toContain("Todavía no hay fusiones.")
    expect(textos(arbol)).not.toContain("Para que decidas")
  })

  it("shows the three sections with a card each, and the note the action left", async () => {
    datos.leerFusiones.mockResolvedValueOnce({
      propuestas: [PROPUESTA],
      recientes: [RECIENTE],
      rechazadas: [RECHAZADO],
    })
    const arbol = elementos(await abrir({ aviso: "fusion-separada" }))
    expect(textos(arbol)).toEqual(
      expect.arrayContaining(["Para que decidas", "Fusiones recientes", "Pares que no uní"]),
    )
    expect(textos(arbol)).not.toContain("Todavía no hay fusiones.")
    expect(arbol.find((e) => e.type === TarjetaDePropuesta)?.props.propuesta).toEqual(PROPUESTA)
    expect(arbol.find((e) => e.type === TarjetaDeFusionReciente)?.props.fusion).toEqual(RECIENTE)
    expect(arbol.find((e) => e.type === TarjetaDeParRechazado)?.props.par).toEqual(RECHAZADO)
    expect(arbol.find((e) => e.type === AvisoDeIdeas)?.props.texto).toBe(AVISOS_DE_FUSION["fusion-separada"])
  })
})

describe("the cards", () => {
  it("a proposal names both topics, Claude's reason, why it waits, and offers the three verdicts", () => {
    render(<TarjetaDePropuesta propuesta={PROPUESTA} />)
    expect(screen.getByRole("article", { name: "«Poco deseo» y «Deseo bajo»" })).toBeTruthy()
    expect(screen.getByText("Razón: Hablan de lo mismo.")).toBeTruthy()
    expect(screen.getByText("Claude no está seguro de que sean el mismo tema.")).toBeTruthy()
    for (const nombre of ["Son el mismo", "Uno es parte del otro", "Son distintos"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeTruthy()
    }
  })

  it("a recent merge says when, and a refused undo says why in line", async () => {
    render(<TarjetaDeFusionReciente fusion={RECIENTE} />)
    expect(screen.getByText("Uní «Dormir mal» con «Sueño liviano» el lunes 9 de noviembre.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, deshacer" }))
    await waitFor(() =>
      expect(
        screen.getByText("Después de esta fusión hubo otra con el mismo tema, así que no la puedo deshacer."),
      ).toBeTruthy(),
    )
    expect(acciones.deshacerFusionAccion).toHaveBeenCalledWith({ id: ID })
  })

  it("a rejected pair says who said no and offers «Unir igual»", () => {
    render(<TarjetaDeParRechazado par={RECHAZADO} />)
    expect(screen.getByText("Tú dijiste que son distintos.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Unir igual" })).toBeTruthy()
  })

  it("a verdict calls the action with the proposal and its answer", async () => {
    render(<DecidirFusion id={ID} describe="x" />)
    fireEvent.click(screen.getByRole("button", { name: "Son distintos" }))
    await waitFor(() => expect(acciones.decidirFusionAccion).toHaveBeenCalledWith({ id: ID, veredicto: "distintos" }))
  })

  it("Cancelar takes the question away and asks nothing", () => {
    render(<DeshacerFusion id={ID} ganador="A" perdedor="B" describe="x" />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeTruthy()
    expect(acciones.deshacerFusionAccion).not.toHaveBeenCalled()
  })
})
