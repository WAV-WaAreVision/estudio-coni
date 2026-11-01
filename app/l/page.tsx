import { ArrowRight } from "@phosphor-icons/react/dist/ssr"
import type { Metadata, Viewport } from "next"
import { ICONO } from "@/components/ui/icono"
import { COLOR_DE_FIRMA } from "@/lib/diseno/marca"
import { type Enlace, leerEnlaces } from "@/lib/enlaces/config"
import { clienteDeEnlaces } from "@/lib/enlaces/deps-reales"
import { AVISO_PUBLICO, NOMBRE_PUBLICO, TITULO_PUBLICO } from "@/lib/enlaces/perfil"
import { clienteAnonimo, leerTransparenciaVigente } from "@/lib/transparencia/publica"
import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { CLASES_DE_ENLACE_PUBLICO } from "./superficie-publica"

// The links are Coni's to change: read on every request, no session, no client script.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: `${NOMBRE_PUBLICO} · ${TITULO_PUBLICO}`,
  description: `Agenda una consulta y conoce el taller, los libros y la fundación de ${NOMBRE_PUBLICO}.`,
  // The app is private and says so in its root layout; this page is the one meant to be found.
  robots: { index: true, follow: true },
}

export const viewport: Viewport = { themeColor: COLOR_DE_FIRMA, colorScheme: "light" }

async function enlacesDeLaPagina(): Promise<Enlace[]> {
  try {
    return await leerEnlaces(clienteDeEnlaces())
  } catch (error) {
    // A public page never shows an error (design, Pass 2): without its settings it shows her name and the notice.
    console.error("/l no pudo leer sus enlaces", error)
    return []
  }
}

async function hayPaginaDeIa(): Promise<boolean> {
  try {
    return (await leerTransparenciaVigente(clienteAnonimo())) !== null
  } catch (error) {
    // Like the links: the page stays up without the footer link, and WAV finds the reason in the logs.
    console.error("/l no pudo leer la página de IA", error)
    return false
  }
}

// Text on the raspberry surface is always the full on-signature colour: any opacity would take the small print below
// 4.5:1 (brandkit 2). Focus is drawn in the same colour because the global ink ring would be dark on dark here.
export default async function PaginaPublica() {
  const [enlaces, conPaginaDeIa] = await Promise.all([enlacesDeLaPagina(), hayPaginaDeIa()])

  return (
    <div data-superficie="marca" className="min-h-dvh bg-firma text-sobre-firma">
      <main className="mx-auto grid w-full max-w-[560px] content-start gap-8 px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <header className="grid gap-3">
          <h1 className="text-marca font-semibold tracking-[-0.022em] text-balance">{NOMBRE_PUBLICO}</h1>
          <p className="text-cuerpo">{TITULO_PUBLICO}</p>
        </header>

        {enlaces.length > 0 ? (
          <nav aria-label="Enlaces">
            <ul>
              {enlaces.map((enlace) => (
                <li key={enlace.id} className="border-b border-sobre-firma/40 first:border-t">
                  <a
                    href={`/l/ir/${enlace.id}`}
                    className="grid min-h-fila grid-cols-[1fr_auto] items-center gap-x-3 py-4 outline-offset-2 transition-opacity duration-[var(--dur-corta)] focus-visible:outline-sobre-firma active:opacity-80 motion-reduce:transition-none"
                  >
                    <span className="text-cuerpo font-semibold leading-tight">{enlace.titulo}</span>
                    <ArrowRight aria-hidden="true" size={ICONO.grande} className="row-span-2" />
                    {enlace.detalle ? <span className="text-meta">{enlace.detalle}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <p className="text-meta">{AVISO_PUBLICO}</p>
        {conPaginaDeIa ? (
          <a href="/l/ia" className={`text-meta ${CLASES_DE_ENLACE_PUBLICO}`}>
            {TITULO_DE_TRANSPARENCIA}
          </a>
        ) : null}
      </main>
    </div>
  )
}
