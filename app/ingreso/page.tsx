import { Wordmark } from "@/components/ui/wordmark"
import { correoDeConi, enmascararCorreo } from "@/lib/acciones/ingreso"
import { FormularioIngreso } from "./formulario-ingreso"

export const dynamic = "force-dynamic"

export default function Ingreso() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[560px] content-start px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[var(--final-pagina)]">
      <Wordmark className="mb-16" />
      <FormularioIngreso correoEnmascarado={enmascararCorreo(correoDeConi(process.env))} />
    </main>
  )
}
