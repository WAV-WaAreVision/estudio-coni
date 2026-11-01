"use client"

import { useState } from "react"
import { Seccion } from "@/components/seccion"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { Panel } from "@/components/ui/panel"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"
import type { VistaDelRegistro } from "@/lib/datos-personales/presentar"

interface PropiedadesDelRegistro extends VistaDelRegistro {
  marcar: () => Promise<Resultado<{ revisadoEn: string }>>
}

/** D2: she reads the register and confirms once a year; WAV corrects it from Ingesta. */
export function RegistroDeDatos({ tarjetas, borrados, revision, marcar }: PropiedadesDelRegistro) {
  const { pendiente, error, ejecutar } = useAccion()
  const [revisado, setRevisado] = useState(false)
  const ultima = revision.ultima ? `La revisaste por última vez el ${revision.ultima}.` : "Todavía no la revisas."

  return (
    <div>
      <Seccion titulo="Lo que la app guarda" id="datos-lista" cifra={tarjetas.length}>
        <ul className="grid gap-3">
          {tarjetas.map((tarjeta) => (
            <li key={tarjeta.clave}>
              <Panel>
                <h3 className="text-cuerpo font-semibold text-balance">{tarjeta.dato}</h3>
                <dl className="mt-3 grid gap-2 text-meta">
                  <Linea titulo="Para qué">{tarjeta.paraQue}</Linea>
                  <Linea titulo="Dónde queda">{tarjeta.donde}</Linea>
                  <Linea titulo="Cuándo se borra">{tarjeta.plazo}</Linea>
                </dl>
                {tarjeta.discrepancia ? (
                  <LineaDeEstado className="mt-3" tipo="aviso" titulo={tarjeta.discrepancia} />
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Lo que la app borró sola" id="datos-borrados">
        {borrados.length === 0 ? (
          <p className="text-meta text-apagado">Todavía no hay borrados anotados.</p>
        ) : (
          <ul className="grid gap-1.5 text-meta">
            {borrados.map((borrado) => (
              <li key={borrado.id}>{borrado.frase}</li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Revisión anual" id="datos-revision">
        <p className="text-cuerpo">{`${ultima} Tu próxima revisión vence el ${revision.vence}.`}</p>
        {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
        {revisado ? <LineaDeEstado tipo="exito" titulo="Quedó anotado. Gracias." /> : null}
        <Boton variante="secundario" cargando={pendiente} onClick={() => ejecutar(marcar, () => setRevisado(true))}>
          Lo revisé
        </Boton>
      </Seccion>
    </div>
  )
}

function Linea({ titulo, children }: { titulo: string; children: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-semibold text-tinta">{titulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}
