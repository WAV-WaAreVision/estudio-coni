"use client"

import { type FormEvent, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"
import type { EstadoDeLlave } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import type { FilaDeCuenta } from "@/lib/ajustes/presentar"
import { cn } from "@/lib/utils"

const TONO: Record<FilaDeCuenta["tono"], string> = {
  ok: "bg-ok-fondo text-ok-tinta",
  aviso: "bg-aviso-fondo text-aviso-tinta",
  error: "bg-error-fondo text-error-tinta",
  neutro: "bg-hundido text-tinta",
}

const MENSAJE_DE_LLAVE: Record<EstadoDeLlave, string> = {
  comprobada: "Guardada y comprobada.",
  sin_comprobar: "Guardada. No pude comprobarla ahora, la reviso más tarde.",
  sin_voz: "Guardada. Falta tu voz de ElevenLabs: avísale a Federico.",
}

interface PropiedadesDeCuentas {
  filas: readonly FilaDeCuenta[]
  guardarLlave: (cuenta: string, llave: string) => Promise<Resultado<{ estado: EstadoDeLlave }>>
}

export function CuentasConectadas({ filas, guardarLlave }: PropiedadesDeCuentas) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  return (
    <div className="grid">
      <ul className="grid">
        {filas.map((fila) => (
          <li
            key={fila.cuenta}
            id={`cuenta-${fila.cuenta}`}
            className="scroll-mt-4 border-b border-linea py-3 last:border-b-0"
          >
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span className="font-semibold">{fila.nombre}</span>
              <span className={cn("rounded-full px-2.5 py-1.5 text-label font-semibold", TONO[fila.tono])}>
                {fila.estado}
              </span>
            </div>
            {fila.cuenta === "instagram" ? (
              // A plain link: the route answers with a redirect to Instagram, which a client navigation cannot follow.
              <a
                href="/api/meta/conectar"
                className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "mt-1.5 w-fit" })}
              >
                {fila.tono === "aviso" && fila.estado === "Falta" ? "Conectar Instagram" : "Renovar Instagram"}
              </a>
            ) : abierta === fila.cuenta ? (
              <FormularioDeLlave
                fila={fila}
                guardarLlave={guardarLlave}
                alGuardar={(estado) => {
                  setAbierta(null)
                  setMensaje(MENSAJE_DE_LLAVE[estado])
                }}
                alCancelar={() => setAbierta(null)}
              />
            ) : (
              <Boton variante="linea" tamano="chico" className="mt-1.5" onClick={() => setAbierta(fila.cuenta)}>
                {fila.estado === "Falta" ? `Agregar la llave de ${fila.nombre}` : `Cambiar la llave de ${fila.nombre}`}
              </Boton>
            )}
          </li>
        ))}
      </ul>
      {mensaje ? <Aviso mensaje={mensaje} alCerrar={() => setMensaje(null)} /> : null}
    </div>
  )
}

function FormularioDeLlave({
  fila,
  guardarLlave,
  alGuardar,
  alCancelar,
}: {
  fila: FilaDeCuenta
  guardarLlave: PropiedadesDeCuentas["guardarLlave"]
  alGuardar: (estado: EstadoDeLlave) => void
  alCancelar: () => void
}) {
  const [llave, setLlave] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const id = `llave-${fila.cuenta}`

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const limpia = llave.trim()
    if (limpia === "") return
    setError(null)
    empezar(async () => {
      const resultado = await guardarLlave(fila.cuenta, limpia)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      alGuardar(resultado.estado)
    })
  }

  return (
    <form onSubmit={enviar} className="mt-2 grid gap-2.5">
      <label className="grid gap-1.5 text-label font-semibold" htmlFor={id}>
        {`Llave de ${fila.nombre}`}
      </label>
      <input
        id={id}
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={llave}
        onChange={(evento) => setLlave(evento.target.value)}
        aria-describedby={`${id}-ayuda`}
        className="min-h-13 rounded-md border border-linea bg-superficie px-3.5 text-body text-tinta"
      />
      <p id={`${id}-ayuda`} className="text-meta text-apagado">
        Pégala completa. La reviso con {fila.nombre.split(" ")[0]} y queda guardada cifrada.
      </p>
      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5">
        <Boton variante="linea" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={pendiente} deshabilitado={llave.trim() === ""}>
          Guardar y comprobar
        </Boton>
      </div>
    </form>
  )
}
