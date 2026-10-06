"use client"

import { useState } from "react"
import { Casilla } from "@/components/ui/casilla"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { canonicos, DESTINOS, type Destino, nombreDeDestino } from "@/lib/dominio/destinos"

interface PropiedadesDeElegirDestinos {
  elegidos: readonly Destino[]
  /** Instagram goes out by itself once it is connected; until then she uploads it too. */
  instagramConectado: boolean
  alCambiar: (elegidos: Destino[]) => void
}

const A_MANO = "Lo subes tú a mano"

/** "Dónde se publica" at gate 2: at least one destination stays ticked. */
export function ElegirDestinos({ elegidos, instagramConectado, alCambiar }: PropiedadesDeElegirDestinos) {
  const [sinElegir, setSinElegir] = useState(false)

  function alternar(destino: Destino, marcada: boolean) {
    const siguientes = marcada ? [...elegidos, destino] : elegidos.filter((elegido) => elegido !== destino)
    if (siguientes.length === 0) {
      setSinElegir(true)
      return
    }
    setSinElegir(false)
    alCambiar(canonicos(siguientes))
  }

  const detalle = (destino: Destino) =>
    destino === "instagram" && instagramConectado ? "Sale solo a la hora aprobada" : A_MANO

  return (
    <fieldset className="grid border-0 p-0">
      <legend className="sr-only">Dónde se publica</legend>
      {DESTINOS.map((destino) => (
        <Casilla
          key={destino}
          etiqueta={nombreDeDestino(destino)}
          detalle={detalle(destino)}
          marcada={elegidos.includes(destino)}
          alCambiar={(marcada) => alternar(destino, marcada)}
        />
      ))}
      {sinElegir ? <LineaDeEstado tipo="aviso" titulo="Elige al menos uno." tituloEnTinta /> : null}
    </fieldset>
  )
}
