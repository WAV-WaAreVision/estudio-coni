import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CerrarSesion } from "@/app/(app)/ajustes/cerrar-sesion"

describe("CerrarSesion", () => {
  it("is a quiet action that asks in line before signing out", async () => {
    const cerrar = vi.fn(async () => {})
    render(<CerrarSesion cerrar={cerrar} />)
    const boton = screen.getByRole("button", { name: "Cerrar sesión" })
    expect(boton).toHaveClass("underline")
    fireEvent.click(boton)
    expect(cerrar).not.toHaveBeenCalled()
    expect(screen.getByText("Para volver a entrar te mando un código a tu correo. ¿Cerrar sesión?")).toHaveFocus()
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Sí, cerrar sesión" }))
    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce())
  })

  it("lets her stay signed in", () => {
    const cerrar = vi.fn(async () => {})
    render(<CerrarSesion cerrar={cerrar} />)
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(cerrar).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument()
  })
})
