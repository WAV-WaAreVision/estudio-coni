import type { AuthError } from "@supabase/supabase-js"

type RespuestaDelEnlace = {
  data: { properties: { hashed_token: string } | null }
  error: Pick<AuthError, "message" | "status" | "code"> | null
}

/** The one call of the Auth admin API the bridge needs; a test passes a fake. */
export interface AdminDelPuente {
  generateLink(args: { type: "magiclink"; email: string }): PromiseLike<RespuestaDelEnlace>
}

export interface DepsDelPuente {
  admin: AdminDelPuente
  /** Coni's address, from her own session: the link only ever signs in the person who asked for it. */
  correo: string | null
  urlDeIngesta: string | undefined
  /** NODE_ENV: production only trusts https, so the token never travels in clear text. */
  entorno: string | undefined
}

export type Puente = { tipo: "formulario"; html: string } | { tipo: "fallo" }

export const RUTA_DE_FALLO_DEL_PUENTE = "/biblioteca-no-abrio"
export const TEXTO_FALLO_DEL_PUENTE = "No pude abrir la Biblioteca. Vuelve a intentarlo en un momento."
const RUTA_DEL_PUENTE_EN_INGESTA = "/ingreso/puente"

function destinoDelPuente(urlDeIngesta: string | undefined, entorno: string | undefined): string | null {
  if (!urlDeIngesta || !URL.canParse(urlDeIngesta)) return null
  const base = new URL(urlDeIngesta)
  const protocolos = entorno === "production" ? ["https:"] : ["https:", "http:"]
  if (!protocolos.includes(base.protocol)) return null
  // From the origin only: a user or password written into INGESTA_URL never reaches the page.
  return new URL(RUTA_DEL_PUENTE_EN_INGESTA, base.origin).toString()
}

const escapar = (texto: string) =>
  texto.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

/** A form that posts the token to Ingesta and submits itself; the button is for a browser without JavaScript. */
function paginaDelPuente(accion: string, token: string): string {
  return `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex">
<title>Abriendo la Biblioteca</title>
</head>
<body>
<form id="puente" method="post" action="${escapar(accion)}">
<input type="hidden" name="token_hash" value="${escapar(token)}">
<p>Abriendo la Biblioteca…</p>
<button type="submit">Abrir la Biblioteca</button>
</form>
<script>document.getElementById("puente").submit()</script>
</body>
</html>`
}

/**
 * The Biblioteca tab (change 29a, spec 2026-11-02-biblioteca-misma-sesion-design.md): a one-time login link for Coni,
 * minted with the service role (`generateLink` sends no email, B11) and carried to Ingesta in a POST body, so the token
 * never reaches a URL, a log line or a referrer. The only function that calls `generateLink`.
 */
export async function abrirPuente(deps: DepsDelPuente): Promise<Puente> {
  const accion = destinoDelPuente(deps.urlDeIngesta, deps.entorno)
  if (!accion) {
    console.error(
      "Falta INGESTA_URL o no es una dirección válida (https en producción): la Biblioteca no se puede abrir.",
    )
    return { tipo: "fallo" }
  }
  if (!deps.correo) {
    console.error("La sesión de Coni no trae su correo: la Biblioteca no se puede abrir.")
    return { tipo: "fallo" }
  }
  const { data, error } = await deps.admin.generateLink({ type: "magiclink", email: deps.correo })
  if (error || !data.properties) {
    console.error("No pude generar el enlace de la Biblioteca", {
      status: error?.status,
      code: error?.code,
      mensaje: error?.message,
    })
    return { tipo: "fallo" }
  }
  return { tipo: "formulario", html: paginaDelPuente(accion, data.properties.hashed_token) }
}
