import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ImportarExcelDeLinkedin } from "@/app/(app)/metricas/importar-excel-de-linkedin"
import { ERROR_MUY_GRANDE } from "@/lib/metricas/excel-linkedin/resumen"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const OPCION = { clave: "ugcPost:72", fecha: "2026-10-07", impresiones: 2300, interacciones: 40 }

function elegirArchivo(archivo: File) {
  fireEvent.change(screen.getByLabelText("Excel de LinkedIn"), { target: { files: [archivo] } })
}

const xlsx = (bytes = 10) => new File([new Uint8Array(bytes)], "AnalisisConjunto.xlsx")

describe("ImportarExcelDeLinkedin", () => {
  it("says how to download it, sends the chosen file and shows the summary in place", async () => {
    const alImportar = vi.fn(async (_formulario: FormData) => ({
      ok: true as const,
      medidoEn: "2026-10-30",
      resumen: ["Listo: 1 publicación con números.", "También guardé tus seguidores: 830."],
      dudosos: [],
    }))
    render(<ImportarExcelDeLinkedin alImportar={alImportar} alGuardarDudosos={vi.fn()} />)

    expect(screen.getByText("En LinkedIn, abre Estadísticas y luego Contenido.")).toBeInTheDocument()
    const archivo = xlsx()
    elegirArchivo(archivo)

    expect(await screen.findByText("Listo: 1 publicación con números.")).toBeInTheDocument()
    expect(screen.getByText("También guardé tus seguidores: 830.")).toBeInTheDocument()
    expect(alImportar.mock.calls[0]?.[0].get("archivo")).toBe(archivo)
  })

  it("refuses a file over 2 MB without sending it", async () => {
    const alImportar = vi.fn()
    render(<ImportarExcelDeLinkedin alImportar={alImportar} alGuardarDudosos={vi.fn()} />)

    elegirArchivo(xlsx(2_000_001))

    expect(await screen.findByText(ERROR_MUY_GRANDE)).toBeInTheDocument()
    expect(alImportar).not.toHaveBeenCalled()
  })

  it("lets her pick the Excel post of each doubtful piece, one post per piece, and saves the picks", async () => {
    const alImportar = vi.fn(async () => ({
      ok: true as const,
      medidoEn: "2026-10-30",
      resumen: ["Falta que elijas a qué post del Excel corresponden 2 publicaciones subidas a mano."],
      dudosos: [
        { piezaId: A, titulo: "Qué pasa cuando te dicen", fecha: "2026-10-07", opciones: [OPCION] },
        { piezaId: B, titulo: "Otra del mismo día", fecha: "2026-10-07", opciones: [OPCION] },
      ],
    }))
    const alGuardarDudosos = vi.fn(async () => ({
      ok: true as const,
      resumen: ["Listo: 1 publicación más con números."],
    }))
    render(<ImportarExcelDeLinkedin alImportar={alImportar} alGuardarDudosos={alGuardarDudosos} />)
    elegirArchivo(xlsx())

    const primera = await screen.findByLabelText("Qué pasa cuando te dicen")
    fireEvent.change(primera, { target: { value: OPCION.clave } })
    const enLaOtra = within(screen.getByLabelText("Otra del mismo día")).getByRole("option", {
      name: "miércoles 7 de octubre · 2.300 impresiones · 40 interacciones",
      hidden: true,
    })
    expect(enLaOtra).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    expect(alGuardarDudosos).toHaveBeenCalledWith({
      medidoEn: "2026-10-30",
      elegidos: [{ piezaId: A, clave: OPCION.clave, impresiones: 2300, interacciones: 40 }],
    })
    expect(await screen.findByText("Listo: 1 publicación más con números.")).toBeInTheDocument()
    expect(screen.queryByLabelText("Qué pasa cuando te dicen")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Otra del mismo día")).toBeInTheDocument()
  })

  it("shows the error the action returns", async () => {
    const alImportar = vi.fn(async () => ({
      ok: false as const,
      error: "Este no es el Excel de estadísticas de LinkedIn en español.",
    }))
    render(<ImportarExcelDeLinkedin alImportar={alImportar} alGuardarDudosos={vi.fn()} />)
    elegirArchivo(xlsx())
    expect(await screen.findByText(/Este no es el Excel de estadísticas de LinkedIn en español/)).toBeInTheDocument()
  })
})
