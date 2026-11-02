import { pedirTextoOriginal, SobreMaterial } from "@/lib/acciones/biblioteca"
import { conSesionDeConi } from "@/lib/acciones/servidor"
import { almacenReal } from "@/lib/proveedores/almacen"

const SIN_CACHE = { "cache-control": "no-store" }

/**
 * Sends the browser to a five-minute signed download of the original text (D12). The person is checked here, not by
 * the page that links to it: a route handler is a public endpoint like a Server Action. The file goes from R2 to her.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const resultado = await conSesionDeConi("pedirTextoOriginal", SobreMaterial, { materialId: id }, (db, datos) =>
    pedirTextoOriginal({ db, almacen: { urlDeTexto: (m, s) => almacenReal().urlDeTexto(m, s) } }, datos.materialId),
  )
  if (!resultado.ok) {
    return new Response(resultado.error, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", ...SIN_CACHE },
    })
  }
  return new Response(null, { status: 302, headers: { location: resultado.url, ...SIN_CACHE } })
}
