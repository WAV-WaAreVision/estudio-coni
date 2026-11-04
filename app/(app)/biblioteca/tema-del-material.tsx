import Link from "next/link"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { type TemaPrincipal, textoDeTema } from "@/lib/dominio/biblioteca/temas"

/**
 * "Carga mental +2" on screen; "Carga mental y 2 temas más" for a screen reader. `conEnlace` links it to the topic
 * (D9): only where it is not already inside a link, as the phone card is (deviation 4).
 */
export function TemaDelMaterial({ tema, conEnlace = false }: { tema: TemaPrincipal | null; conEnlace?: boolean }) {
  const { visible, leido } = textoDeTema(tema)
  const texto = (
    <>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{leido}</span>
    </>
  )
  if (!conEnlace || tema === null) return texto
  return (
    <Link href={hrefDeTema(tema.id)} className="text-tinta underline decoration-1 underline-offset-4">
      {texto}
    </Link>
  )
}
