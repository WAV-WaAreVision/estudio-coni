import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr"
import { type Proveedor, separarParaConi } from "@/lib/diseno/para-coni"
import { ICONO } from "./icono"
import { MasOpciones } from "./mas-opciones"

/** What only WAV needs (provider, balance, link), folded under the text she reads. */
export function DetalleParaWav({ lineas, proveedor }: { lineas: readonly string[]; proveedor: Proveedor | null }) {
  return (
    <MasOpciones forma="linea" titulo="Detalle para WAV">
      {lineas.map((linea) => (
        // No data-snapshot mask: Chromium keeps a box for a closed fold's content and the mask would paint over the page.
        <p key={linea} className="text-meta text-tinta">
          {linea}
        </p>
      ))}
      {proveedor ? (
        <a
          href={proveedor.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-objetivo w-fit items-center gap-2 text-meta font-semibold text-tinta underline decoration-1 underline-offset-4"
        >
          {`Abrir ${proveedor.nombre}`}
          <ArrowSquareOut aria-hidden="true" size={ICONO.chico} />
        </a>
      ) : null}
    </MasOpciones>
  )
}

interface PropiedadesDeExplicacion {
  /** The text the app has: hers, or a provider's. */
  texto: string
  /** What happened and what she can do, said truthfully, for when `texto` is a provider's. */
  enSusPalabras: string
  /** Lines that are always WAV's, such as a balance. */
  extra?: readonly string[]
  /** On the text she reads, so a control can be described by it without the fold. */
  id?: string
}

/** Exit critique 3: her words in the main text; anything technical folded under "Detalle para WAV". */
export function ExplicacionParaConi({ texto, enSusPalabras, extra = [], id }: PropiedadesDeExplicacion) {
  const para = separarParaConi(texto, enSusPalabras, extra)
  return (
    <>
      <p id={id}>{para.texto}</p>
      {para.detalle.length > 0 ? <DetalleParaWav lineas={para.detalle} proveedor={para.proveedor} /> : null}
    </>
  )
}
