import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SubirAMano } from "@/app/(app)/video/[id]/subir-a-mano"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const TEXTO = "El deseo no se apaga, se esconde.\n\nVideo hecho con mi avatar digital."

function armar(sobre: Partial<Parameters<typeof SubirAMano>[0]> = {}) {
  const alDescargar = vi.fn().mockResolvedValue({ ok: true, url: "https://almacen.test/v.mp4?descarga=reel.mp4" })
  const alMarcar = vi.fn().mockResolvedValue({ ok: true })
  const alIrA = vi.fn()
  render(
    <SubirAMano
      piezaId="p1"
      version={7}
      destino="instagram"
      texto={TEXTO}
      alDescargar={alDescargar}
      alMarcar={alMarcar}
      alIrA={alIrA}
      {...sobre}
    />,
  )
  return { alDescargar, alMarcar, alIrA }
}

const copiar = vi.fn()
Object.defineProperty(navigator, "clipboard", { value: { writeText: copiar }, configurable: true })

afterEach(() => {
  copiar.mockReset()
})

describe("SubirAMano", () => {
  it("numbers the four steps as content and never fills a destructive button", () => {
    armar()
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    for (const boton of screen.getAllByRole("button")) expect(boton.className).not.toMatch(/\bbg-(error|firma)\b/)
  })

  it("has one principal: the last step, the others are outlined or quiet", () => {
    armar()
    expect(screen.getByRole("button", { name: "Ya lo subí a Instagram" })).toHaveClass("bg-principal")
    expect(screen.getByRole("button", { name: "Descargar video" })).not.toHaveClass("bg-principal")
  })

  it("shows the approved text so she can read what she is about to paste", () => {
    armar()
    expect(screen.getByText(/El deseo no se apaga/)).toBeInTheDocument()
  })

  it("downloads the video by sending her to the signed link, never through the page", async () => {
    const { alDescargar, alIrA } = armar()

    fireEvent.click(screen.getByRole("button", { name: "Descargar video" }))

    await waitFor(() => expect(alIrA).toHaveBeenCalledWith("https://almacen.test/v.mp4?descarga=reel.mp4"))
    expect(alDescargar).toHaveBeenCalledWith("p1")
  })

  it("says what went wrong when the download link cannot be made", async () => {
    const alDescargar = vi.fn().mockResolvedValue({ ok: false, error: "No pude preparar el video." })
    const { alIrA } = armar({ alDescargar })

    fireEvent.click(screen.getByRole("button", { name: "Descargar video" }))

    expect(await screen.findByText("No pude preparar el video.")).toBeInTheDocument()
    expect(alIrA).not.toHaveBeenCalled()
  })

  it("copies the exact approved text and confirms it", async () => {
    copiar.mockResolvedValue(undefined)
    armar()

    fireEvent.click(screen.getByRole("button", { name: "Copiar texto" }))

    await waitFor(() => expect(copiar).toHaveBeenCalledWith(TEXTO))
    expect(await screen.findByText("Texto copiado")).toBeInTheDocument()
  })

  it("tells her to copy by hand when the phone refuses the clipboard", async () => {
    copiar.mockRejectedValue(new DOMException("denied", "NotAllowedError"))
    armar()

    fireEvent.click(screen.getByRole("button", { name: "Copiar texto" }))

    expect(await screen.findByText(/No pude copiarlo/)).toBeInTheDocument()
  })

  it("reminds her to turn on Instagram's AI label and does not let her confirm without it", () => {
    const { alMarcar } = armar()

    expect(screen.getByText(/Antes de publicar, activa la etiqueta/)).toBeInTheDocument()
    const confirmar = screen.getByRole("button", { name: "Ya lo subí a Instagram" })
    expect(confirmar).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(confirmar)
    expect(alMarcar).not.toHaveBeenCalled()
  })

  it("confirms the upload with the link she pasted once the label is checked", async () => {
    const { alMarcar } = armar()

    fireEvent.click(screen.getByRole("checkbox", { name: /Activé la etiqueta/ }))
    fireEvent.change(screen.getByLabelText(/Enlace del reel/), {
      target: { value: "https://www.instagram.com/reel/DAbc123/" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Ya lo subí a Instagram" }))

    await waitFor(() =>
      expect(alMarcar).toHaveBeenCalledWith("p1", 7, "instagram", "https://www.instagram.com/reel/DAbc123/"),
    )
  })

  it("lets her confirm without a link", async () => {
    const { alMarcar } = armar()

    fireEvent.click(screen.getByRole("checkbox", { name: /Activé la etiqueta/ }))
    fireEvent.click(screen.getByRole("button", { name: "Ya lo subí a Instagram" }))

    await waitFor(() => expect(alMarcar).toHaveBeenCalledWith("p1", 7, "instagram", ""))
  })

  it("shows the refusal when the link is not Instagram's", async () => {
    const alMarcar = vi.fn().mockResolvedValue({ ok: false, error: "Ese enlace no parece de Instagram." })
    armar({ alMarcar })

    fireEvent.click(screen.getByRole("checkbox", { name: /Activé la etiqueta/ }))
    fireEvent.click(screen.getByRole("button", { name: "Ya lo subí a Instagram" }))

    expect(await screen.findByText("Ese enlace no parece de Instagram.")).toBeInTheDocument()
  })
})

describe("SubirAMano para LinkedIn", () => {
  const TEXTO_LINKEDIN = "Llevan diez años juntos.\n\nEste video lo narra mi avatar digital."

  function armarLinkedin(sobre: Partial<Parameters<typeof SubirAMano>[0]> = {}) {
    return armar({ destino: "linkedin", texto: TEXTO_LINKEDIN, ...sobre })
  }

  it("says LinkedIn at every step and shows the LinkedIn text, not the caption", () => {
    armarLinkedin()
    expect(screen.getByRole("heading", { name: "Súbelo en LinkedIn" })).toBeInTheDocument()
    expect(screen.getByText("Publica el video en LinkedIn y pega el texto.")).toBeInTheDocument()
    expect(screen.getByText(/Llevan diez años juntos/)).toBeInTheDocument()
    expect(screen.queryByText(/Instagram/)).not.toBeInTheDocument()
  })

  it("copies the exact LinkedIn text", async () => {
    copiar.mockResolvedValue(undefined)
    armarLinkedin()

    fireEvent.click(screen.getByRole("button", { name: "Copiar texto" }))

    await waitFor(() => expect(copiar).toHaveBeenCalledWith(TEXTO_LINKEDIN))
  })

  it("asks her to confirm the avatar notice stayed in the text, and does not mention Instagram's label", () => {
    const { alMarcar } = armarLinkedin()

    expect(screen.queryByText(/Información de IA/)).not.toBeInTheDocument()
    const confirmar = screen.getByRole("button", { name: "Ya lo subí a LinkedIn" })
    expect(confirmar).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(confirmar)
    expect(alMarcar).not.toHaveBeenCalled()
  })

  it("marks only LinkedIn, with the link she pasted, once the notice is confirmed", async () => {
    const { alMarcar } = armarLinkedin()

    fireEvent.click(screen.getByRole("checkbox", { name: "Dejé en el texto que es mi avatar digital" }))
    fireEvent.change(screen.getByLabelText("Enlace de la publicación en LinkedIn (opcional)"), {
      target: { value: "https://www.linkedin.com/posts/coni_abc-123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Ya lo subí a LinkedIn" }))

    await waitFor(() =>
      expect(alMarcar).toHaveBeenCalledWith("p1", 7, "linkedin", "https://www.linkedin.com/posts/coni_abc-123"),
    )
  })

  it("lets her confirm without a link", async () => {
    const { alMarcar } = armarLinkedin()

    fireEvent.click(screen.getByRole("checkbox", { name: "Dejé en el texto que es mi avatar digital" }))
    fireEvent.click(screen.getByRole("button", { name: "Ya lo subí a LinkedIn" }))

    await waitFor(() => expect(alMarcar).toHaveBeenCalledWith("p1", 7, "linkedin", ""))
  })

  it("shows the refusal when the link is not LinkedIn's", async () => {
    const alMarcar = vi.fn().mockResolvedValue({ ok: false, error: "Ese enlace no parece de LinkedIn." })
    armarLinkedin({ alMarcar })

    fireEvent.click(screen.getByRole("checkbox", { name: "Dejé en el texto que es mi avatar digital" }))
    fireEvent.click(screen.getByRole("button", { name: "Ya lo subí a LinkedIn" }))

    expect(await screen.findByText("Ese enlace no parece de LinkedIn.")).toBeInTheDocument()
  })

  it("keeps two blocks on the same screen apart: each explains its own disabled button", () => {
    render(
      <>
        <SubirAMano
          piezaId="p1"
          version={7}
          destino="instagram"
          texto={TEXTO}
          alDescargar={vi.fn()}
          alMarcar={vi.fn()}
        />
        <SubirAMano
          piezaId="p1"
          version={7}
          destino="linkedin"
          texto="LinkedIn"
          alDescargar={vi.fn()}
          alMarcar={vi.fn()}
        />
      </>,
    )
    const ids = screen.getAllByRole("button", { name: /Ya lo subí a/ }).map((b) => b.getAttribute("aria-describedby"))
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(document.getElementById(id ?? "")).not.toBeNull()
  })
})
