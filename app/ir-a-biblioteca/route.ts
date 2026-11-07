import { leerSesion } from "@/lib/sesion/coni"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO, RUTA_DE_LA_BIBLIOTECA } from "@/lib/sesion/rutas"

export const dynamic = "force-dynamic"

// The old Biblioteca tab (change 29a), kept for old links and the home-screen icon: the Biblioteca lives in the app now.
export async function GET() {
  const sesion = await leerSesion()
  if (sesion.estado === "sin_sesion") return irA(RUTA_DE_INGRESO)
  if (sesion.estado === "otra_persona") return irA("/")
  return irA(RUTA_DE_LA_BIBLIOTECA)
}
