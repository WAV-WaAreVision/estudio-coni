import { TextoEnParrafos } from "@/components/texto-en-parrafos"
import { NOMBRE_PUBLICO } from "@/lib/enlaces/perfil"
import { TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { CLASES_DE_ENLACE_PUBLICO, SuperficiePublica } from "../superficie-publica"

export function PaginaPublicaDeIa({ texto, actualizado }: { texto: string; actualizado: string }) {
  return (
    <SuperficiePublica>
      <header className="grid gap-3">
        <p className="text-cuerpo font-semibold">{NOMBRE_PUBLICO}</p>
        <h1 className="text-pantalla font-semibold tracking-[-0.022em] text-balance">{TITULO_DE_TRANSPARENCIA}</h1>
      </header>
      <TextoEnParrafos texto={texto} className="text-cuerpo leading-prosa" />
      <footer className="grid gap-3 text-meta">
        <p>{`Actualizado el ${actualizado}.`}</p>
        <a href="/l" className={CLASES_DE_ENLACE_PUBLICO}>
          Volver a mis enlaces
        </a>
      </footer>
    </SuperficiePublica>
  )
}
