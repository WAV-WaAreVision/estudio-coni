import { exigirConi } from "@/lib/sesion/coni"

// Only Coni enters the Biblioteca in Conidolly (A6). The marker lets the (app) column widen on a computer (D4).
export default async function DisenoDeLaBiblioteca({ children }: Readonly<{ children: React.ReactNode }>) {
  await exigirConi()
  return (
    <div data-ancho="biblioteca" className="grid gap-5">
      {children}
    </div>
  )
}
