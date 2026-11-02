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
type CampoDelPresupuesto = CampoConPaso | "motor_semanal" | "fusiones_nocturnas"
type CambioDelPresupuesto = Extract<CambioDeAjuste, { campo: CampoDelPresupuesto }>

interface Mensaje {
  texto: string
  deshacer?: () => void
}

function esDelPresupuesto(cambio: CambioDeAjuste): cambio is CambioDelPresupuesto {
  return (
    cambio.campo === "tope" ||
    cambio.campo === "limite" ||
    cambio.campo === "motor_semanal" ||
    cambio.campo === "fusiones_nocturnas"
  )
}

/** The lowest limit the stepper offers: the first step at or above the cap. */
function limiteMinimo(tope: number): number {
  return Math.ceil(tope / PASO_DEL_PRESUPUESTO_USD) * PASO_DEL_PRESUPUESTO_USD
}

/** The same rule as guardarAjuste: a cap above the limit she set brings the limit back to twice the cap. */
function conTope(p: PresupuestoDelMes, tope: number): PresupuestoDelMes {
  const limiteExplicito = p.limiteExplicito !== null && tope > p.limiteExplicito ? null : p.limiteExplicito
  const limite = p.reactivado ? p.limite : (limiteExplicito ?? limitePorDefecto(tope))
  return { ...p, tope, limiteExplicito, limite }
}

/** Back at twice the cap it is no limit of her own: it follows the cap again. */
function conLimite(p: PresupuestoDelMes, valor: number | null): PresupuestoDelMes {
  const defecto = limitePorDefecto(p.tope)
  const limiteExplicito = valor === null || valor === defecto ? null : valor
  const limite = p.reactivado ? p.limite : (limiteExplicito ?? defecto)
  return { ...p, limiteExplicito, limite }
}

function aplicar(p: PresupuestoDelMes, cambio: CambioDelPresupuesto): PresupuestoDelMes {
  switch (cambio.campo) {
    case "tope":
      return conTope(p, cambio.valor)
    case "limite":
      return conLimite(p, cambio.valor)
    case "motor_semanal":
      return { ...p, motor: { ...p.motor, activo: cambio.valor } }
    case "fusiones_nocturnas":
      return { ...p, fusiones: { ...p.fusiones, activas: cambio.valor } }
  }
}

/** A failed save takes back only the fields that change touched; her newer edits elsewhere stay. */
function restaurar(actual: PresupuestoDelMes, antes: PresupuestoDelMes, campo: CampoDelPresupuesto): PresupuestoDelMes {
  switch (campo) {
    case "tope":
      return { ...actual, tope: antes.tope, limiteExplicito: antes.limiteExplicito, limite: antes.limite }
    case "limite":
      return { ...actual, limiteExplicito: antes.limiteExplicito, limite: antes.limite }
    case "motor_semanal":
      return { ...actual, motor: { ...actual.motor, activo: antes.motor.activo } }
    case "fusiones_nocturnas":
      return { ...actual, fusiones: { ...actual.fusiones, activas: antes.fusiones.activas } }
  }
}

function cambioDelPaso(campo: CampoConPaso, p: PresupuestoDelMes): CambioDelPresupuesto {
  return campo === "tope" ? { campo, valor: p.tope } : { campo, valor: p.limiteExplicito }
}

/** Spec 2026-11-02, Screens: the month's bar, the cap and the limit, Reactivar, spend by provider and the switches. */
export function PantallaDePresupuesto({
  inicial,
  acciones,
}: {
  inicial: PresupuestoDelMes
  acciones: AccionesDelPresupuesto
}) {
  const [estado, setEstado] = useState(inicial)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [errores, setErrores] = useState<Partial<Record<CampoDelPresupuesto, string>>>({})
  const [, empezar] = useTransition()
  const reactivacion = useAccion()
  const [reactivando, setReactivando] = useState(false)
  const [nuevoLimite, setNuevoLimite] = useState("")
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  // The latest state, for the timers that save later; and, per stepper, what the screen showed before its run of taps.
  const ultimo = useRef(estado)
  ultimo.current = estado
  const pendientes = useRef<
    Partial<Record<CampoConPaso, { temporizador: ReturnType<typeof setTimeout>; antes: PresupuestoDelMes }>>
  >({})

  const vista = presentarPresupuesto(estado)

  function poner(siguiente: PresupuestoDelMes) {
    ultimo.current = siguiente
    setEstado(siguiente)
  }

  function ponerError(campo: CampoDelPresupuesto, error: string | null) {
    setErrores((actuales) => {
      const siguientes = { ...actuales }
      if (error === null) delete siguientes[campo]
      else siguientes[campo] = error
      return siguientes
    })
  }

  function guardar(cambio: CambioDelPresupuesto, antes: PresupuestoDelMes, ofrecerDeshacer = true) {
    ponerError(cambio.campo, null)
    empezar(async () => {
      const resultado = await acciones.guardar(cambio)
      if (!resultado.ok) {
        poner(restaurar(ultimo.current, antes, cambio.campo))
        ponerError(cambio.campo, resultado.error)
        return
      }
      if (!ofrecerDeshacer) return
      const anterior = resultado.anterior
      setMensaje({
        texto: resultado.aviso ?? "Guardado",
        deshacer: esDelPresupuesto(anterior) ? () => deshacer(anterior) : undefined,
      })
    })
  }

  function deshacer(anterior: CambioDelPresupuesto) {
    soltar("tope")
    soltar("limite")
    const antes = ultimo.current
    poner(aplicar(antes, anterior))
    guardar(anterior, antes, false)
  }

  /** Saves a stepper's pending run of taps now. */
  function soltar(campo: CampoConPaso) {
    const pendiente = pendientes.current[campo]
    if (!pendiente) return
    clearTimeout(pendiente.temporizador)
    delete pendientes.current[campo]
    guardar(cambioDelPaso(campo, ultimo.current), pendiente.antes)
  }

  // Leaving the screen (back to Ajustes, another tab, the phone locking) must not lose the last taps.
  const soltarTodo = useRef(() => {})
  soltarTodo.current = () => {
    soltar("tope")
    soltar("limite")
  }
  useEffect(() => {
    const alOcultar = () => soltarTodo.current()
    window.addEventListener("pagehide", alOcultar)
    return () => {
      window.removeEventListener("pagehide", alOcultar)
      alOcultar()
    }
  }, [])

  function programar(campo: CampoConPaso, siguiente: PresupuestoDelMes) {
    const previo = pendientes.current[campo]
    if (previo) clearTimeout(previo.temporizador)
    const antes = previo?.antes ?? ultimo.current
    ponerError(campo, null)
    poner(siguiente)
    pendientes.current[campo] = { antes, temporizador: setTimeout(() => soltar(campo), ESPERA_DEL_PASO_MS) }
  }

  function moverTope(delta: number) {
    const actual = ultimo.current
    programar("tope", conTope(actual, Math.min(MAXIMO_DEL_TOPE_USD, Math.max(0, actual.tope + delta))))
  }

  function moverLimite(delta: number) {
    const actual = ultimo.current
    const enPasos = actual.limiteExplicito ?? limitePorDefecto(actual.tope)
    const valor = Math.min(MAXIMO_DEL_LIMITE_USD, Math.max(limiteMinimo(actual.tope), enPasos + delta))
    programar("limite", conLimite(actual, valor))
  }

  function alternar(campo: "motor_semanal" | "fusiones_nocturnas", valor: boolean) {
    const antes = ultimo.current
    const cambio: CambioDelPresupuesto = { campo, valor }
    poner(aplicar(antes, cambio))
    guardar(cambio, antes)
  }

  function abrirReactivar() {
    setNuevoLimite(String(vista.propuestaDeReactivar))
    reactivacion.limpiarError()
    setReactivando(true)
  }

  function confirmarReactivar() {
    const limite = Number(nuevoLimite.trim().replace(",", "."))
    reactivacion.ejecutar(
      () => acciones.reactivar(limite),
      (resultado) => {
        poner({ ...ultimo.current, limite: resultado.limite, reactivado: true, avisoSinLeer: false })
        setReactivando(false)
        setMensaje({ texto: `Listo: tu límite de este mes es ${dolares(resultado.limite)}.` })
      },
    )
  }

  const limiteEnPasos = estado.limiteExplicito ?? limitePorDefecto(estado.tope)
  const error = (campo: CampoDelPresupuesto) =>
    errores[campo] ? <LineaDeEstado tipo="error" titulo={errores[campo]} /> : null

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
                  // Text, not number: «120,5» with a decimal comma must reach the server, which rounds it and
                  // explains a refusal in plain Spanish.
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
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
        {error("tope")}
        <p className="text-meta text-apagado">Es tu referencia: al pasarlo, la app sigue y te lo muestra aquí.</p>
        <Paso
          etiqueta="Límite"
          nombre="el límite"
          valor={vista.etiquetaDelLimite}
          valorLargo={estado.limiteExplicito === null}
          puedeBajar={limiteEnPasos > limiteMinimo(estado.tope)}
          puedeSubir={limiteEnPasos < MAXIMO_DEL_LIMITE_USD}
          alMover={moverLimite}
        />
        {error("limite")}
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
        {error("motor_semanal")}
        {error("fusiones_nocturnas")}
        <p className="text-meta text-apagado">
          Corren sin que los pidas. Apagados no gastan. «Proponer ahora» en Ingesta sigue funcionando.
        </p>
      </Seccion>

      {mensaje ? <Aviso mensaje={mensaje.texto} alCerrar={cerrarMensaje} alDeshacer={mensaje.deshacer} /> : null}
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
      <div className="ml-auto flex items-center gap-3">
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
            // At large text the two buttons and «US$ 80 (el doble del tope)» are wider than the phone: the figure's
            // floor shrinks with the screen and its words wrap, so the page never widens (WCAG 1.4.10).
            "min-w-[min(5rem,25vw)] text-center tabular-nums",
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
