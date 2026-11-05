import { render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import { TrasElAviso } from "@/app/(app)/biblioteca/tras-el-aviso"
import { ID_DEL_AVISO_DE_IDEAS } from "@/lib/dominio/biblioteca/ideas"

const IDEA = "44444444-2222-4333-8444-555555555555"

function en(direccion: string) {
  window.history.replaceState(null, "", direccion)
}

afterEach(() => {
  vi.restoreAllMocks()
  en("/")
})

describe("TrasElAviso", () => {
  it("moves the focus to the note when the page arrives with ?oculta= and nothing has it (the list after the last idea)", () => {
    en(`/biblioteca/temas?oculta=${IDEA}`)
    render(
      <>
        <AvisoDeIdeas texto="La oculté." />
        <TrasElAviso parametro="oculta" />
      </>,
    )
    expect(document.getElementById(ID_DEL_AVISO_DE_IDEAS)).toHaveFocus()
  })

  it("leaves the focus where she put it", () => {
    en(`/biblioteca/temas?oculta=${IDEA}`)
    render(
      <>
        <button type="button">Otro</button>
        <AvisoDeIdeas texto="La oculté." />
      </>,
    )
    const otro = document.querySelector("button")
    otro?.focus()
    render(<TrasElAviso parametro="oculta" />)
    expect(otro).toHaveFocus()
  })

  it("does nothing when the address no longer has its note (the page shown again by Back)", () => {
    en("/biblioteca/temas")
    render(
      <>
        <AvisoDeIdeas texto="La oculté." />
        <TrasElAviso parametro="oculta" />
      </>,
    )
    expect(document.getElementById(ID_DEL_AVISO_DE_IDEAS)).not.toHaveFocus()
  })

  it("takes its note out of the address, keeping the rest, so a reload or a shared link does not say it again", () => {
    window.history.replaceState({ __NA: true }, "", `/biblioteca/temas?pilar=p&oculta=${IDEA}&t=x#arriba`)
    const reemplazar = vi.spyOn(window.history, "replaceState")
    render(
      <>
        <AvisoDeIdeas texto="La oculté." />
        <TrasElAviso parametro="oculta" />
      </>,
    )
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      "/biblioteca/temas?pilar=p&t=x#arriba",
    )
    // No state of its own: Next's patched replaceState skips its router when the state carries `__NA`, so the router
    // would keep the old address and write it back on its next commit. With `null` Next copies its internals and
    // tells its router the new address.
    expect(reemplazar).toHaveBeenCalledWith(null, "", "/biblioteca/temas?pilar=p&t=x#arriba")
    // The note the server drew stays on screen.
    expect(document.getElementById(ID_DEL_AVISO_DE_IDEAS)).toHaveTextContent("La oculté.")
  })

  it("takes out only its own parameter", () => {
    en(`/biblioteca/autores/a?mostrada=${IDEA}`)
    render(<TrasElAviso parametro="mostrada" />)
    expect(`${window.location.pathname}${window.location.search}`).toBe("/biblioteca/autores/a")
  })
  it("takes a draft form's note out of the address too, keeping the rest", () => {
    en("/biblioteca/temas?red=linkedin&aviso=borrador-guardado")
    render(
      <>
        <AvisoDeIdeas texto="Guardé el borrador." />
        <TrasElAviso parametro="aviso" />
      </>,
    )
    expect(window.location.search).toBe("?red=linkedin")
    expect(document.getElementById(ID_DEL_AVISO_DE_IDEAS)).toHaveFocus()
  })
})
