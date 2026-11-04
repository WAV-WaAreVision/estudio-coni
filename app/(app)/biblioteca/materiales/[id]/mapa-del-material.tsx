import { CaretRight } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { Seccion } from "@/components/seccion"
import { ICONO } from "@/components/ui/icono"
import { TIPO_DE_AFIRMACION } from "@/lib/dominio/biblioteca/etiquetas"
import { hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { type MapaDelMaterial as Mapa, masFrecuentesPrimero } from "@/lib/dominio/biblioteca/mapa"
import { ideasSacadas, PALABRAS } from "@/lib/dominio/biblioteca/palabras"

interface FilaDeRecuento {
  clave: string
  texto: string
  cantidad: number
  /** A topic row opens the topic (D9). */
  href?: string
}

const CONTENIDO_DE_FILA = "relative flex min-h-objetivo w-full items-center justify-between gap-3 text-cuerpo"

function Recuento({ titulo, id, filas }: { titulo: string; id: string; filas: FilaDeRecuento[] }) {
  const conEnlaces = filas.some((fila) => fila.href)
  return (
    <Seccion titulo={titulo} id={id}>
      <ul aria-label={titulo} className="divide-y divide-hilo rounded-panel bg-piedra-alta px-[18px]">
        {filas.map((fila) => (
          <li key={fila.clave} className={CONTENIDO_DE_FILA}>
            {/* The count and the chevron stay outside the link so it is named by the topic alone; its ::after
                stretches over the row, so a tap anywhere on it opens the topic. */}
            {fila.href ? (
              <Link
                href={fila.href}
                className="flex min-h-objetivo flex-1 items-center underline-offset-4 after:absolute after:inset-0 hover:underline"
              >
                {fila.texto}
              </Link>
            ) : (
              <span className="flex-1">{fila.texto}</span>
            )}
            <span className="text-meta font-semibold text-apagado tabular-nums">{fila.cantidad}</span>
            {fila.href ? (
              <CaretRight aria-hidden="true" size={ICONO.medio} className="shrink-0 text-apagado" />
            ) : conEnlaces ? (
              // Keeps the counts in one column with the rows that have a chevron (ICONO.medio wide).
              <span aria-hidden="true" className="w-[1.2em] shrink-0" />
            ) : null}
          </li>
        ))}
      </ul>
    </Seccion>
  )
}

/** What a material gave, in her words (4h): its topics and what kind of ideas. The evidence goes to WAV's detail. */
export function MapaDelMaterial({ mapa, estado }: { mapa: Mapa; estado: string }) {
  return (
    <section aria-labelledby="mapa-titulo" className="grid gap-4">
      <h2 id="mapa-titulo" className="text-pieza">
        {PALABRAS.afirmaciones}
      </h2>
      {mapa.total === 0 ? (
        <p className="text-cuerpo text-apagado">
          {estado === "listo" ? "Este material no dejó ideas." : "Las ideas aparecen cuando termina de procesarse."}
        </p>
      ) : (
        <>
          <p className="text-cuerpo font-semibold">{ideasSacadas(mapa.total)}</p>
          <Recuento
            titulo="Temas"
            id="mapa-temas"
            filas={[
              ...mapa.temas.map((tema) => ({
                clave: tema.id,
                texto: tema.nombre,
                cantidad: tema.afirmaciones,
                href: hrefDeTema(tema.id),
              })),
              ...(mapa.sinTema > 0 ? [{ clave: "sin-tema", texto: "Sin tema todavía", cantidad: mapa.sinTema }] : []),
            ]}
          />
          <Recuento
            titulo={PALABRAS.tiposDeAfirmacion}
            id="mapa-tipos"
            filas={masFrecuentesPrimero(mapa.tipos, TIPO_DE_AFIRMACION)}
          />
        </>
      )}
    </section>
  )
}
