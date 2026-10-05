import { type NextRequest, NextResponse } from "next/server"
import { leerAppDeMeta, nuevoEstado } from "@/lib/acciones/instagram"
import { COOKIE_DE_ESTADO, opcionesDeLaCookie } from "@/lib/acciones/instagram-cookie"
import { RUTA_DE_CUENTAS } from "@/lib/ajustes/estado"
import { urlDeAutorizacion } from "@/lib/proveedores/instagram-oauth"
import { leerSesion } from "@/lib/sesion/coni"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

// "Conectar Instagram": sends Coni to Instagram's window with a state that only this browser knows.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion()
  if (sesion.estado !== "coni") return irA(RUTA_DE_INGRESO)

  const app = leerAppDeMeta(process.env)
  if (!app) return irA(`${RUTA_DE_CUENTAS}?instagram=sin_app`)

  const estado = nuevoEstado()
  const respuesta = NextResponse.redirect(urlDeAutorizacion({ ...app, estado }))
  respuesta.cookies.set(COOKIE_DE_ESTADO, estado, opcionesDeLaCookie(request.nextUrl.protocol === "https:"))
  return respuesta
}
