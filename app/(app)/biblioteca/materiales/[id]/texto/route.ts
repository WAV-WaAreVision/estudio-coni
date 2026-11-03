import { pedirTextoOriginal, SobreMaterial } from "@/lib/acciones/biblioteca"
import { ERROR_GENERICO, ERROR_SESION_VENCIDA, ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { conSesionDeConi } from "@/lib/acciones/servidor"
import { NO_ENCONTRE } from "@/lib/dominio/biblioteca/subir"
import { almacenReal } from "@/lib/proveedores/almacen"

const SIN_CACHE = { "cache-control": "no-store" }

/** 404 only when the text is not there (or the id is not one); a session, a person or our side failing say so. */
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
 * Sends the browser to a five-minute signed download of the original text (D12). The person is checked here, not by
 * the page that links to it: a route handler is a public endpoint like a Server Action. The file goes from R2 to her.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!SobreMaterial.safeParse({ materialId: id }).success) return texto(NO_ENCONTRE, 404)
  const resultado = await conSesionDeConi("pedirTextoOriginal", SobreMaterial, { materialId: id }, (db, datos) =>
    pedirTextoOriginal({ db, almacen: { urlDeTexto: (m, s) => almacenReal().urlDeTexto(m, s) } }, datos.materialId),
  )
  if (!resultado.ok) return texto(resultado.error, ESTADO_POR_ERROR[resultado.error] ?? 404)
  return new Response(null, { status: 302, headers: { location: resultado.url, ...SIN_CACHE } })
}
