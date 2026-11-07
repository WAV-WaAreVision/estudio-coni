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
// No provider paused: the pages read the open pauses through the same session.
vi.mock("@/lib/datos/pausas", () => ({ leerPausasAbiertas: async () => [] }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  reintentarMaterialAccion: vi.fn(),
  reprocesarMaterialAccion: vi.fn(),
  editarMaterialAccion: vi.fn(),
  editarFichaAccion: vi.fn(),
  crearAutorAccion: vi.fn(),
  borrarMaterialAccion: vi.fn(),
}))

import { BotonBorrar } from "@/app/(app)/biblioteca/boton-borrar"
import { BotonReintentar } from "@/app/(app)/biblioteca/boton-reintentar"
import DetalleDeMaterial from "@/app/(app)/biblioteca/materiales/[id]/page"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { REFRESCO_DE_LA_BIBLIOTECA_MS } from "@/lib/dominio/biblioteca/estado"

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

  const CAMBIASTE = "Cambiaste quién es para ti: reprocesa el material para verlo así."
  const FICHA = {
    resumen: "R",
    ideasClave: ["Una", "Dos", "Tres", "Cuatro", "Cinco"],
    citas: [],
    fuente: { autor: null, anio: null, enlace: null },
  }
  const textos = (arbol: { props: Record<string, unknown> }[]) =>
    arbol.flatMap((elemento) => [elemento.props.children, elemento.props.titulo]).filter((x) => typeof x === "string")

  it("asks to reprocess, not a failure, for a strategy material that was processed with another role", async () => {
    esConi.valor = true
    datos.leerMaterialConFicha.mockResolvedValueOnce({ material: { ...MATERIAL, rol: "estrategia" }, ficha: null })
    const arbol = elementos(await DetalleDeMaterial(conId(ID)))
    expect(textos(arbol)).toContain(CAMBIASTE)
    expect(textos(arbol)).not.toContain("No pude leer la ficha de este material. Avísale a Federico.")
  })

  it("asks to reprocess, not an empty map, for a material that has a card from when it was a strategy", async () => {
    esConi.valor = true
    datos.leerMaterialConFicha.mockResolvedValueOnce({ material: MATERIAL, ficha: FICHA })
    const arbol = elementos(await DetalleDeMaterial(conId(ID)))
    expect(textos(arbol)).toContain(CAMBIASTE)
    expect(arbol.some((elemento) => "mapa" in elemento.props)).toBe(false)
  })

  it("counts a strategy card as a processed result, so a change of role warns to reprocess", async () => {
    esConi.valor = true
    datos.leerMaterialConFicha.mockResolvedValueOnce({ material: { ...MATERIAL, rol: "estrategia" }, ficha: FICHA })
    const arbol = elementos(await DetalleDeMaterial(conId(ID)))
    expect(textos(arbol)).not.toContain(CAMBIASTE)
    const editor = arbol.find((elemento) => "conIdeas" in elemento.props)
    expect(editor?.props.conIdeas).toBe(true)
  })

  it("tells the reprocess button the material's role", async () => {
    esConi.valor = true
    datos.leerMaterialConFicha.mockResolvedValueOnce({ material: { ...MATERIAL, rol: "estrategia" }, ficha: FICHA })
    const arbol = elementos(await DetalleDeMaterial(conId(ID)))
    const boton = arbol.find((elemento) => "rol" in elemento.props && !("autores" in elemento.props))
    expect(boton?.props.rol).toBe("estrategia")
  })

  it("offers «Borrar material» once on the phone column and once in the desktop side column, at the end", async () => {
    esConi.valor = true
    datos.leerMaterialConFicha.mockResolvedValueOnce({ material: MATERIAL, ficha: null })
    const arbol = elementos(await DetalleDeMaterial(conId(ID)))
    const botones = arbol.filter((elemento) => elemento.type === BotonBorrar)
    expect(botones.map((boton) => boton.props)).toEqual([
      { tipo: "material", id: ID },
      { tipo: "material", id: ID },
    ])
    const ultimoDe = (cual: { props: Record<string, unknown> } | undefined) => {
      const hijos = cual?.props.children
      return Array.isArray(hijos) ? hijos.at(-1) : hijos
    }
    const telefono = arbol.filter((e) => e.props.className === "contents md:hidden").at(-1)
    expect(ultimoDe(telefono)).toEqual(expect.objectContaining({ type: BotonBorrar }))
    const lateral = arbol.find((e) => e.type === "aside")
    expect(ultimoDe(lateral)).toEqual(expect.objectContaining({ type: BotonBorrar }))
  })

  it("offers Reintentar for a material whose run stopped because she deleted it and then undid it", async () => {
    esConi.valor = true
    datos.leerMaterialConFicha.mockResolvedValueOnce({
      material: {
        ...MATERIAL,
        estado: "procesando",
        motivo_fallo: "Paré de procesarlo porque lo borraste. Toca Reintentar para seguir.",
      },
      ficha: null,
    })
    const arbol = elementos(await DetalleDeMaterial(conId(ID)))
    expect(arbol.filter((elemento) => elemento.type === BotonReintentar).map((b) => b.props)).toEqual([
      { materialId: ID, pausa: null },
      { materialId: ID, pausa: null },
    ])
  })

  describe("while it is processing (spec decision 3)", () => {
    const AVISO_CON_COSTO = "Lo estoy procesando. Costará cerca de US$\u00a00,40."
    const avisos = (arbol: { props: Record<string, unknown> }[]) =>
      textos(arbol).filter((texto) => String(texto).startsWith("Lo estoy procesando."))

    it("says once what it will cost, and offers no button to confirm it", async () => {
      esConi.valor = true
      datos.leerMaterialConFicha.mockResolvedValueOnce({
        material: { ...MATERIAL, estado: "procesando", costo_estimado_usd: 0.4 },
        ficha: null,
      })
      const arbol = elementos(await DetalleDeMaterial(conId(ID)))
      expect(avisos(arbol)).toEqual([AVISO_CON_COSTO])
      expect(arbol.some((elemento) => "costoUsd" in elemento.props)).toBe(false)
    })

    it("says only «Lo estoy procesando.» before the task wrote the estimate", async () => {
      esConi.valor = true
      datos.leerMaterialConFicha.mockResolvedValueOnce({ material: { ...MATERIAL, estado: "procesando" }, ficha: null })
      expect(avisos(elementos(await DetalleDeMaterial(conId(ID))))).toEqual(["Lo estoy procesando."])
    })

    it("says nothing of it when the material is ready or paused with a reason", async () => {
      esConi.valor = true
      datos.leerMaterialConFicha.mockResolvedValueOnce({
        material: { ...MATERIAL, costo_estimado_usd: 0.4 },
        ficha: null,
      })
      expect(avisos(elementos(await DetalleDeMaterial(conId(ID))))).toEqual([])
      datos.leerMaterialConFicha.mockResolvedValueOnce({
        material: { ...MATERIAL, estado: "procesando", motivo_fallo: "tope_mensual", costo_estimado_usd: 0.4 },
        ficha: null,
      })
      expect(avisos(elementos(await DetalleDeMaterial(conId(ID))))).toEqual([])
    })

    it("asks again while it works, so the estimate shows up without a reload, and stops once it is not", async () => {
      esConi.valor = true
      const refresco = (arbol: { type: unknown; props: Record<string, unknown> }[]) =>
        arbol.filter((elemento) => elemento.type === RefrescoAutomatico).map((elemento) => elemento.props)
      datos.leerMaterialConFicha.mockResolvedValueOnce({ material: { ...MATERIAL, estado: "procesando" }, ficha: null })
      expect(refresco(elementos(await DetalleDeMaterial(conId(ID))))).toEqual([
        { activo: true, cadaMs: REFRESCO_DE_LA_BIBLIOTECA_MS },
      ])
      datos.leerMaterialConFicha.mockResolvedValueOnce({ material: MATERIAL, ficha: null })
      expect(refresco(elementos(await DetalleDeMaterial(conId(ID))))).toEqual([
        { activo: false, cadaMs: REFRESCO_DE_LA_BIBLIOTECA_MS },
      ])
      datos.leerMaterialConFicha.mockResolvedValueOnce({
        material: { ...MATERIAL, estado: "procesando", motivo_fallo: "tope_mensual" },
        ficha: null,
      })
      expect(refresco(elementos(await DetalleDeMaterial(conId(ID))))[0]?.activo).toBe(false)
    })
  })
})
