import { RedElegida, recordarRed } from "@/lib/acciones/biblioteca"
import { ERROR_GENERICO, ERROR_SESION_VENCIDA, ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { conSesionDeConi } from "@/lib/acciones/servidor"

const SIN_CACHE = { "cache-control": "no-store" }

/** Anything else is a request it did not understand (the schema's refusal). */
const ESTADO_POR_ERROR: Record<string, number> = {
  [ERROR_SESION_VENCIDA]: 401,
  [ERROR_SOLO_CONI]: 403,
  [ERROR_GENERICO]: 502,
}

function texto(mensaje: string, estado: number): Response {
  return new Response(mensaje, {
    status: estado,
    headers: { "content-type": "text/plain; charset=utf-8", ...SIN_CACHE },
  })
}

/**
 * Records the network Temas showed (spec 2026-11-04, part 15b). A route handler, not a Server Action: Temas fires it on
 * mount, and a tap that leaves Temas at once discards a pending Server Action in Next 16.2.6's router queue; when the
 * discarded one finishes, the queue drops the navigation running then, and the next Server Action's redirect (saving a
 * draft, 15c) never lands. A plain request never enters that queue. The person is checked here, as in an action.
 */
export async function POST(request: Request) {
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return texto("No entendí esa solicitud. Vuelve a abrir la pantalla.", 400)
  }
  const resultado = await conSesionDeConi("recordarRed", RedElegida, cuerpo, (db, elegida) =>
    recordarRed({ db }, elegida),
  )
  if (!resultado.ok) return texto(resultado.error, ESTADO_POR_ERROR[resultado.error] ?? 400)
  return new Response(null, { status: 204, headers: SIN_CACHE })
}
