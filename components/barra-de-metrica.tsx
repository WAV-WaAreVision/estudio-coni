import { NOMBRE_DE_PILAR, type Pilar } from "@/lib/dominio/pilares"
import { cn } from "@/lib/utils"

interface PropiedadesDeBarra {
  titulo: string
  pilar: Pilar | null
  /** 0 to 100. */
  ancho: number
  /** The number beside the bar, with its base ("cada 1.000"). */
  texto: string
  /** The sample size of the theme, always shown with its name. */
  reelsDelTema: number
}

/** One reel in "Lo que sirvió": the bar is scaled to the best visible one and never stands without its number. */
export function BarraDeMetrica({ titulo, pilar, ancho, texto, reelsDelTema }: PropiedadesDeBarra) {
  return (
    <li
      data-pilar={pilar ?? undefined}
      className={cn("grid gap-2 border-b border-linea py-3.5 last:border-b-0", !pilar && "[--p-punto:var(--apagado)]")}
    >
      <span className="text-body font-semibold leading-[1.3]">{titulo}</span>
      {ancho > 0 ? (
        <span aria-hidden="true" className="block h-2.5 overflow-hidden rounded-full bg-hundido">
          <span className="block h-full rounded-full bg-pilar-punto" style={{ width: `${ancho}%` }} />
        </span>
      ) : null}
      <span className="text-meta">{texto}</span>
      {pilar ? (
        <span className="text-meta text-apagado">
          {NOMBRE_DE_PILAR[pilar]}
          {reelsDelTema > 0 ? ` · ${reelsDelTema} ${reelsDelTema === 1 ? "reel" : "reels"} de este tema` : ""}
        </span>
      ) : null}
    </li>
  )
}
