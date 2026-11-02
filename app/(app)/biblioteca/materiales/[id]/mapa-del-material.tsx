import { Seccion } from "@/components/seccion"
import { TIPO_DE_AFIRMACION } from "@/lib/dominio/biblioteca/etiquetas"
import { type MapaDelMaterial as Mapa, masFrecuentesPrimero } from "@/lib/dominio/biblioteca/mapa"
import { ideasSacadas, PALABRAS } from "@/lib/dominio/biblioteca/palabras"

function Recuento({
  titulo,
  id,
  filas,
}: {
  titulo: string
  id: string
  filas: { clave: string; texto: string; cantidad: number }[]
}) {
  return (
    <Seccion titulo={titulo} id={id}>
      <ul aria-label={titulo} className="divide-y divide-hilo rounded-panel bg-piedra-alta px-[18px]">
        {filas.map((fila) => (
          <li key={fila.clave} className="flex min-h-objetivo items-center justify-between gap-3 text-cuerpo">
            <span>{fila.texto}</span>
            <span className="text-meta font-semibold text-apagado tabular-nums">{fila.cantidad}</span>
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
              ...mapa.temas.map((tema) => ({ clave: tema.id, texto: tema.nombre, cantidad: tema.afirmaciones })),
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
