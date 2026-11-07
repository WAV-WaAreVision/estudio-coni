import { redirect } from "next/navigation"
import { BarraSinConexion } from "@/components/barra-sin-conexion"
import { NavInferior } from "@/components/nav-inferior"
import { leerSesion } from "@/lib/sesion/coni"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"
import { SoloParaConi } from "./solo-para-coni"

// One centred column on every screen size; on a tablet or a computer the bar goes to the top (brandkit 5). The
// Biblioteca marks itself (data-ancho) so the column widens there on a computer, for its table and side panel; the four
// signing gates do too (gate 1 of a reel and of a carousel, gate 2 of a video and of a carousel), for what she reviews
// beside the signature; Inicio too, for its side column. A gate that falls back to one column keeps 560 px itself (components/puerta-en-columnas.ts).
// If cacheComponents is ever enabled, hidden routes keep their DOM and this marker would widen every other screen.
export default async function DisenoDeLaApp({ children }: Readonly<{ children: React.ReactNode }>) {
  const sesion = await leerSesion()
  if (sesion.estado === "sin_sesion") redirect(RUTA_DE_INGRESO)
  if (sesion.estado === "otra_persona") return <SoloParaConi />

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col md:flex-col-reverse md:justify-end md:has-[[data-ancho=biblioteca]]:max-w-[76rem] md:has-[[data-ancho=puerta]]:max-w-[70rem] md:has-[[data-ancho=inicio]]:max-w-[70rem]">
      <BarraSinConexion />
      <main className="flex-1 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[var(--final-pagina)]">{children}</main>
      <NavInferior />
    </div>
  )
}
