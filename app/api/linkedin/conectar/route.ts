import { type NextRequest, NextResponse } from "next/server"
import { nuevoEstado } from "@/lib/acciones/estado-oauth"
import { leerAppDeLinkedin } from "@/lib/acciones/linkedin"
import { COOKIE_DE_ESTADO_LINKEDIN, opcionesDeLaCookieLinkedin } from "@/lib/acciones/linkedin-cookie"
import { RUTA_DE_CUENTAS } from "@/lib/ajustes/estado"
import { urlDeAutorizacionLinkedin } from "@/lib/proveedores/linkedin-oauth"
import { leerSesion } from "@/lib/sesion/coni"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

// "Conectar LinkedIn" and "Renovar LinkedIn": sends Coni to LinkedIn with a state that only this browser knows.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion()
  if (sesion.estado !== "coni") return irA(RUTA_DE_INGRESO)

  const app = leerAppDeLinkedin(process.env)
  if (!app) return irA(`${RUTA_DE_CUENTAS}?linkedin=sin_app`)

  const estado = nuevoEstado()
  const respuesta = NextResponse.redirect(
    urlDeAutorizacionLinkedin({ clientId: app.clientId, redirectUri: app.redirectUri, estado }),
  )
  respuesta.cookies.set(
    COOKIE_DE_ESTADO_LINKEDIN,
    estado,
    opcionesDeLaCookieLinkedin(request.nextUrl.protocol === "https:"),
  )
  return respuesta
}
