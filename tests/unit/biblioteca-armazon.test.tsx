// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const { exigirConi } = vi.hoisted(() => ({ exigirConi: vi.fn(async () => ({ estado: "coni" })) }))
vi.mock("@/lib/sesion/coni", () => ({ leerSesion: async () => ({ estado: "coni" }), exigirConi }))
vi.mock("@/components/nav-inferior", () => ({ NavInferior: () => null }))
vi.mock("@/components/barra-sin-conexion", () => ({ BarraSinConexion: () => null }))
vi.mock("@/app/(app)/solo-para-coni", () => ({ SoloParaConi: () => null }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))

import DisenoDeLaBiblioteca from "@/app/(app)/biblioteca/layout"
import DisenoDeLaApp from "@/app/(app)/layout"

describe("the Biblioteca's width (D4)", () => {
  it("keeps every screen at 560 px and lets the column widen on md: only around the Biblioteca's marker", async () => {
    const html = renderToStaticMarkup(await DisenoDeLaApp({ children: <p>hola</p> }))
    expect(html).toContain("max-w-[560px]")
    expect(html).toContain("md:has-[[data-ancho=biblioteca]]:max-w-[76rem]")
  })

  it("gates with Coni's session and marks the section", async () => {
    const html = renderToStaticMarkup(await DisenoDeLaBiblioteca({ children: <p>hola</p> }))
    expect(exigirConi).toHaveBeenCalled()
    expect(html).toContain('data-ancho="biblioteca"')
    expect(html).toContain("hola")
  })
})
