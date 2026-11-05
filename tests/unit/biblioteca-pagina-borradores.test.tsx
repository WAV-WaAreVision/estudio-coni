import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { esConi, datos, pilares, acciones } = vi.hoisted(() => ({
  esConi: { valor: true },
  datos: {
    listarBorradores: vi.fn(async (): Promise<unknown> => ({ pilares: [], redes: [] })),
    leerBorrador: vi.fn(async (..._: unknown[]): Promise<unknown> => null),
    contarBorradores: vi.fn(async (): Promise<number> => 0),
  },
  pilares: { etapasDeRed: vi.fn(async (..._: unknown[]): Promise<unknown> => []) },
  acciones: {
    descartarBorradorAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
    guardarBorradorDePilarAccion: vi.fn(),
    editarBorradorDePilarAccion: vi.fn(),
    guardarBorradorDeRedAccion: vi.fn(),
    editarBorradorDeRedAccion: vi.fn(),
    aprobarBorradorDePilarAccion: vi.fn(),
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "coni@ejemplo.cl" } } }) },
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
vi.mock("@/lib/datos/borradores", () => datos)
vi.mock("@/lib/datos/pilares", () => pilares)
vi.mock("@/app/(app)/biblioteca/temas/borradores/acciones", () => acciones)

import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import { AprobarPilar } from "@/app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar"
import AprobarBorrador from "@/app/(app)/biblioteca/temas/borradores/[id]/aprobar/page"
import EditarBorrador from "@/app/(app)/biblioteca/temas/borradores/[id]/editar/page"
import { BotonDescartar } from "@/app/(app)/biblioteca/temas/borradores/boton-descartar"
import Borradores from "@/app/(app)/biblioteca/temas/borradores/page"
import {
  TarjetaDeBorradorDePilar,
  TarjetaDeBorradorDeRed,
} from "@/app/(app)/biblioteca/temas/borradores/tarjetas-de-borrador"
import { FormularioDePilar } from "@/app/(app)/biblioteca/temas/formulario-de-pilar"
import { FormularioDeRed } from "@/app/(app)/biblioteca/temas/formulario-de-red"
import { TrasElAviso } from "@/app/(app)/biblioteca/tras-el-aviso"
import { AVISOS, type BorradorDePilar, type BorradorDeRed } from "@/lib/dominio/biblioteca/borradores"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const textos = (arbol: Elemento[]) =>
  arbol.map((elemento) => elemento.props.children).filter((c): c is string => typeof c === "string")

const ID_1 = "11111111-2222-4333-8444-555555555555"
const ID_2 = "22222222-2222-4333-8444-555555555555"
const ID_3 = "33333333-2222-4333-8444-555555555555"
const DE_INSTAGRAM: BorradorDePilar = {
  id: ID_1,
  red: "instagram",
  nombre: "Cuerpo y pantalla",
  nombreCorto: "Cuerpo y pantalla",
  descripcion: "Lo que el cuerpo dice frente a la pantalla.",
  peso: 12.5,
}
const DE_LINKEDIN: BorradorDePilar = {
  ...DE_INSTAGRAM,
  id: ID_2,
  red: "linkedin",
  nombre: "Liderazgo sereno",
  nombreCorto: "Sereno",
}
const RED: BorradorDeRed = { id: ID_3, nombre: "TikTok", manual: "Videos cortos.", receta: "", conexion: "" }
const conParams = (params: Record<string, string>) => ({ searchParams: Promise.resolve(params) })
const conId = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.clearAllMocks())

describe("the Borradores page", () => {
  it("groups pillar drafts by network, LinkedIn first, then the network drafts", async () => {
    datos.listarBorradores.mockResolvedValueOnce({ pilares: [DE_INSTAGRAM, DE_LINKEDIN], redes: [RED] })
    const arbol = elementos(await Borradores(conParams({})))
    expect(textos(arbol)).toEqual(
      expect.arrayContaining(["Borradores", "Pilares de LinkedIn", "Pilares de Instagram", "Redes"]),
    )
    const tarjetas = arbol.filter((e) => e.type === TarjetaDeBorradorDePilar || e.type === TarjetaDeBorradorDeRed)
    expect(tarjetas.map((e) => (e.props.borrador as { id: string }).id)).toEqual([ID_2, ID_1, ID_3])
  })

  it("says there are none, and says the note an edit or a discard left", async () => {
    const arbol = elementos(await Borradores(conParams({ aviso: "borrador-descartado" })))
    expect(textos(arbol)).toContain("No tienes borradores. Agrega un pilar o una red desde Temas.")
    expect(arbol.find((e) => e.type === AvisoDeIdeas)?.props.texto).toBe(AVISOS["borrador-descartado"])
    expect(arbol.find((e) => e.type === TrasElAviso)?.props).toEqual({ parametro: "aviso" })
  })

  it("is not for anybody but Coni", async () => {
    esConi.valor = false
    await expect(Borradores(conParams({}))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.listarBorradores).not.toHaveBeenCalled()
    esConi.valor = true
  })
})

describe("the cards", () => {
  it("shows a pillar draft with Aprobar, Editar and Descartar, each named by the draft", () => {
    render(<TarjetaDeBorradorDePilar borrador={DE_INSTAGRAM} />)
    const tarjeta = screen.getByRole("article", { name: "Cuerpo y pantalla" })
    expect(tarjeta).toHaveTextContent("Nombre corto: Cuerpo y pantalla · Peso: 12,5 %")
    expect(tarjeta).toHaveTextContent("Lo que el cuerpo dice frente a la pantalla.")
    expect(screen.getByRole("link", { name: "Aprobar" })).toHaveAttribute(
      "href",
      `/biblioteca/temas/borradores/${ID_1}/aprobar`,
    )
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      `/biblioteca/temas/borradores/${ID_1}/editar`,
    )
    expect(screen.getByRole("button", { name: "Descartar" })).toHaveAccessibleDescription("Cuerpo y pantalla")
  })

  it("shows a network draft waiting for its connection, with its notes, Editar and Descartar only", () => {
    render(<TarjetaDeBorradorDeRed borrador={RED} />)
    const tarjeta = screen.getByRole("article", { name: "TikTok" })
    expect(tarjeta).toHaveTextContent("Esperando conexión")
    expect(tarjeta).toHaveTextContent("Manual: Videos cortos.")
    expect(tarjeta).not.toHaveTextContent("Receta:")
    expect(screen.queryByRole("link", { name: "Aprobar" })).toBeNull()
    expect(screen.getByRole("link", { name: "Editar" })).toBeInTheDocument()
  })
})

describe("BotonDescartar", () => {
  it("asks before discarding, sends the draft, and Cancelar gives the focus back", async () => {
    render(<BotonDescartar tipo="pilar" id={ID_1} nombre="Cuerpo y pantalla" describe="titulo" />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    expect(screen.getByText("¿Descartar «Cuerpo y pantalla»? Ya no lo podrás aprobar ni editar.")).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Descartar" })).toHaveFocus())
    expect(acciones.descartarBorradorAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(acciones.descartarBorradorAccion).toHaveBeenCalledWith({ tipo: "pilar", id: ID_1 }))
  })
})

describe("the edit page", () => {
  it("opens the pillar form or the network form, prefilled, and returns to Borradores", async () => {
    datos.leerBorrador.mockResolvedValueOnce({ tipo: "pilar", borrador: DE_LINKEDIN })
    let arbol = elementos(await EditarBorrador(conId(ID_2)))
    expect(arbol.find((e) => e.type === FormularioDePilar)?.props).toEqual({
      modo: { tipo: "editar", id: ID_2 },
      inicial: {
        nombre: "Liderazgo sereno",
        nombreCorto: "Sereno",
        descripcion: DE_LINKEDIN.descripcion,
        peso: "12,5",
      },
      cancelar: "/biblioteca/temas/borradores",
    })
    expect(textos(arbol)).toContain("Red: LinkedIn")
    datos.leerBorrador.mockResolvedValueOnce({ tipo: "red", borrador: RED })
    arbol = elementos(await EditarBorrador(conId(ID_3)))
    expect(arbol.find((e) => e.type === FormularioDeRed)?.props.modo).toEqual({ tipo: "editar", id: ID_3 })
  })

  it("is not found for what is not an id, or a draft decided or gone", async () => {
    await expect(EditarBorrador(conId("no-es-un-id"))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerBorrador).not.toHaveBeenCalled()
    await expect(EditarBorrador(conId(ID_1))).rejects.toThrow("NEXT_NOT_FOUND")
  })
})

describe("the approval page", () => {
  it("hands the editor today's stage and each later one of the network, with the new pillar in every stage", async () => {
    datos.leerBorrador.mockResolvedValueOnce({ tipo: "pilar", borrador: DE_LINKEDIN })
    // The page passes today's date in Chile: the first stage is that date, whatever day the test runs.
    pilares.etapasDeRed.mockImplementationOnce(async (...args: unknown[]) => [
      {
        desde: String(args[2]),
        pesos: [{ id: "a", slug: "x", nombreCorto: "Diagnóstico doble", peso: 30 }],
        total: 30,
        sumaCien: false,
      },
      {
        desde: "2099-01-01",
        pesos: [{ id: "a", slug: "x", nombreCorto: "Diagnóstico doble", peso: 25 }],
        total: 25,
        sumaCien: false,
      },
    ])
    const arbol = elementos(await AprobarBorrador(conId(ID_2)))
    expect(pilares.etapasDeRed).toHaveBeenCalledWith(
      expect.anything(),
      "linkedin",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    )
    const props = arbol.find((e) => e.type === AprobarPilar)?.props
    expect(props?.borrador).toEqual(DE_LINKEDIN)
    expect(props?.cancelar).toBe("/biblioteca/temas/borradores")
    expect(props?.etapas).toEqual([
      {
        desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        esHoy: true,
        etiqueta: "Hoy",
        filas: [
          { clave: "a", nombre: "Diagnóstico doble", peso: "30" },
          { clave: "nuevo", nombre: "Sereno", peso: "12,5" },
        ],
      },
      {
        desde: "2099-01-01",
        esHoy: false,
        etiqueta: "Desde el 1 de enero de 2099",
        filas: [
          { clave: "a", nombre: "Diagnóstico doble", peso: "25" },
          { clave: "nuevo", nombre: "Sereno", peso: "12,5" },
        ],
      },
    ])
  })

  it("is not found for a network draft, a decided draft or what is not an id", async () => {
    datos.leerBorrador.mockResolvedValueOnce({ tipo: "red", borrador: RED })
    await expect(AprobarBorrador(conId(ID_3))).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(AprobarBorrador(conId(ID_1))).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(AprobarBorrador(conId("x"))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(pilares.etapasDeRed).not.toHaveBeenCalled()
  })
})
