import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import type { BrowserContext, Page } from "@playwright/test"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  ARCHIVO_DE_DISPAROS,
  BUZON,
  CARPETA_DE_CAPTURAS,
  CLAVE_ANONIMA,
  CLAVE_DE_SERVICIO,
  SUPABASE_URL,
  URL_DE_LA_APP,
  URL_SERVICIOS,
} from "./entorno"

const Mensajes = z.object({
  messages: z.array(z.object({ To: z.array(z.object({ Address: z.string() })), Snippet: z.string() })),
})

export async function vaciarBuzon(): Promise<void> {
  const respuesta = await fetch(`${BUZON}/api/v1/messages`, { method: "DELETE" })
  if (!respuesta.ok) throw new Error(`No pude vaciar el buzón local: ${respuesta.status}`)
}

/** The six digits of the newest email sent to `correo`, read from the local mail catcher (never a real mailbox). */
export async function leerCodigo(correo: string): Promise<string> {
  for (let intento = 0; intento < 30; intento++) {
    const respuesta = await fetch(`${BUZON}/api/v1/messages`)
    const { messages } = Mensajes.parse(await respuesta.json())
    const mensaje = messages.find((candidato) => candidato.To.some((para) => para.Address === correo))
    const codigo = /\b(\d{6})\b/.exec(mensaje?.Snippet ?? "")?.[1]
    if (codigo) return codigo
    await new Promise((resolver) => setTimeout(resolver, 500))
  }
  throw new Error(`No llegó ningún código a ${correo} al buzón local.`)
}

const Disparo = z.object({ tarea: z.enum(["producir", "grabar"]), piezaId: z.string(), clave: z.string() })

export function limpiarDisparos(): void {
  mkdirSync(dirname(ARCHIVO_DE_DISPAROS), { recursive: true })
  rmSync(ARCHIVO_DE_DISPAROS, { force: true })
}

/** The background runs the app would have started (Trigger.dev is never called in tests). */
export function disparosRegistrados(): z.infer<typeof Disparo>[] {
  if (!existsSync(ARCHIVO_DE_DISPAROS)) return []
  return readFileSync(ARCHIVO_DE_DISPAROS, "utf-8")
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    .map((linea) => Disparo.parse(JSON.parse(linea)))
}

/** An alert with that text. Next adds its own empty `role=alert` (the route announcer), so a bare role matches two. */
export function alerta(page: Page, texto: string) {
  return page.getByRole("alert").filter({ hasText: texto })
}

export async function capturar(page: Page, nombre: string): Promise<string> {
  mkdirSync(CARPETA_DE_CAPTURAS, { recursive: true })
  const ruta = join(CARPETA_DE_CAPTURAS, `${nombre}.png`)
  await page.screenshot({ path: ruta })
  return ruta
}

const VOZ = readFileSync(join(__dirname, "fixtures", "voz.wav"))
const VIDEO = readFileSync(join(__dirname, "fixtures", "video.webm"))

/** The app signs links to a store that tests do not have: these answer them with two small real files. */
export async function simularMedios(page: Page): Promise<void> {
  await page.route("https://almacen.test/**", async (ruta) => {
    const url = ruta.request().url()
    if (url.includes("/voces/")) {
      await ruta.fulfill({ status: 200, contentType: "audio/wav", body: VOZ })
    } else if (url.includes("/videos/")) {
      await ruta.fulfill({ status: 200, contentType: "video/webm", body: VIDEO })
    } else {
      await ruta.fulfill({ status: 404, body: "" })
    }
  })
}

/** Signs a seed user in through the real Auth API and gives the browser the cookies the app itself would have set. */
export async function entrarComo(context: BrowserContext, correo: string): Promise<void> {
  const servicio = createClient(SUPABASE_URL, CLAVE_DE_SERVICIO, { auth: { persistSession: false } })
  const enlace = await servicio.auth.admin.generateLink({ type: "magiclink", email: correo })
  if (enlace.error) throw new Error(`No pude generar el código de ${correo}: ${enlace.error.message}`)
  const galletas = new Map<string, string>()
  const cliente = createServerClient(SUPABASE_URL, CLAVE_ANONIMA, {
    cookies: {
      getAll: () => [...galletas].map(([name, value]) => ({ name, value })),
      setAll: (nuevas) => {
        for (const { name, value } of nuevas) galletas.set(name, value)
      },
    },
  })
  const sesion = await cliente.auth.verifyOtp({ email: correo, token: enlace.data.properties.email_otp, type: "email" })
  if (sesion.error) throw new Error(`No pude entrar como ${correo}: ${sesion.error.message}`)
  await context.clearCookies()
  await context.addCookies([...galletas].map(([name, value]) => ({ name, value, url: URL_DE_LA_APP })))
}

export const GUION_VALIDO = readFileSync(
  join(__dirname, "..", "fixtures", "goldens", "2026-09-30-deseo-se-esconde", "guion.txt"),
  "utf-8",
).trim()
export const TEXTO_VALIDO =
  "El deseo no se apaga: se esconde detrás del cansancio y la rutina.\n\nVideo hecho con mi avatar digital."

interface EstadoDeServicios {
  anthropic?: "ok" | "401" | "500"
  heygen?: "ok" | "401"
  elevenlabs?: "ok" | "401"
  instagram?: "ok" | "rechazo"
  push?: "ok" | "410" | "503"
}

/** Steers the fake outside world and clears what it remembers. */
export async function configurarServicios(estado: EstadoDeServicios = {}): Promise<void> {
  const respuesta = await fetch(`${URL_SERVICIOS}/__estado`, { method: "POST", body: JSON.stringify(estado) })
  if (!respuesta.ok) throw new Error(`No pude configurar los servicios falsos: ${respuesta.status}`)
}

const Registro = z.array(z.object({ metodo: z.string(), ruta: z.string(), cuerpo: z.string() }))

/** What the fake outside world was asked since `configurarServicios`. */
export async function registroDeServicios() {
  return Registro.parse(await (await fetch(`${URL_SERVICIOS}/__registro`)).json())
}

const HOSTS_PERMITIDOS = new Set(["127.0.0.1", "localhost", "almacen.test"])

/**
 * Nothing real is reachable from a spec: every request to a host that is not the app, the local stack or the fake store
 * is aborted. Routes a spec registers afterwards take precedence, so it can still answer a specific external address.
 */
export async function bloquearRedExterna(page: Page): Promise<void> {
  await page.route(
    (url) => !HOSTS_PERMITIDOS.has(url.hostname),
    (ruta) => ruta.abort("blockedbyclient"),
  )
}
