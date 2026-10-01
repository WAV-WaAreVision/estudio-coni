import { redirect } from "next/navigation"
import { BarraSinConexion } from "@/components/barra-sin-conexion"
import { NavInferior } from "@/components/nav-inferior"
import { leerSesion } from "@/lib/sesion/coni"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"
import { SoloParaConi } from "./solo-para-coni"

// One centred column on every screen size; on a tablet or a computer the bar goes to the top (DESIGN.md, Adaptation).
export default async function DisenoDeLaApp({ children }: Readonly<{ children: React.ReactNode }>) {
  const sesion = await leerSesion()
  if (sesion.estado === "sin_sesion") redirect(RUTA_DE_INGRESO)
  if (sesion.estado === "otra_persona") return <SoloParaConi />

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col md:flex-col-reverse md:justify-end">
      <BarraSinConexion />
      <main className="flex-1 px-4.5 pt-[max(1rem,env(safe-area-inset-top))] pb-6">{children}</main>
      <NavInferior />
    </div>
  )
}
