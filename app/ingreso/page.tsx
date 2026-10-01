import { correoDeConi, enmascararCorreo } from "@/lib/acciones/ingreso"
import { FormularioIngreso } from "./formulario-ingreso"

export const dynamic = "force-dynamic"

export default function Ingreso() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[560px] content-start px-4.5 pt-[max(4rem,env(safe-area-inset-top))] pb-8">
      <FormularioIngreso correoEnmascarado={enmascararCorreo(correoDeConi(process.env))} />
    </main>
  )
}
