"use client"

import { useEffect } from "react"
import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { CLASES_DE_ENLACE_PUBLICO, SuperficiePublica } from "../superficie-publica"

// Not the app's error screen: a visitor gets the page's look, one sentence and the way back.
export default function ErrorDePaginaDeIa({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("/l/ia no pudo cargar", error)
  }, [error])

  return (
    <SuperficiePublica>
      <h1 className="text-pantalla font-semibold tracking-[-0.022em] text-balance">{TITULO_DE_TRANSPARENCIA}</h1>
      <p className="text-cuerpo">No pude cargar esta página. Inténtalo de nuevo en unos minutos.</p>
      <a href="/l" className={CLASES_DE_ENLACE_PUBLICO}>
        Volver a mis enlaces
      </a>
    </SuperficiePublica>
  )
}
