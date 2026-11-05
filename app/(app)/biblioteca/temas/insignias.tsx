import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"

function Insignia({ texto }: { texto: string }) {
  return (
    <span className="w-fit rounded-casilla bg-piedra-honda px-2.5 py-1 text-meta font-semibold text-tinta">
      {texto}
    </span>
  )
}

/** Ported from Ingesta's `TarjetaDeTema`. "Ya lo traté" follows the chosen network (`tratado`, spec 15b). */
export function Insignias({ tema }: { tema: Pick<TemaResumido, "tratado" | "autores"> }) {
  if (!tema.tratado && tema.autores !== 1) return null
  return (
    <span className="flex flex-wrap gap-2">
      {tema.tratado ? <Insignia texto="Ya lo traté" /> : null}
      {tema.autores === 1 ? <Insignia texto="Un solo autor" /> : null}
    </span>
  )
}
