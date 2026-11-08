import type { NextRequest } from "next/server"
import { leerAppDeMeta, terminarConexion } from "@/lib/acciones/instagram"
import { COOKIE_DE_ESTADO, RUTA_DE_LA_COOKIE } from "@/lib/acciones/instagram-cookie"
import { avisarConexionFallida } from "@/lib/acciones/conexion-fallida"
import { RUTA_DE_CUENTAS } from "@/lib/ajustes/estado"
import { avisosReales } from "@/lib/proveedores/avisos"
import { leerSesion } from "@/lib/sesion/coni"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

// Where Instagram sends Coni back. Only the outcome travels to Cuentas conectadas, as a fixed word, never any text of the request.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion()
  if (sesion.estado !== "coni") return irA(RUTA_DE_INGRESO)

  const parametros = request.nextUrl.searchParams
  const resultado = await terminarConexion(
    { db: sesion.db, app: leerAppDeMeta(process.env), ahora: () => new Date().toISOString() },
    {
      codigo: parametros.get("code") ?? undefined,
      estado: parametros.get("state"),
      estadoGuardado: request.cookies.get(COOKIE_DE_ESTADO)?.value,
      errorDeInstagram: parametros.get("error"),
    },
  )

  const ahora = () => new Date().toISOString()
  // Issue 111: a failure only WAV can fix is told to him here; the notice says so only when the email went out.
  const avisado =
    !resultado.ok && (await avisarConexionFallida({ avisos: () => avisosReales(), ahora }, "instagram", resultado.motivo))
  const destino = `${RUTA_DE_CUENTAS}?instagram=${resultado.ok ? "conectada" : resultado.motivo}`
  const respuesta = irA(avisado ? `${destino}&federico=avisado` : destino)
  // The state is good for one try.
  respuesta.cookies.set(COOKIE_DE_ESTADO, "", { path: RUTA_DE_LA_COOKIE, maxAge: 0 })
  return respuesta
}
