import { Boton } from "@/components/ui/boton"
import { cerrarSesionAccion } from "./acciones"

// Whoever else signs in (the maintainer included) sees only this: the data is Coni's.
export function SoloParaConi() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[560px] content-start gap-5.5 px-4.5 pt-16">
      <h1 className="font-serif text-display text-balance">Esta app es solo para Coni.</h1>
      <form action={cerrarSesionAccion}>
        <Boton type="submit" variante="linea">
          Salir
        </Boton>
      </form>
    </main>
  )
}
