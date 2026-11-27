// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RevisionDeEtiquetas } from "@/lib/datos/lote-de-etiquetas"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    leerRevisionDeEtiquetas: vi.fn(
      async (..._: unknown[]): Promise<RevisionDeEtiquetas> => ({ estado: "lista", items: [], tarjetas: [] }),
    ),
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
vi.mock("@/lib/datos/lote-de-etiquetas", () => datos)
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  corregirEtiquetaAccion: vi.fn(),
  confirmarEtiquetaAccion: vi.fn(),
  quitarMarcaAccion: vi.fn(),
}))

import type { ReactElement, ReactNode } from "react"
import RevisarEtiquetas from "@/app/(app)/biblioteca/etiquetas/revisar/page"
import { TarjetaDeEtiquetaDudosa } from "@/app/(app)/biblioteca/etiquetas/revisar/tarjeta-de-etiqueta"
import { type ItemDeLote, type TarjetaDeEtiqueta, tarjetaDeItem } from "@/lib/dominio/biblioteca/lote-de-etiquetas"
import {
  afirmacionDePrueba,
  CATALOGO_DE_PRUEBA,
  ID_DE_AFIRMACION,
  MARCA_EMOCION_LINKEDIN,
} from "../fixtures/afirmaciones"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const textos = (arbol: Elemento[]) =>
  arbol.flatMap((e) => (typeof e.props.children === "string" ? [e.props.children] : []))

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

function tarjeta(i: ItemDeLote): TarjetaDeEtiqueta {
  const resultado = tarjetaDeItem(i, afirmacionDePrueba(), CATALOGO_DE_PRUEBA)
  if (!resultado) throw new Error("La prueba esperaba una tarjeta")
  return resultado
}

beforeEach(() => {
  vi.clearAllMocks()
  esConi.valor = true
})

describe("the review page", () => {
  it("refuses a session that is not Coni's before reading anything", async () => {
    esConi.valor = false
    await expect(RevisarEtiquetas()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerRevisionDeEtiquetas).not.toHaveBeenCalled()
  })

  it("says there is nothing this week when the batch is empty, with no progress and no cards", async () => {
    const arbol = elementos(await RevisarEtiquetas())
    expect(textos(arbol)).toContain("Etiquetas para revisar")
    expect(textos(arbol)).toContain("No hay etiquetas dudosas esta semana.")
    expect(textos(arbol).some((t) => / de \d/.test(t))).toBe(false)
    expect(arbol.filter((e) => e.type === TarjetaDeEtiquetaDudosa)).toEqual([])
  })

  it("says it could not load the tags", async () => {
    datos.leerRevisionDeEtiquetas.mockResolvedValueOnce({ estado: "error" })
    expect(textos(elementos(await RevisarEtiquetas()))).toContain(
      "No pude cargar las etiquetas. Vuelve a intentarlo en un rato.",
    )
  })

  it("shows the progress and one card per item, in order", async () => {
    const items = [
      item(),
      item({ posicion: 2, campo: "tipo_de_gancho", red: "todas", marcaId: null, motivo: "gancho", hecha: true }),
    ]
    const tarjetas = items.map(tarjeta)
    datos.leerRevisionDeEtiquetas.mockResolvedValueOnce({ estado: "lista", items, tarjetas })
    const arbol = elementos(await RevisarEtiquetas())
    expect(textos(arbol)).toContain("1 de 2")
    expect(textos(arbol)).not.toContain("Listo por esta semana. El próximo lote llega el lunes.")
    expect(arbol.filter((e) => e.type === TarjetaDeEtiquetaDudosa).map((e) => e.props.tarjeta)).toEqual(tarjetas)
  })

  it("says the week is done when every card is", async () => {
    const items = [item({ hecha: true })]
    datos.leerRevisionDeEtiquetas.mockResolvedValueOnce({ estado: "lista", items, tarjetas: items.map(tarjeta) })
    const arbol = elementos(await RevisarEtiquetas())
    expect(textos(arbol)).toContain("1 de 1")
    expect(textos(arbol)).toContain("Listo por esta semana. El próximo lote llega el lunes.")
  })

  it("leaves a done item without a card out of the progress, so the counter matches the cards", async () => {
    // Item 2's claim was hidden after the batch was built: done, and no card for it.
    const items = [item(), item({ posicion: 2, afirmacionId: "otra", hecha: true })]
    datos.leerRevisionDeEtiquetas.mockResolvedValueOnce({
      estado: "lista",
      items,
      tarjetas: [tarjeta(items[0] ?? item())],
    })
    const arbol = elementos(await RevisarEtiquetas())
    expect(textos(arbol)).toContain("0 de 1")
    expect(textos(arbol)).not.toContain("1 de 2")
    expect(textos(arbol)).not.toContain("Listo por esta semana. El próximo lote llega el lunes.")
  })

  it("says the week is done, with no counter, when every item is done and none has a card", async () => {
    datos.leerRevisionDeEtiquetas.mockResolvedValueOnce({
      estado: "lista",
      items: [item({ hecha: true })],
      tarjetas: [],
    })
    const arbol = elementos(await RevisarEtiquetas())
    expect(textos(arbol)).toContain("Listo por esta semana. El próximo lote llega el lunes.")
    expect(textos(arbol).some((t) => / de \d/.test(t))).toBe(false)
  })
})
