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

  it("takes its note out of the address, keeping the rest, so a reload, Back or a shared link does not say it again", () => {
    const estado = { __NA: true, arbol: "el de Next" }
    window.history.replaceState(estado, "", `/biblioteca/temas?pilar=p&oculta=${IDEA}&t=x#arriba`)
    render(
      <>
        <AvisoDeIdeas texto="La oculté." />
        <TrasElAviso parametro="oculta" />
      </>,
    )
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      "/biblioteca/temas?pilar=p&t=x#arriba",
    )
    // The router's own state rides along, and the note the server drew stays on screen.
    expect(window.history.state).toEqual(estado)
    expect(document.getElementById(ID_DEL_AVISO_DE_IDEAS)).toHaveTextContent("La oculté.")
  })

  it("takes out only its own parameter", () => {
    en(`/biblioteca/autores/a?mostrada=${IDEA}`)
    render(<TrasElAviso parametro="mostrada" />)
    expect(`${window.location.pathname}${window.location.search}`).toBe("/biblioteca/autores/a")
  })
})
