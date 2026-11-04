import { render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import { TrasElAviso } from "@/app/(app)/biblioteca/tras-el-aviso"
import { ID_DEL_AVISO_DE_IDEAS } from "@/lib/dominio/biblioteca/ideas"

const IDEA = "44444444-2222-4333-8444-555555555555"

function en(direccion: string) {
  window.history.replaceState(null, "", direccion)
}

afterEach(() => en("/"))

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
})
