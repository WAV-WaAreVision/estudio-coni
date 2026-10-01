import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { baseDe } from "./bases"

// Instagram API with Instagram Login, "Business Login for Instagram"
// (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login):
//   1. the authorization window, https://www.instagram.com/oauth/authorize, with client_id, redirect_uri,
//      response_type=code, scope and state; the redirect comes back with `code` (valid 1 hour, single use, with a
//      `#_` appended that is not part of it) or with error=access_denied when she cancels;
//   2. POST https://api.instagram.com/oauth/access_token (client_id, client_secret, grant_type=authorization_code,
//      redirect_uri, code) answers the short-lived token (1 hour);
//   3. GET https://graph.instagram.com/access_token (grant_type=ig_exchange_token, client_secret, access_token)
//      answers the long-lived token (`expires_in` seconds, 60 days); renewing it is `renovarToken` in instagram.ts;
//   4. GET /me?fields=user_id,username returns the Instagram professional account id (`user_id`, the <IG_ID> of
//      `/<IG_ID>/media`) (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started).
// Scopes of this login (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login):
// instagram_business_basic, instagram_business_content_publish, instagram_business_manage_comments and
// instagram_business_manage_messages. Publishing needs the first two; the app never answers comments or messages.
export const SCOPES_DE_INSTAGRAM = ["instagram_business_basic", "instagram_business_content_publish"] as const

const VENTANA = "https://www.instagram.com/oauth/authorize"
const BASE_OAUTH = "https://api.instagram.com"
const BASE_GRAFO = "https://graph.instagram.com"
const VERSION = "v25.0"
const ESPERA_MS = 30_000

/** Written for Coni: she is the one who can connect again. */
export const REFUSADA = "Instagram no aceptó la conexión. Vuelve a conectarla desde Ajustes."

interface App {
  appId: string
  appSecret: string
  redirectUri: string
}

/** Where Coni is sent to say yes. `estado` comes back untouched and proves that she started the connection. */
export function urlDeAutorizacion(entrada: Omit<App, "appSecret"> & { estado: string }): string {
  const consulta = new URLSearchParams({
    client_id: entrada.appId,
    redirect_uri: entrada.redirectUri,
    response_type: "code",
    scope: SCOPES_DE_INSTAGRAM.join(","),
    state: entrada.estado,
  })
  return `${VENTANA}?${consulta.toString()}`
}

function sinSecretos(texto: string, secretos: readonly string[]): string {
  return secretos.reduce((limpio, secreto) => (secreto ? limpio.split(secreto).join("[x]") : limpio), texto)
}

/** A 4xx is Instagram saying no (a code used twice, expired, a wrong secret): Coni connects again. The rest is retried. */
async function respuestaOError(respuesta: Response, secretos: readonly string[]): Promise<Error> {
  const detalle = sinSecretos((await respuesta.text()).slice(0, 300), secretos)
  console.error(`Instagram respondió HTTP ${respuesta.status} al conectar la cuenta: ${detalle}`)
  if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429) {
    return new Falla(REFUSADA)
  }
  return new Error(`Instagram respondió HTTP ${respuesta.status} al conectar la cuenta.`)
}

async function pedir(url: string, init: RequestInit, secretos: readonly string[]): Promise<string> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS) })
  } catch (error) {
    // Deliberately without the URL: a GET carries the token in it.
    throw new Error("No pude conectar con Instagram.", { cause: error })
  }
  if (!respuesta.ok) throw await respuestaOError(respuesta, secretos)
  return respuesta.text()
}

function leerJson<T>(esquema: z.ZodType<T>, texto: string, ruta: string): T {
  let cuerpo: unknown
  try {
    cuerpo = JSON.parse(texto)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Instagram devolvió una respuesta ilegible.", { cause: error })
    throw error
  }
  const resultado = esquema.safeParse(cuerpo)
  if (!resultado.success) throw new Error(`Instagram devolvió una respuesta inesperada en ${ruta}.`)
  return resultado.data
}

const RespuestaCorta = z.object({ access_token: z.string().min(1) })

/** Step 2: the code of the redirect for the short-lived token. */
export async function intercambiarCodigo(entrada: App & { codigo: string }): Promise<string> {
  const codigo = entrada.codigo.replace(/#_$/, "")
  const texto = await pedir(
    `${baseDe(process.env, "INSTAGRAM_OAUTH_BASE_URL", BASE_OAUTH)}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: entrada.appId,
        client_secret: entrada.appSecret,
        grant_type: "authorization_code",
        redirect_uri: entrada.redirectUri,
        code: codigo,
      }).toString(),
    },
    [entrada.appSecret, codigo],
  )
  return leerJson(RespuestaCorta, texto, "/oauth/access_token").access_token
}

const RespuestaLarga = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() })

/** Step 3: the short-lived token for the one that lasts 60 days. */
export async function aLargaDuracion(entrada: {
  appSecret: string
  token: string
}): Promise<{ token: string; expiraEnSegundos: number }> {
  const consulta = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: entrada.appSecret,
    access_token: entrada.token,
  })
  const texto = await pedir(
    `${baseDe(process.env, "INSTAGRAM_GRAPH_BASE_URL", BASE_GRAFO)}/access_token?${consulta.toString()}`,
    { method: "GET" },
    [entrada.appSecret, entrada.token],
  )
  const larga = leerJson(RespuestaLarga, texto, "/access_token")
  return { token: larga.access_token, expiraEnSegundos: larga.expires_in }
}

// An Instagram id has 17 digits, more than a JSON number holds exactly: it is quoted before parsing.
const ID_LARGO = /("(?:user_id|id)"\s*:\s*)(\d{15,})/g

const RespuestaDeCuenta = z.object({ user_id: z.string().min(1), username: z.string().optional() })

/** Step 4: the Instagram professional account the token belongs to. */
export async function leerCuenta(entrada: { token: string }): Promise<{ cuentaId: string; usuario: string | null }> {
  const consulta = new URLSearchParams({ fields: "user_id,username", access_token: entrada.token })
  const texto = await pedir(
    `${baseDe(process.env, "INSTAGRAM_GRAPH_BASE_URL", BASE_GRAFO)}/${VERSION}/me?${consulta.toString()}`,
    { method: "GET" },
    [entrada.token],
  )
  const cuenta = leerJson(RespuestaDeCuenta, texto.replace(ID_LARGO, '$1"$2"'), "/me")
  return { cuentaId: cuenta.user_id, usuario: cuenta.username ?? null }
}
