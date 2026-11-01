import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { CLASES_DE_ENLACE_PUBLICO, SuperficiePublica } from "../superficie-publica"

// Not the app's 404: a visitor who arrives before Coni publishes gets the page's look and the way back.
export default function PaginaNoPublicada() {
  return (
    <SuperficiePublica>
      <h1 className="text-pantalla font-semibold tracking-[-0.022em] text-balance">{TITULO_DE_TRANSPARENCIA}</h1>
      <p className="text-cuerpo">Esta página todavía no está publicada.</p>
      <a href="/l" className={CLASES_DE_ENLACE_PUBLICO}>
        Volver a mis enlaces
      </a>
    </SuperficiePublica>
  )
}
