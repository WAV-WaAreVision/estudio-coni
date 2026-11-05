import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Pestanas } from "@/components/ui/pestanas"

describe("Pestanas", () => {
  it("are links and the current one carries aria-current", () => {
    render(
      <Pestanas
        etiqueta="Vistas"
        actual="agenda"
        opciones={[
          { valor: "mes", etiqueta: "Mes", href: "/calendario?vista=mes" },
          { valor: "agenda", etiqueta: "Agenda", href: "/calendario?vista=agenda" },
        ]}
      />,
    )
    expect(screen.getByRole("navigation", { name: "Vistas" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Mes" })).not.toHaveAttribute("aria-current")
  })

  it("is a segmented control: a sunken track and the current option raised", () => {
    render(
      <Pestanas
        etiqueta="Vistas"
        actual="mes"
        opciones={[
          { valor: "mes", etiqueta: "Mes", href: "/calendario?vista=mes" },
          { valor: "agenda", etiqueta: "Agenda", href: "/calendario?vista=agenda" },
        ]}
      />,
    )
    expect(screen.getByRole("list")).toHaveClass("bg-piedra-honda", "shadow-hundido", "rounded-control")
    expect(screen.getByRole("link", { name: "Mes" })).toHaveClass("bg-piedra", "shadow-relieve", "min-h-objetivo")
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveClass("text-apagado")
    expect(screen.getByRole("link", { name: "Agenda" }).className).not.toMatch(/shadow-relieve/)
  })

  it("stretches its options across the track by default", () => {
    render(
      <Pestanas
        etiqueta="Vistas"
        actual="mes"
        opciones={[{ valor: "mes", etiqueta: "Mes", href: "/calendario?vista=mes" }]}
      />,
    )
    expect(screen.getByRole("list")).toHaveClass("flex")
    expect(screen.getByRole("listitem")).toHaveClass("flex-1")
  })

  it("hugs its options when compacta, so a single tab does not stretch", () => {
    render(
      <Pestanas
        etiqueta="Secciones"
        actual="materiales"
        compacta
        opciones={[{ valor: "materiales", etiqueta: "Materiales", href: "/biblioteca" }]}
      />,
    )
    expect(screen.getByRole("list")).toHaveClass("inline-flex", "w-fit")
    expect(screen.getByRole("listitem")).toHaveClass("flex-none")
    expect(screen.getByRole("listitem")).not.toHaveClass("flex-1")
  })
})

describe("Pestanas compactas", () => {
  it("slide inside their track on one row instead of wrapping or pushing the page sideways, and the shared ones keep theirs", () => {
    const opciones = [
      { valor: "a", etiqueta: "Una", href: "/a" },
      { valor: "b", etiqueta: "Otra", href: "/b" },
    ]
    const { unmount } = render(<Pestanas etiqueta="Secciones" actual="a" compacta opciones={opciones} />)
    expect(screen.getByRole("list")).toHaveClass("flex-nowrap", "overflow-x-auto", "max-w-full")
    expect(screen.getByRole("list")).not.toHaveClass("flex-wrap")
    // A grid item sizes to its content by default: without this the unwrapped row would widen the page.
    expect(screen.getByRole("navigation")).toHaveClass("min-w-0")
    expect(screen.getAllByRole("link")[0]).toHaveClass("gap-1.5", "px-2.5", "whitespace-nowrap")
    unmount()
    render(<Pestanas etiqueta="Vistas" actual="a" opciones={opciones} />)
    expect(screen.getByRole("list")).not.toHaveClass("overflow-x-auto")
    expect(screen.getAllByRole("link")[0]).toHaveClass("gap-2", "px-3")
  })
})

describe("Pestanas compactas on arrival", () => {
  const cajas = new Map<string, { left: number; right: number }>()
  let desplazamiento = 0

  beforeEach(() => {
    desplazamiento = 0
    cajas.clear()
    Element.prototype.scrollIntoView = vi.fn()
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const caja = cajas.get(this.tagName === "UL" ? "pista" : (this.textContent ?? "")) ?? { left: 0, right: 0 }
      return { ...caja, top: 0, bottom: 44, width: caja.right - caja.left, height: 44, x: caja.left, y: 0 } as DOMRect
    })
    Object.defineProperty(HTMLUListElement.prototype, "scrollLeft", {
      configurable: true,
      get: () => desplazamiento,
      set: (valor: number) => {
        desplazamiento = valor
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(Element.prototype, "scrollIntoView")
    Reflect.deleteProperty(HTMLUListElement.prototype, "scrollLeft")
  })

  const opciones = [
    { valor: "a", etiqueta: "Una", href: "/a" },
    { valor: "b", etiqueta: "Otra", href: "/b" },
  ]

  it("slide only their own track to show the open section, never the page, and only the compact ones do", () => {
    cajas.set("pista", { left: 0, right: 300 })
    cajas.set("Otra", { left: 350, right: 450 })
    const { unmount } = render(<Pestanas etiqueta="Secciones" actual="b" compacta opciones={opciones} />)
    expect(desplazamiento).toBe(150)
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    unmount()
    desplazamiento = 0
    render(<Pestanas etiqueta="Vistas" actual="b" opciones={opciones} />)
    expect(desplazamiento).toBe(0)
  })

  it("slide back when the open section is cut off on the left, and leave a visible one where it is", () => {
    cajas.set("pista", { left: 0, right: 300 })
    cajas.set("Otra", { left: -40, right: 60 })
    desplazamiento = 100
    const { unmount } = render(<Pestanas etiqueta="Secciones" actual="b" compacta opciones={opciones} />)
    expect(desplazamiento).toBe(60)
    unmount()
    cajas.set("Otra", { left: 100, right: 200 })
    desplazamiento = 30
    render(<Pestanas etiqueta="Secciones" actual="b" compacta opciones={opciones} />)
    expect(desplazamiento).toBe(30)
  })
})
