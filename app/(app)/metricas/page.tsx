import { BarraDeMetrica } from "@/components/barra-de-metrica"
import { FilaPieza } from "@/components/fila-pieza"
import { Nota } from "@/components/nota"
import { PanelDeComparacion } from "@/components/panel-de-comparacion"
import { Seccion } from "@/components/seccion"
import { leerDatosDeMetricas } from "@/lib/datos/metricas"
import { construirMetricas } from "@/lib/metricas/modelo"
import { exigirConi } from "@/lib/sesion/coni"

export default async function Metricas() {
  const { db } = await exigirConi()
  const modelo = construirMetricas(await leerDatosDeMetricas(db, Date.now()))

  return (
    <div className="grid gap-5.5">
      <header className="grid gap-1.5">
        <h1 className="font-serif text-display capitalize">{modelo.mes}</h1>
        <p className="text-body text-apagado">{modelo.resumen}</p>
      </header>

      {modelo.aviso ? <Nota tipo="aviso" titulo={modelo.aviso} /> : null}

      <Seccion titulo="Lo que sirvió" id="sirvio">
        {modelo.vacio ? (
          <div className="grid gap-1.5 py-1">
            <p className="font-semibold">Todavía no hay reels publicados.</p>
            <p className="text-apagado">Cuando salga el primero, aquí vas a ver qué le sirvió a la gente.</p>
          </div>
        ) : (
          <>
            <p className="text-meta text-apagado">Guardados cada 1.000 personas que lo vieron.</p>
            <ul>
              {modelo.barras.map((barra) => (
                <BarraDeMetrica key={barra.piezaId} {...barra} />
              ))}
            </ul>
          </>
        )}
      </Seccion>

      {modelo.comparacion ? <PanelDeComparacion panel={modelo.comparacion} /> : null}

      <Seccion titulo="Semana a semana" id="semanas">
        <p className="text-meta text-apagado">Los toques en tu link cuentan una vez por persona, por link y por día.</p>
        {modelo.semanas.length === 0 ? (
          <p className="text-apagado">Cuando haya reels, consultas o clics, los verás aquí por semana.</p>
        ) : (
          <div className="grid gap-5">
            {modelo.semanas.map((semana) => (
              <section key={semana.titulo} aria-label={semana.titulo} className="grid gap-1">
                <h3 className="text-label font-semibold">{semana.titulo}</h3>
                {semana.reels.length > 0 ? (
                  <ul>
                    {semana.reels.map((reel) => (
                      <FilaPieza key={reel.piezaId} titulo={reel.titulo} estado={reel.meta} pilar={reel.pilar} />
                    ))}
                  </ul>
                ) : null}
                <p className="text-meta text-apagado">{semana.resumen}</p>
              </section>
            ))}
          </div>
        )}
      </Seccion>
    </div>
  )
}
