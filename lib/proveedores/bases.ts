import { FallaDeConfiguracion } from "@/lib/dominio/falla"

type Entorno = Record<string, string | undefined>

/**
 * The address of a provider's API. Local runs (the E2E) point it at a fake service with an environment variable so
 * nothing real is called; a deployed app refuses the override, because Coni's keys would travel to that address.
 */
export function baseDe(entorno: Entorno, variable: string, porDefecto: string): string {
  const valor = entorno[variable]
  if (!valor) return porDefecto
  // LinkedIn's token and Coni's profile go to this address, so its override is also refused in any production build
  // and wherever Trigger.dev runs the tasks: a stray variable there must never redirect them.
  const enProduccion =
    variable.startsWith("LINKEDIN_") && (entorno.NODE_ENV === "production" || !!entorno.TRIGGER_SECRET_KEY)
  if (entorno.VERCEL || enProduccion) {
    throw new FallaDeConfiguracion(
      `${variable} no puede estar definida en Vercel: las llaves de Coni irían a otra dirección.`,
    )
  }
  return valor.replace(/\/+$/, "")
}
