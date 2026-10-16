import { CaretDown } from "@phosphor-icons/react/dist/ssr"
import { BarraDeMetrica } from "@/components/barra-de-metrica"
import { FilaPieza } from "@/components/fila-pieza"
import { PanelDeComparacion } from "@/components/panel-de-comparacion"
import { Seccion } from "@/components/seccion"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { leerDatosDeMetricas } from "@/lib/datos/metricas"
import { construirMetricas } from "@/lib/metricas/modelo"
import { exigirConi } from "@/lib/sesion/coni"

const BARRAS_A_LA_VISTA = 5
// Copy nuevo (brandkit 13.2, open question 2): Federico confirms the words.
const VER_LAS_DEMAS = "Ver las demás"

const RESUMEN_PLEGABLE =
  "flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 border-b border-linea text-cuerpo font-semibold [&::-webkit-details-marker]:hidden"

export default async function Metricas() {
  const { db } = await exigirConi()
  const modelo = construirMetricas(await leerDatosDeMetricas(db, Date.now()))
  const principales = modelo.barras.slice(0, BARRAS_A_LA_VISTA)
  const restantes = modelo.barras.slice(BARRAS_A_LA_VISTA)
  // The week with something to read is open; the others fold.
  const semanaAbierta = Math.max(
    0,
    modelo.semanas.findIndex((semana) => semana.reels.length > 0),
  )

  return (
    <div>
      <header className="grid gap-1">
        <p className="text-meta font-semibold">Métricas</p>
        <h1 data-snapshot="varia" className="mt-4 text-pantalla capitalize">
          {modelo.mes}
        </h1>
        <p className="text-cuerpo text-apagado">{modelo.resumen}</p>
      </header>

      {modelo.aviso ? (
        <div className="mt-6">
          <LineaDeEstado tipo="aviso" titulo={modelo.aviso} tituloEnTinta />
        </div>
      ) : null}

      {modelo.comparacion ? <PanelDeComparacion panel={modelo.comparacion} /> : null}

      <Seccion titulo="Lo que sirvió" id="sirvio" cifra={modelo.vacio ? undefined : `${modelo.barras.length} reels`}>
        {modelo.vacio ? (
          <div className="grid gap-1 py-1">
            <p className="text-cuerpo font-semibold">Todavía no hay reels publicados.</p>
            <p className="text-cuerpo text-apagado">
              Cuando salga el primero, aquí vas a ver qué le sirvió a la gente.
            </p>
          </div>
        ) : (
          <>
            <p className="text-meta text-apagado">Guardados cada 1.000 personas que lo vieron.</p>
            <ul>
              {principales.map((barra) => (
                <BarraDeMetrica key={barra.piezaId} {...barra} />
              ))}
            </ul>
            {restantes.length > 0 ? (
              <details>
                <summary className={RESUMEN_PLEGABLE}>
                  {VER_LAS_DEMAS}
                  <CaretDown aria-hidden="true" size={ICONO.medio} className="text-apagado" />
                </summary>
                <ul>
                  {restantes.map((barra) => (
                    <BarraDeMetrica key={barra.piezaId} {...barra} />
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </Seccion>

      <Seccion
        titulo="Semana a semana"
        id="semanas"
        cifra={modelo.semanas.length > 0 ? modelo.semanas.length : undefined}
      >
        <p className="text-meta text-apagado">Los toques en tu link cuentan una vez por persona, por link y por día.</p>
        {modelo.semanas.length === 0 ? (
          <p className="text-cuerpo text-apagado">Cuando haya reels, consultas o clics, los verás aquí por semana.</p>
        ) : (
          <div>
            {modelo.semanas.map((semana, i) => (
              <details key={semana.titulo} open={i === semanaAbierta} aria-label={semana.titulo}>
                <summary className={RESUMEN_PLEGABLE}>
                  <span data-snapshot="varia">{semana.titulo}</span>
                  <CaretDown aria-hidden="true" size={ICONO.medio} className="text-apagado" />
                </summary>
                {semana.reels.length > 0 ? (
                  <ul>
                    {semana.reels.map((reel) => (
                      <FilaPieza key={reel.piezaId} titulo={reel.titulo} estado={reel.meta} pilar={reel.pilar} />
                    ))}
                  </ul>
                ) : null}
                <p className="py-3 text-meta text-apagado">{semana.resumen}</p>
              </details>
            ))}
          </div>
        )}
      </Seccion>
    </div>
  )
}
