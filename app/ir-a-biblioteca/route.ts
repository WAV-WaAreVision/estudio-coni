import { clienteDeServicio } from "@/lib/acciones/servidor"
import { FaltaVariableDeEntorno } from "@/lib/env"
import { leerSesion } from "@/lib/sesion/coni"
import { abrirPuente, RUTA_DE_FALLO_DEL_PUENTE } from "@/lib/sesion/puente"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

export const dynamic = "force-dynamic"

// The Biblioteca tab (change 29a). The service role is used here only, behind Coni's own session, to mint a link that
// signs in Coni herself (lib/sesion/puente.ts).
export async function GET() {
  const sesion = await leerSesion()
  if (sesion.estado === "sin_sesion") return irA(RUTA_DE_INGRESO)
  if (sesion.estado === "otra_persona") return irA("/")

  const admin = adminDelServicio()
  if (admin === null) return irA(RUTA_DE_FALLO_DEL_PUENTE)

  const puente = await abrirPuente({
    admin,
    correo: sesion.correo,
    urlDeIngesta: process.env.INGESTA_URL,
    entorno: process.env.NODE_ENV,
  })
  if (puente.tipo === "fallo") return irA(RUTA_DE_FALLO_DEL_PUENTE)
  return new Response(puente.html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "strict-origin",
    },
  })
}

// A missing setting is a deploy mistake Coni cannot fix: she gets the plain failure page instead of a 500, and the log
// names the variable, never its value.
function adminDelServicio() {
  try {
    return clienteDeServicio().auth.admin
  } catch (error) {
    if (!(error instanceof FaltaVariableDeEntorno)) throw error
    console.error(`La Biblioteca no se puede abrir: falta la variable de entorno ${error.nombre}.`)
    return null
  }
}
