import type { NextRequest } from "next/server"
import { leerAppDeLinkedin, terminarConexionLinkedin } from "@/lib/acciones/linkedin"
import { COOKIE_DE_ESTADO_LINKEDIN, RUTA_DE_LA_COOKIE_LINKEDIN } from "@/lib/acciones/linkedin-cookie"
import { RUTA_DE_CUENTAS } from "@/lib/ajustes/estado"
import { leerSesion } from "@/lib/sesion/coni"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

// Where LinkedIn sends Coni back. Only the outcome travels to Cuentas conectadas, as a fixed word.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion()
  if (sesion.estado !== "coni") return irA(RUTA_DE_INGRESO)

  const parametros = request.nextUrl.searchParams
  const resultado = await terminarConexionLinkedin(
    { db: sesion.db, app: leerAppDeLinkedin(process.env), ahora: () => new Date().toISOString() },
    {
      codigo: parametros.get("code") ?? undefined,
      estado: parametros.get("state"),
      estadoGuardado: request.cookies.get(COOKIE_DE_ESTADO_LINKEDIN)?.value,
      errorDeLinkedin: parametros.get("error"),
    },
  )

  const respuesta = irA(`${RUTA_DE_CUENTAS}?linkedin=${resultado.ok ? "conectada" : resultado.motivo}`)
  respuesta.cookies.set(COOKIE_DE_ESTADO_LINKEDIN, "", { path: RUTA_DE_LA_COOKIE_LINKEDIN, maxAge: 0 })
  return respuesta
}
