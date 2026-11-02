import { type TemaPrincipal, textoDeTema } from "@/lib/dominio/biblioteca/temas"

/** "Carga mental +2" on screen; "Carga mental y 2 temas más" for a screen reader. */
export function TemaDelMaterial({ tema }: { tema: TemaPrincipal | null }) {
  const { visible, leido } = textoDeTema(tema)
  return (
    <>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{leido}</span>
    </>
  )
}
