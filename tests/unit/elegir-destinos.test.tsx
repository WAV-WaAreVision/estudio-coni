import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ElegirDestinos } from "@/app/(app)/video/[id]/elegir-destinos"

function armar(sobre: Partial<Parameters<typeof ElegirDestinos>[0]> = {}) {
  const alCambiar = vi.fn()
  render(
    <ElegirDestinos
      elegidos={["instagram", "linkedin"]}
      instagramConectado={false}
      linkedinConectado={false}
      alCambiar={alCambiar}
      {...sobre}
    />,
  )
  return { alCambiar }
}

describe("ElegirDestinos", () => {
  it("shows the destinations that Ajustes chose ticked, in a group named for what it decides", () => {
    armar()
    expect(screen.getByRole("group", { name: "Dónde se publica" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "LinkedIn" })).toBeChecked()
  })

  it("shows a destination that was not chosen unticked", () => {
    armar({ elegidos: ["instagram"] })
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "LinkedIn" })).not.toBeChecked()
  })

  it("tells her she uploads LinkedIn herself, and Instagram too while it is not connected", () => {
    armar()
    expect(screen.getByRole("checkbox", { name: "LinkedIn" })).toHaveAccessibleDescription(
      "Lo subes tú a la hora aprobada",
    )
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toHaveAccessibleDescription("Lo subes tú a mano")
  })

  it("says Instagram goes out by itself once it is connected", () => {
    armar({ instagramConectado: true })
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toHaveAccessibleDescription(
      "Sale solo a la hora aprobada",
    )
    expect(screen.getByRole("checkbox", { name: "LinkedIn" })).toHaveAccessibleDescription(
      "Lo subes tú a la hora aprobada",
    )
  })

  it("says LinkedIn goes out by itself once it is connected", () => {
    armar({ linkedinConectado: true })
    expect(screen.getByRole("checkbox", { name: "LinkedIn" })).toHaveAccessibleDescription(
      "Sale solo a la hora aprobada",
    )
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toHaveAccessibleDescription("Lo subes tú a mano")
  })

  it("reports the new choice, always in the canonical order", () => {
    const { alCambiar } = armar({ elegidos: ["linkedin"] })
    fireEvent.click(screen.getByRole("checkbox", { name: "Instagram" }))
    expect(alCambiar).toHaveBeenCalledWith(["instagram", "linkedin"])
  })

  it("lets her untick one while the other stays", () => {
    const { alCambiar } = armar()
    fireEvent.click(screen.getByRole("checkbox", { name: "LinkedIn" }))
    expect(alCambiar).toHaveBeenCalledWith(["instagram"])
  })

  it("refuses unticking the last destination and says why", () => {
    const { alCambiar } = armar({ elegidos: ["instagram"] })
    expect(screen.queryByText("Elige al menos uno.")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("checkbox", { name: "Instagram" }))

    expect(alCambiar).not.toHaveBeenCalled()
    expect(screen.getByText("Elige al menos uno.")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked()
  })

  it("takes the warning away as soon as she picks another destination", () => {
    armar({ elegidos: ["instagram"] })
    fireEvent.click(screen.getByRole("checkbox", { name: "Instagram" }))
    expect(screen.getByText("Elige al menos uno.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("checkbox", { name: "LinkedIn" }))

    expect(screen.queryByText("Elige al menos uno.")).not.toBeInTheDocument()
  })
})
