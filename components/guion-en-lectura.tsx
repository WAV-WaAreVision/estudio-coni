import { Flag } from "@phosphor-icons/react/dist/ssr"
import { resaltarFrases } from "@/lib/diseno/resaltado"
import { ICONO } from "./ui/icono"

interface PropiedadesDeLectura {
  guion: string
  /** Each finding's phrase, by the finding's index; null when it quotes none. */
  frases?: readonly (string | null)[]
  /** The id of a finding's review panel, for the link on its marked phrase. */
  idDeRevision?: (indice: number) => string
}

/**
 * Decision 9: the script in reading mode. Tone marks are honda chips; a finding's phrase is marked at its first
 * occurrence and links to its review panel, with the flag after it. Inline text: exempt from the 44 px target rule.
 */
export function GuionEnLectura({ guion, frases = [], idDeRevision }: PropiedadesDeLectura) {
  const { trozos } = resaltarFrases(guion, frases)
  let posicion = 0
  return (
    <p className="whitespace-pre-wrap text-guion">
      {trozos.map((trozo) => {
        const clave = posicion
        posicion += trozo.valor.length
        if (trozo.tipo === "marca")
          return (
            <span
              key={clave}
              className="mr-0.5 inline-block rounded-control bg-piedra-honda px-2.5 align-[2px] text-meta font-medium whitespace-nowrap text-tinta"
            >
              {trozo.valor}
            </span>
          )
        if (trozo.tipo === "frase")
          return (
            <span key={clave}>
              <mark
                data-en-linea
                className="rounded-[4px] bg-piedra-honda px-0.5 text-tinta underline decoration-tinta decoration-2 underline-offset-3 [box-decoration-break:clone]"
              >
                {idDeRevision ? (
                  <a href={`#${idDeRevision(trozo.indice)}`} className="text-inherit">
                    {trozo.valor}
                  </a>
                ) : (
                  trozo.valor
                )}
              </mark>
              <Flag aria-hidden="true" size={ICONO.chico} className="ml-1 inline align-[-0.1em]" />
            </span>
          )
        return <span key={clave}>{trozo.valor}</span>
      })}
    </p>
  )
}
