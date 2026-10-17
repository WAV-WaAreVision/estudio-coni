import type { PilarVisible } from "@/lib/dominio/pilares"

interface PropiedadesDeBarra {
  titulo: string
  pilar: PilarVisible | null
  /** 0 to 100. */
  ancho: number
  /** The figure at 24/600 («50,4»), its base («cada 1.000») and the sample it comes from. Null figure: no numbers yet. */
  cifra: string | null
  unidad: string
  muestra: string | null
  /** The whole sentence, for the reel that has no numbers yet. */
  texto: string
  /** The sample size of the theme, always shown with its name. */
  reelsDelTema: number
}

/** Brandkit 9.20: one reel in «Lo que sirvió». The 4 px bar is scaled to the best one, has no track and never stands without its figure. */
export function BarraDeMetrica({
  titulo,
  pilar,
  ancho,
  cifra,
  unidad,
  muestra,
  texto,
  reelsDelTema,
}: PropiedadesDeBarra) {
  return (
    <li className="grid gap-2 border-b border-hilo py-4 last:border-b-0">
      <span className="text-cuerpo leading-[1.3] font-semibold">{titulo}</span>
      {cifra !== null ? (
        <span className="flex items-baseline gap-2">
          <span className="text-pieza tabular-nums">{cifra}</span>
          <span className="text-meta text-apagado">{unidad}</span>
        </span>
      ) : null}
      {ancho > 0 ? (
        <span aria-hidden="true" data-barra className="block h-1 bg-tinta" style={{ width: `${ancho}%` }} />
      ) : null}
      <span className="text-meta">{muestra ?? texto}</span>
      {pilar ? (
        <span className="text-meta text-apagado">
          {pilar.nombre}
          {reelsDelTema > 0 ? ` · ${reelsDelTema} ${reelsDelTema === 1 ? "reel" : "reels"} de este tema` : ""}
        </span>
      ) : null}
    </li>
  )
}
