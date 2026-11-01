import type { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"
import { instanteEnPalabras } from "@/lib/datos-personales/fechas"
import { COLOR_DE_FIRMA } from "@/lib/diseno/marca"
import { NOMBRE_PUBLICO } from "@/lib/enlaces/perfil"
import { clienteAnonimo, leerTransparenciaVigente } from "@/lib/transparencia/publica"
import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { PaginaPublicaDeIa } from "./pagina-de-ia"

// Coni's to change: read on every request, no session, no client script.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: `${TITULO_DE_TRANSPARENCIA} · ${NOMBRE_PUBLICO}`,
  description: `Cómo usa inteligencia artificial ${NOMBRE_PUBLICO} en su contenido.`,
  robots: { index: true, follow: true },
}

export const viewport: Viewport = { themeColor: COLOR_DE_FIRMA, colorScheme: "light" }

/** Her calendar for «Actualizado el»: a public page reads no settings. */
const ZONA_PUBLICA = "America/Santiago"

export default async function PaginaDeIa() {
  // A failed read throws on purpose: error.tsx answers with an error page, never with a 404 that says "nothing here".
  const vigente = await leerTransparenciaVigente(clienteAnonimo())
  if (!vigente) notFound()
  return (
    <PaginaPublicaDeIa
      texto={vigente.texto}
      actualizado={instanteEnPalabras(vigente.creadaEn, ZONA_PUBLICA, { anio: true })}
    />
  )
}
