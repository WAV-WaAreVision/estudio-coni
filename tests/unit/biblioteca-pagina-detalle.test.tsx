// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// The page gates itself: a layout does not run again on client navigation and renders in parallel with its pages.
const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    leerMaterialConFicha: vi.fn(async (): Promise<unknown> => null),
    leerMapaDelMaterial: vi.fn(async () => ({ total: 0, temas: [], sinTema: 0, tipos: {}, evidencia: {} })),
    listarAutores: vi.fn(async () => []),
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
vi.mock("@/lib/datos/biblioteca", () => datos)
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  reintentarMaterialAccion: vi.fn(),
  reprocesarMaterialAccion: vi.fn(),
  confirmarCostoAccion: vi.fn(),
  editarMaterialAccion: vi.fn(),
  editarFichaAccion: vi.fn(),
  crearAutorAccion: vi.fn(),
}))

import DetalleDeMaterial from "@/app/(app)/biblioteca/materiales/[id]/page"

const ID = "11111111-2222-4333-8444-555555555555"
const conId = (id: string) => ({ params: Promise.resolve({ id }) })

const MATERIAL = {
  id: ID,
  titulo: "Carga mental en pareja",
  autor_id: "22222222-2222-4333-8444-555555555555",
  autor: "Daniela Ruiz",
  credencial: null,
  rol: "referente",
  tipo: "documento",
  estado: "listo",
  motivo_fallo: null,
  costo_estimado_usd: null,
  costo_confirmado_en: null,
  creado_en: "2026-11-01T12:00:00Z",
  idioma_original: "es",
  origen_url: null,
}

/** Every element of a rendered tree, depth first, as plain objects with their props. */
function elementos(nodo: unknown): { type: unknown; props: Record<string, unknown> }[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (typeof nodo !== "object" || nodo === null || !("props" in nodo)) return []
  const elemento = nodo as { type: unknown; props: Record<string, unknown> }
  return [elemento, ...elementos(elemento.props.children)]
}

beforeEach(() => vi.clearAllMocks())

describe("the material detail page", () => {
  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(DetalleDeMaterial(conId(ID))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerMaterialConFicha).not.toHaveBeenCalled()
    expect(datos.listarAutores).not.toHaveBeenCalled()
  })

  it("answers not found for an id that is not a material's", async () => {
    esConi.valor = true
    await expect(DetalleDeMaterial(conId("no-es-un-id"))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerMaterialConFicha).not.toHaveBeenCalled()
    await expect(DetalleDeMaterial(conId(ID))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerMaterialConFicha).toHaveBeenCalledWith(expect.anything(), ID)
  })

  it("links the original text with a plain anchor to its route, and goes back to Materiales", async () => {
    esConi.valor = true
    datos.leerMaterialConFicha.mockResolvedValueOnce({ material: MATERIAL, ficha: null })
    const arbol = elementos(await DetalleDeMaterial(conId(ID)))
    const descarga = arbol.find((elemento) => elemento.props.href === `/biblioteca/materiales/${ID}/texto`)
    expect(descarga?.type).toBe("a")
    expect(descarga?.props.children).toBe("Descargar texto original")
    const volver = arbol.find((elemento) => elemento.props.href === "/biblioteca")
    expect(volver?.props.children).toBe("Materiales")
    expect(datos.leerMapaDelMaterial).toHaveBeenCalledWith(expect.anything(), ID)
  })
})
