"use client"

import { Minus, Plus, Warning } from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Seccion } from "@/components/seccion"
import { Aviso } from "@/components/ui/aviso"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { FilaConInterruptor } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { CambioDeAjuste } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import { dolares } from "@/lib/formato"
import {
  limitePorDefecto,
  MAXIMO_DEL_LIMITE_USD,
  MAXIMO_DEL_TOPE_USD,
  PASO_DEL_PRESUPUESTO_USD,
  type PresupuestoDelMes,
  presentarPresupuesto,
  type VistaDelPresupuesto,
} from "@/lib/presupuesto/presentar"
import { cn } from "@/lib/utils"

export interface AccionesDelPresupuesto {
  guardar: (cambio: CambioDeAjuste) => Promise<Resultado<{ anterior: CambioDeAjuste; aviso?: string }>>
  reactivar: (limite: number) => Promise<Resultado<{ limite: number }>>
}

// She taps a stepper a few times: one save and one line in the log, once she stops.
const ESPERA_DEL_PASO_MS = 600

type CampoConPaso = "tope" | "limite"

/** Spec 2026-11-02, Screens: the month's bar, the cap and the limit, Reactivar, spend by provider and the switches. */
export function PantallaDePresupuesto({
  inicial,
  acciones,
}: {
  inicial: PresupuestoDelMes
  acciones: AccionesDelPresupuesto
}) {
  const [estado, setEstado] = useState(inicial)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, empezar] = useTransition()
  const reactivacion = useAccion()
  const [reactivando, setReactivando] = useState(false)
  const [nuevoLimite, setNuevoLimite] = useState("")
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  // The latest state, for the timers that save later; and what the screen showed before each run of taps.
  const ultimo = useRef(estado)
  ultimo.current = estado
  const temporizadores = useRef<Partial<Record<CampoConPaso, ReturnType<typeof setTimeout>>>>({})
  const antesDeTocar = useRef<Partial<Record<CampoConPaso, PresupuestoDelMes>>>({})

  useEffect(() => {
    const pendientes = temporizadores.current
    return () => {
      for (const temporizador of Object.values(pendientes)) clearTimeout(temporizador)
    }
  }, [])

  const vista = presentarPresupuesto(estado)

  function poner(siguiente: PresupuestoDelMes) {
    ultimo.current = siguiente
    setEstado(siguiente)
  }

  function guardar(cambio: CambioDeAjuste, antes: PresupuestoDelMes) {
    setError(null)
    empezar(async () => {
      const resultado = await acciones.guardar(cambio)
      if (!resultado.ok) {
        poner(antes)
        setError(resultado.error)
        return
      }
      setMensaje(resultado.aviso ?? "Guardado")
    })
  }

  function programar(campo: CampoConPaso, siguiente: PresupuestoDelMes, cambio: () => CambioDeAjuste) {
    antesDeTocar.current[campo] ??= ultimo.current
    setError(null)
    poner(siguiente)
    const previo = temporizadores.current[campo]
    if (previo) clearTimeout(previo)
    temporizadores.current[campo] = setTimeout(() => {
      const antes = antesDeTocar.current[campo] ?? ultimo.current
      delete antesDeTocar.current[campo]
      guardar(cambio(), antes)
    }, ESPERA_DEL_PASO_MS)
  }

  function moverTope(delta: number) {
    const actual = ultimo.current
    const tope = Math.min(MAXIMO_DEL_TOPE_USD, Math.max(0, actual.tope + delta))
    // The same rule as guardarAjuste: a cap above the limit she set brings the limit back to twice the cap.
    const limiteExplicito =
      actual.limiteExplicito !== null && tope > actual.limiteExplicito ? null : actual.limiteExplicito
    const limite = actual.reactivado ? actual.limite : (limiteExplicito ?? limitePorDefecto(tope))
    programar("tope", { ...actual, tope, limiteExplicito, limite }, () => ({
      campo: "tope",
      valor: ultimo.current.tope,
    }))
  }

  function moverLimite(delta: number) {
    const actual = ultimo.current
    const defecto = limitePorDefecto(actual.tope)
    const valor = Math.min(MAXIMO_DEL_LIMITE_USD, Math.max(actual.tope, (actual.limiteExplicito ?? defecto) + delta))
    // Back at twice the cap it is no limit of her own: it follows the cap again.
    const limiteExplicito = valor === defecto ? null : valor
    const limite = actual.reactivado ? actual.limite : valor
    programar("limite", { ...actual, limiteExplicito, limite }, () => ({
      campo: "limite",
      valor: ultimo.current.limiteExplicito,
    }))
  }

  function alternar(campo: "motor_semanal" | "fusiones_nocturnas", valor: boolean) {
    const antes = ultimo.current
    poner(
      campo === "motor_semanal"
        ? { ...antes, motor: { ...antes.motor, activo: valor } }
        : { ...antes, fusiones: { ...antes.fusiones, activas: valor } },
    )
    guardar({ campo, valor }, antes)
  }

  function abrirReactivar() {
    setNuevoLimite(String(vista.propuestaDeReactivar))
    reactivacion.limpiarError()
    setReactivando(true)
  }

  function confirmarReactivar() {
    const limite = Number(nuevoLimite.replace(",", "."))
    reactivacion.ejecutar(
      () => acciones.reactivar(limite),
      (resultado) => {
        poner({ ...ultimo.current, limite: resultado.limite, reactivado: true, avisoSinLeer: false })
        setReactivando(false)
        setMensaje(`Listo: tu límite de este mes es ${dolares(resultado.limite)}.`)
      },
    )
  }

  const limiteEnPasos = estado.limiteExplicito ?? limitePorDefecto(estado.tope)

  return (
    <div>
      <Seccion titulo="Este mes" id="presupuesto-mes">
        <BarraDelMes vista={vista} />
        {vista.reactivado ? <p className="text-meta text-apagado">{vista.reactivado}</p> : null}
        {vista.enElLimite ? (
          <Bloque tipo="aviso" titulo={vista.textoEnElLimite}>
            {reactivando ? (
              <form
                className="mt-3 grid gap-3"
                onSubmit={(evento) => {
                  evento.preventDefault()
                  confirmarReactivar()
                }}
              >
                <label htmlFor="limite-del-mes" className="text-meta font-semibold">
                  Tu límite de este mes
                </label>
                <input
                  id="limite-del-mes"
                  type="number"
                  inputMode="decimal"
                  // Any amount: the browser's own step check would block the form without saying why; the server
                  // rounds it and explains a refusal in plain Spanish.
                  step="any"
                  value={nuevoLimite}
                  onChange={(evento) => setNuevoLimite(evento.target.value)}
                  className="campo w-full text-cuerpo tabular-nums"
                />
                {reactivacion.error ? <LineaDeEstado tipo="error" titulo={reactivacion.error} /> : null}
                <div className="flex flex-wrap items-center gap-4">
                  <Boton type="submit" tamano="chico" cargando={reactivacion.pendiente}>
                    Confirmar
                  </Boton>
                  <Boton variante="callado" onClick={() => setReactivando(false)}>
                    Volver
                  </Boton>
                </div>
              </form>
            ) : (
              <Boton className="mt-3" variante="secundario" tamano="chico" onClick={abrirReactivar}>
                Reactivar
              </Boton>
            )}
          </Bloque>
        ) : null}
      </Seccion>

      <Seccion titulo="Tope y límite" id="presupuesto-tope">
        <Paso
          etiqueta="Tope"
          nombre="el tope"
          valor={`US$ ${estado.tope}`}
          puedeBajar={estado.tope > 0}
          puedeSubir={estado.tope < MAXIMO_DEL_TOPE_USD}
          alMover={moverTope}
        />
        <p className="text-meta text-apagado">Es tu referencia: al pasarlo, la app sigue y te lo muestra aquí.</p>
        <Paso
          etiqueta="Límite"
          nombre="el límite"
          valor={vista.etiquetaDelLimite}
          valorLargo={estado.limiteExplicito === null}
          puedeBajar={limiteEnPasos > estado.tope}
          puedeSubir={limiteEnPasos < MAXIMO_DEL_LIMITE_USD}
          alMover={moverLimite}
        />
        <p className="text-meta text-apagado">
          Es el freno: al llegar, lo nuevo queda en pausa y lo que ya firmaste sigue. Nunca baja del tope.
        </p>
      </Seccion>

      <Seccion titulo="Por proveedor" id="presupuesto-proveedores">
        <ul aria-label="Gasto por proveedor" className="grid gap-2">
          {vista.porProveedor.map((fila) => (
            <li key={fila.nombre} className="flex justify-between gap-3 text-cuerpo tabular-nums">
              <span>{fila.nombre}</span>
              <span>{fila.monto}</span>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Lo que gasta solo" id="presupuesto-solo">
        <Grupo>
          <FilaConInterruptor
            etiqueta="Ideas nuevas cada domingo"
            detalle={`${dolares(estado.motor.usd)} este mes`}
            encendido={estado.motor.activo}
            alCambiar={(valor) => alternar("motor_semanal", valor)}
          />
          <FilaConInterruptor
            etiqueta="Unir temas parecidos cada noche"
            detalle={`${dolares(estado.fusiones.usd)} este mes`}
            encendido={estado.fusiones.activas}
            alCambiar={(valor) => alternar("fusiones_nocturnas", valor)}
          />
        </Grupo>
        <p className="text-meta text-apagado">
          Corren sin que los pidas. Apagados no gastan. «Proponer ahora» en Ingesta sigue funcionando.
        </p>
      </Seccion>

      {error ? (
        <div className="mt-6">
          <LineaDeEstado tipo="error" titulo={error} />
        </div>
      ) : null}

      {mensaje ? <Aviso mensaje={mensaje} alCerrar={cerrarMensaje} /> : null}
    </div>
  )
}

/** The bar never speaks alone: the figure goes in words and the marks are listed under it (P12). */
function BarraDelMes({ vista }: { vista: VistaDelPresupuesto }) {
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-meta font-medium text-tinta tabular-nums">
        {vista.tono === "tinta" ? null : <Warning aria-hidden="true" size={ICONO.chico} />}
        {vista.linea}
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: a native meter cannot be drawn as a sunken rounded track with marks on every browser. */}
      <div
        role="meter"
        aria-label="Gasto del mes"
        aria-valuemin={0}
        aria-valuemax={vista.escala}
        aria-valuenow={vista.usado}
        aria-valuetext={vista.linea}
        className="relative h-riel overflow-hidden rounded-control bg-piedra-honda shadow-hundido"
      >
        <div
          className={cn("h-full rounded-control", vista.tono === "pasado" ? "bg-error" : "bg-tinta")}
          style={{ width: `${vista.relleno}%` }}
        />
        {vista.marcas.map((marca) => (
          <span
            key={marca.etiqueta}
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-apagado"
            style={{ left: `${marca.porcentaje}%` }}
          />
        ))}
      </div>
      <ul
        aria-label="Marcas de la barra"
        className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-apagado tabular-nums"
      >
        {vista.marcas.map((marca) => (
          <li key={marca.etiqueta}>{`${marca.etiqueta}: ${marca.monto}`}</li>
        ))}
      </ul>
      {vista.pasado ? <LineaDeEstado tipo="aviso" titulo={vista.pasado} /> : null}
    </div>
  )
}

function Paso({
  etiqueta,
  nombre,
  valor,
  puedeBajar,
  puedeSubir,
  alMover,
  valorLargo = false,
}: {
  etiqueta: string
  /** «el tope», «el límite»: what the buttons say to a screen reader. */
  nombre: string
  valor: string
  puedeBajar: boolean
  puedeSubir: boolean
  alMover: (delta: number) => void
  /** «US$ 80 (el doble del tope)» goes at body size, so the buttons keep their 44 px on a phone. */
  valorLargo?: boolean
}) {
  return (
    <div className="flex min-h-fila-baja flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="text-cuerpo">{etiqueta}</span>
      <div className="flex items-center gap-3">
        <Boton
          variante="secundario"
          tamano="chico"
          aria-label={`Bajar ${nombre}`}
          deshabilitado={!puedeBajar}
          className="w-objetivo shrink-0 justify-center px-0"
          onClick={() => alMover(-PASO_DEL_PRESUPUESTO_USD)}
        >
          <Minus aria-hidden="true" size={ICONO.medio} />
        </Boton>
        <output
          className={cn(
            "min-w-20 whitespace-nowrap text-center tabular-nums",
            valorLargo ? "text-cuerpo font-semibold" : "text-pieza",
          )}
        >
          {valor}
        </output>
        <Boton
          variante="secundario"
          tamano="chico"
          aria-label={`Subir ${nombre}`}
          deshabilitado={!puedeSubir}
          className="w-objetivo shrink-0 justify-center px-0"
          onClick={() => alMover(PASO_DEL_PRESUPUESTO_USD)}
        >
          <Plus aria-hidden="true" size={ICONO.medio} />
        </Boton>
      </div>
    </div>
  )
}
