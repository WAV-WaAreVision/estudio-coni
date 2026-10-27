"use client"

import { useId, useState } from "react"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { Eleccion } from "@/components/ui/filas"
import { useAccion } from "@/components/use-accion"
import { type Lamina, nombreDeLamina } from "@/lib/dominio/carrusel"
import {
  type CambioDeDiseno as Cambio,
  type DisenoDeCarrusel,
  NOMBRE_DE_VARIANTE,
  palabrasDestacables,
  puedeDividir,
  puedeUnir,
  VARIANTES,
  type Variante,
} from "@/lib/dominio/diseno-carrusel"
import { cambiarDisenoAccion } from "../../piezas/acciones"
import { TEXTO_CAMBIO_DISENO, TEXTO_SIN_LAMINA_PARA_CAMBIO } from "./textos"

const QUE = [
  { valor: "variante", etiqueta: "Colores" },
  { valor: "dividir", etiqueta: "Dividir en dos" },
  { valor: "unir", etiqueta: "Unir con la siguiente" },
  { valor: "destacar", etiqueta: "Palabra destacada" },
] as const
type Que = (typeof QUE)[number]["valor"]

/** "El diseño" at gate 2 (D5): one bounded change at a time, never a free-text request. */
export function CambioDeDiseno({
  piezaId,
  version,
  laminas,
  diseno,
  alHacerlo,
}: {
  piezaId: string
  version: number
  laminas: readonly Lamina[]
  diseno: DisenoDeCarrusel
  alHacerlo: () => void
}) {
  const [que, setQue] = useState<Que>("variante")
  const [variante, setVariante] = useState<Variante>(diseno.variante)
  const [lamina, setLamina] = useState<number | null>(null)
  const [palabra, setPalabra] = useState("")
  const accion = useAccion()
  const idLamina = useId()
  const idPalabra = useId()

  const posibles = laminas
    .map((l, indice) => ({ l, indice }))
    .filter(({ indice }) =>
      que === "dividir" ? puedeDividir(laminas, indice) : que === "unir" ? puedeUnir(laminas, indice) : true,
    )
  const elegida = posibles.find(({ indice }) => indice === lamina) ?? posibles[0]

  function elCambio(): Cambio | null {
    if (que === "variante") return variante === diseno.variante ? null : { tipo: "variante", variante }
    if (!elegida) return null
    if (que === "destacar")
      return { tipo: "destacar", lamina: elegida.indice, palabra: palabra === "" ? null : palabra }
    return { tipo: que, lamina: elegida.indice }
  }
  const cambio = elCambio()

  return (
    <div className="grid gap-4">
      <p className="text-meta text-apagado">{TEXTO_CAMBIO_DISENO}</p>
      <fieldset className="elecciones grid border-0 p-0">
        <legend className="sr-only">Qué cambias</legend>
        {QUE.map((opcion) => (
          <Eleccion
            key={opcion.valor}
            nombre="que-diseno"
            valor={opcion.valor}
            elegido={que === opcion.valor}
            etiqueta={opcion.etiqueta}
            alElegir={(valor) => setQue(QUE.find((o) => o.valor === valor)?.valor ?? "variante")}
          />
        ))}
      </fieldset>

      {que === "variante" ? (
        <fieldset className="elecciones grid border-0 p-0">
          <legend className="mb-2 text-meta font-semibold">Colores</legend>
          {VARIANTES.map((v) => (
            <Eleccion
              key={v}
              nombre="variante"
              valor={v}
              elegido={variante === v}
              etiqueta={NOMBRE_DE_VARIANTE[v]}
              alElegir={(valor) => setVariante(VARIANTES.find((candidata) => candidata === valor) ?? diseno.variante)}
            />
          ))}
        </fieldset>
      ) : posibles.length === 0 ? (
        <p className="text-meta text-apagado">{TEXTO_SIN_LAMINA_PARA_CAMBIO}</p>
      ) : (
        <div className="grid gap-3">
          <label htmlFor={idLamina} className="text-meta font-semibold">
            Lámina
          </label>
          <select
            id={idLamina}
            className="campo w-full text-cuerpo"
            value={elegida?.indice ?? ""}
            onChange={(evento) => {
              setLamina(Number(evento.target.value))
              setPalabra("")
            }}
          >
            {posibles.map(({ l, indice }) => (
              <option key={indice} value={indice}>
                {nombreDeLamina(l, indice)}
              </option>
            ))}
          </select>
          {que === "destacar" && elegida ? (
            <>
              <label htmlFor={idPalabra} className="text-meta font-semibold">
                Palabra
              </label>
              <select
                id={idPalabra}
                className="campo w-full text-cuerpo"
                value={palabra}
                onChange={(evento) => setPalabra(evento.target.value)}
              >
                <option value="">Ninguna</option>
                {palabrasDestacables(elegida.l).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      )}

      {accion.error ? <Bloque tipo="error" titulo={accion.error} /> : null}
      <Boton
        variante="secundario"
        deshabilitado={cambio === null}
        cargando={accion.pendiente}
        onClick={() => {
          if (cambio) accion.ejecutar(() => cambiarDisenoAccion(piezaId, version, cambio), alHacerlo)
        }}
      >
        Rehacer el diseño
      </Boton>
    </div>
  )
}
