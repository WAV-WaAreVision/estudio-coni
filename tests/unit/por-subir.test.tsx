import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PorSubir } from "@/app/(app)/video/[id]/por-subir"
import type { PublicacionConEnlace } from "@/lib/dominio/destinos"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const CAPTION = "Un texto de Instagram.\n\nVideo hecho con mi avatar digital."
const LINKEDIN = "Un texto de LinkedIn.\n\nEste video lo narra mi avatar digital."

function armar(sobre: Partial<Parameters<typeof PorSubir>[0]> = {}) {
  render(
    <PorSubir
      piezaId="p1"
      version={3}
      texto={CAPTION}
      textoLinkedin={LINKEDIN}
      publicaciones={[]}
      pendientes={["instagram", "linkedin"]}
      alDescargar={vi.fn()}
      alMarcar={vi.fn()}
      {...sobre}
    />,
  )
}

const fila = (
  destino: "instagram" | "linkedin",
  estado: PublicacionConEnlace["estado"],
  enlace: string | null = null,
  explicacion: string | null = null,
) => ({ destino, estado, enlace, explicacion }) satisfies PublicacionConEnlace

describe("PorSubir", () => {
  it("shows one block per pending destination, each with its own steps and its own text", () => {
    armar()

    const instagram = screen.getByRole("heading", { name: "Subir a Instagram" }).closest("section") as HTMLElement
    const linkedin = screen.getByRole("heading", { name: "Subir a LinkedIn" }).closest("section") as HTMLElement
    expect(within(instagram).getByText(/Un texto de Instagram/)).toBeInTheDocument()
    expect(within(instagram).getByRole("button", { name: "Ya lo subí a Instagram" })).toBeInTheDocument()
    expect(within(linkedin).getByText(/Un texto de LinkedIn/)).toBeInTheDocument()
    expect(within(linkedin).getByRole("button", { name: "Ya lo subí a LinkedIn" })).toBeInTheDocument()
    expect(within(linkedin).queryByText(/Información de IA/)).not.toBeInTheDocument()
  })

  it("shows only the destinations that are pending", () => {
    armar({ pendientes: ["linkedin"] })
    expect(screen.queryByRole("heading", { name: "Subir a Instagram" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Subir a LinkedIn" })).toBeInTheDocument()
  })

  it("says what is already uploaded, with its link, while another destination is still pending", () => {
    armar({
      pendientes: ["instagram"],
      publicaciones: [
        fila("instagram", "para_subir"),
        fila("linkedin", "subido_a_mano", "https://www.linkedin.com/posts/coni_abc"),
      ],
    })

    expect(screen.getByText("Subido a LinkedIn")).toBeInTheDocument()
    const enlace = screen.getByRole("link", { name: "Ver en LinkedIn" })
    expect(enlace).toHaveAttribute("href", "https://www.linkedin.com/posts/coni_abc")
    expect(enlace).toHaveAttribute("target", "_blank")
    expect(screen.getByRole("heading", { name: "Subir a Instagram" })).toBeInTheDocument()
  })

  it("says it was uploaded even when she pasted no link", () => {
    armar({ pendientes: [], publicaciones: [fila("instagram", "subido_a_mano")] })
    expect(screen.getByText("Subido a Instagram")).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("refuses to show a LinkedIn block for a piece that has no LinkedIn text", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(() => armar({ textoLinkedin: null, pendientes: ["linkedin"] })).toThrow(/texto para LinkedIn/)
  })
})

describe("PorSubir with LinkedIn published by itself or fallen back", () => {
  it("shows Publicado en LinkedIn with its link for an automatic post, apart from what she uploaded herself", () => {
    armar({
      pendientes: [],
      publicaciones: [
        fila("linkedin", "publicado", "https://www.linkedin.com/feed/update/urn:li:share:7/"),
        fila("instagram", "subido_a_mano"),
      ],
    })

    expect(screen.getByText("Publicado en LinkedIn")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ver en LinkedIn" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/feed/update/urn:li:share:7/",
    )
    expect(screen.getByText("Subido a Instagram")).toBeInTheDocument()
    expect(screen.queryByText("Subido a LinkedIn")).not.toBeInTheDocument()
  })

  it("shows the reason above the manual steps when LinkedIn fell back", () => {
    armar({
      pendientes: ["linkedin"],
      publicaciones: [
        fila(
          "linkedin",
          "para_subir",
          null,
          "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando.",
        ),
      ],
    })

    const linkedin = screen.getByRole("heading", { name: "Subir a LinkedIn" }).closest("section") as HTMLElement
    expect(within(linkedin).getByText(/LinkedIn no aceptó la publicación/)).toBeInTheDocument()
    expect(within(linkedin).getByRole("button", { name: "Ya lo subí a LinkedIn" })).toBeInTheDocument()
  })

  it("shows no reason for a destination that simply waits for her", () => {
    armar({ pendientes: ["linkedin"], publicaciones: [fila("linkedin", "para_subir")] })
    expect(screen.queryByText(/así que te la dejé/)).not.toBeInTheDocument()
  })
})
