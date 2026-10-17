import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { type BrowserContext, expect, type Page } from "@playwright/test"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import { ETIQUETA_DE_FIRMA, TEXTO_ARMADO } from "@/lib/diseno/deslizador"
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

const Disparo = z.object({
  tarea: z.enum(["producir", "grabar", "voz"]),
  piezaId: z.string(),
  clave: z.string(),
  nueva: z.boolean().optional(),
  intento: z.number().optional(),
  retraso: z.string().optional(),
})

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

export async function capturar(page: Page, nombre: string, opciones: { completa?: boolean } = {}): Promise<string> {
  mkdirSync(CARPETA_DE_CAPTURAS, { recursive: true })
  const ruta = join(CARPETA_DE_CAPTURAS, `${nombre}.png`)
  await page.screenshot({ path: ruta, fullPage: opciones.completa ?? false })
  return ruta
}

const VOZ = readFileSync(join(__dirname, "fixtures", "voz.wav"))
const VIDEO = readFileSync(join(__dirname, "fixtures", "video.webm"))
const AVATAR_A = readFileSync(join(__dirname, "fixtures", "avatar-a.png"))
const AVATAR_B = readFileSync(join(__dirname, "fixtures", "avatar-b.png"))

/** The app signs links to a store that tests do not have: these answer them with two small real files. */
export async function simularMedios(page: Page): Promise<void> {
  await page.route("https://almacen.test/**", async (ruta) => {
    const url = ruta.request().url()
    if (url.includes("/voces/")) {
      await ruta.fulfill({ status: 200, contentType: "audio/wav", body: VOZ })
    } else if (url.includes("/avatares/")) {
      await ruta.fulfill({ status: 200, contentType: "image/png", body: url.includes("look-b") ? AVATAR_B : AVATAR_A })
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

/** A LinkedIn text that follows every rule of the review: the screens show it without a finding. */
export const TEXTO_LINKEDIN_VALIDO = [
  "Llevan diez años juntos y ya casi no se tocan.",
  "Pasa más de lo que se cuenta. Nadie decidió alejarse: el trabajo, los hijos y el cansancio fueron ocupando el espacio que antes era de los dos.",
  "Desde la psicología clínica y la sexología vemos que el deseo responde a las condiciones en que vivimos. Cuando falta descanso, falta tiempo a solas y falta conversación, el cuerpo baja la guardia del deseo sin avisar.",
  "Eso no habla de falta de amor. Habla de una rutina que se quedó sin pausas.",
  "Tres cosas que ayudan a muchas parejas:",
  "1️⃣ Poner un momento fijo para conversar sin pantallas.\n2️⃣ Hablar de lo que cada uno necesita antes de hablar de lo que falta.\n3️⃣ Cuidar el contacto cotidiano que no busca nada más: un abrazo largo, una mano en la espalda.",
  "Ninguna de las tres exige tiempo extra. Piden intención y un poco de repetición.",
  "Si trabajas con personas, en una consulta, en un colegio o en una empresa, esta mirada sirve igual: las conductas cambian cuando cambian las condiciones.",
  "¿En qué momento del día te cuesta más desconectarte del trabajo?",
  "Este video lo narra mi avatar digital, creado con IA a partir de mi imagen y mi voz. El contenido lo revisé y aprobé yo.",
  "#sexualidad #psicologia",
].join("\n\n")

interface EstadoDeServicios {
  anthropic?: "ok" | "401" | "500"
  heygen?: "ok" | "401"
  elevenlabs?: "ok" | "401"
  instagram?: "ok" | "rechazo"
  push?: "ok" | "410" | "503"
  heygenSaldo?: number
  elevenlabsUsados?: number
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

/** Drags the thumb of the sign track to the end, the way a finger does. */
export async function deslizarHastaElFinal(page: Page): Promise<void> {
  const pista = page.getByRole("slider", { name: ETIQUETA_DE_FIRMA })
  await pista.scrollIntoViewIfNeeded()
  const caja = await pista.boundingBox()
  const pulgar = await page.getByTestId("pulgar-firma").boundingBox()
  if (!caja || !pulgar) throw new Error("La firma no tiene caja")
  const y = pulgar.y + pulgar.height / 2
  await page.mouse.move(pulgar.x + pulgar.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(caja.x + caja.width, y, { steps: 14 })
  await page.mouse.up()
}

/** Signs without dragging: a tap arms the track, a second one after 400 ms signs (decision 5). */
export async function firmarConDosToques(page: Page): Promise<void> {
  const pista = page.getByRole("slider", { name: ETIQUETA_DE_FIRMA })
  await pista.click()
  await expect(pista).toHaveAttribute("aria-valuetext", TEXTO_ARMADO)
  // A second tap sooner than 400 ms is ignored as an accidental double tap: wait like a person would.
  await page.waitForTimeout(500)
  await pista.click()
}

/** Opens a native disclosure by the text of its summary, when it is folded. */
export async function abrirDesplegable(page: Page, titulo: string): Promise<void> {
  const detalles = page.locator("details", { has: page.locator("summary", { hasText: titulo }) }).first()
  const abierto = await detalles.evaluate((elemento) => (elemento as HTMLDetailsElement).open)
  if (!abierto) await detalles.locator("summary").first().click()
}
