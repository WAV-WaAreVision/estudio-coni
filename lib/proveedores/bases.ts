import { FallaDeConfiguracion } from "@/lib/dominio/falla"

type Entorno = Record<string, string | undefined>

/**
 * The address of a provider's API. Local runs (the E2E) point it at a fake service with an environment variable so
 * nothing real is called; a deployed app or task refuses the override, because Coni's keys would travel to that address.
 */
export function baseDe(entorno: Entorno, variable: string, porDefecto: string): string {
  const valor = entorno[variable]
  if (!valor) return porDefecto
  // Every task runs with Coni's keys where Trigger.dev runs them, so no override is honoured there.
  const enTareas = !!entorno.TRIGGER_SECRET_KEY
  // LinkedIn's token and Coni's profile go to this address, so its override is also refused in any production build.
  // No NODE_ENV check for the others: the E2E runs `next start` (a production build) against the fake services.
  const enProduccion = variable.startsWith("LINKEDIN_") && entorno.NODE_ENV === "production"
  if (entorno.VERCEL || enTareas || enProduccion) {
    throw new FallaDeConfiguracion(
      `${variable} no puede estar definida en Vercel ni en Trigger.dev: las llaves de Coni irían a otra dirección.`,
    )
  }
  return valor.replace(/\/+$/, "")
}
