// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { modelo } = vi.hoisted(() => ({
  modelo: {
    valor: {
      mes: {
        nombre: "noviembre",
        celdas: [],
        porSubir: [] as unknown[],
        proximos: [] as unknown[],
        sinPublicaciones: false,
      },
      agenda: { semanas: [], porRepartir: [], alternativas: [] },
      ritmo: {},
    },
  },
}))
vi.mock("@/lib/sesion/coni", () => ({ exigirConi: async () => ({ estado: "coni", db: {} }) }))
vi.mock("@/lib/datos/calendario", () => ({ leerDatosDeCalendario: async () => ({}) }))
vi.mock("@/lib/calendario/modelo", () => ({ construirCalendario: () => modelo.valor }))
vi.mock("@/app/(app)/calendario/acciones", () => ({ cambiarPropuestaAccion: vi.fn(), repartirFechasAccion: vi.fn() }))

import type { ReactElement, ReactNode } from "react"
import Calendario from "@/app/(app)/calendario/page"
import { AgendaDelCalendario } from "@/components/agenda-del-calendario"
import { RitmoDelCalendario } from "@/components/ritmo-del-calendario"
import { VistasDelCalendario } from "@/components/vistas-del-calendario"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode; className?: string }>

function hijos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(hijos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  return [nodo as Elemento]
}

function buscarPadre(nodo: ReactNode, coincide: (hijo: Elemento) => boolean): Elemento | null {
  for (const elemento of hijos(nodo)) {
    if (hijos(elemento.props.children).some(coincide)) return elemento
    const encontrado = buscarPadre(elemento.props.children, coincide)
    if (encontrado) return encontrado
  }
  return null
}

/** The element whose direct child matches. */
function padreDe(nodo: ReactNode, coincide: (hijo: Elemento) => boolean): Elemento {
  const padre = buscarPadre(nodo, coincide)
  if (!padre) throw new Error("No encontré el elemento")
  return padre
}

async function pagina(vista?: string): Promise<Elemento> {
  return (await Calendario({ searchParams: Promise.resolve({ vista }) })) as Elemento
}

const clases = (elemento: Elemento) => (elemento.props.className ?? "").split(/\s+/)

beforeEach(() => {
  modelo.valor.mes.porSubir = []
  modelo.valor.mes.proximos = []
})

describe("the Calendario page on a computer (issue 103)", () => {
  it("keeps the page wide in every view, so the header and the tabs never move when she switches", async () => {
    for (const vista of ["mes", "agenda", "ritmo"]) {
      expect((await pagina(vista)).props["data-ancho"]).toBe("pagina")
    }
  })

  it("holds the tabs at the reading width in every view, so the bar keeps one width", async () => {
    for (const vista of ["mes", "agenda", "ritmo"]) {
      const arbol = await pagina(vista)
      expect(clases(padreDe(arbol, (hijo) => hijo.type === VistasDelCalendario))).toContain("md:max-w-[42rem]")
    }
  })

  it("holds Agenda and Ritmo at the reading width instead of stretching them across the page", async () => {
    expect(clases(padreDe(await pagina("agenda"), (hijo) => hijo.type === AgendaDelCalendario))).toContain(
      "md:max-w-[42rem]",
    )
    expect(clases(padreDe(await pagina("ritmo"), (hijo) => hijo.type === RitmoDelCalendario))).toContain(
      "md:max-w-[42rem]",
    )
  })

  it("gives the month the whole width when there is nothing for the side panel", async () => {
    const mes = padreDe(await pagina("mes"), (hijo) => hijo.props["data-testid"] === "pagina-principal")
    expect(clases(mes)).not.toContain("md:grid")
  })

  it("puts the month and the side panel in two columns when there is something to upload", async () => {
    modelo.valor.mes.porSubir = [{ piezaId: "p", titulo: "Una pieza", pendientes: "Instagram", fecha: "hoy" }]
    const mes = padreDe(await pagina("mes"), (hijo) => hijo.props["data-testid"] === "pagina-principal")
    expect(clases(mes)).toContain("md:grid")
  })
})
