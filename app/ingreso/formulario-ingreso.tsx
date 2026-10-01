"use client"

import { useState, useTransition } from "react"
import { CasillasCodigo } from "@/components/casillas-codigo"
import { Boton } from "@/components/ui/boton"
import { pedirCodigoAccion, verificarCodigoAccion } from "./acciones"

type Paso = "inicio" | "codigo"

export function FormularioIngreso({ correoEnmascarado }: { correoEnmascarado: string }) {
  const [paso, setPaso] = useState<Paso>("inicio")
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [codigo, setCodigo] = useState("")
  const [pendiente, empezar] = useTransition()

  function mandarCodigo(esReenvio: boolean) {
    setError(null)
    setAviso(null)
    empezar(async () => {
      const resultado = await pedirCodigoAccion()
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setPaso("codigo")
      setCodigo("")
      setVuelta((actual) => actual + 1)
      if (esReenvio) setAviso("Te mandé otro código.")
    })
  }

  function entrar(valor: string) {
    if (pendiente) return
    setError(null)
    empezar(async () => {
      const resultado = await verificarCodigoAccion(valor)
      // On success the action redirects, so reaching this line means the code did not work.
      if (!resultado.ok) {
        setError(resultado.error)
        setCodigo("")
        setVuelta((actual) => actual + 1)
      }
    })
  }

  if (paso === "inicio") {
    return (
      <div className="grid gap-5.5">
        <div className="grid gap-2.5">
          <h1 className="font-serif text-display text-balance">Hola, Coni</h1>
          <p className="text-apagado">
            Te mando un código a <strong className="font-semibold text-tinta">{correoEnmascarado}</strong> para que
            entres.
          </p>
        </div>
        {error ? <MensajeDeError mensaje={error} /> : null}
        <Boton cargando={pendiente} onClick={() => mandarCodigo(false)}>
          Mandarme el código
        </Boton>
      </div>
    )
  }

  return (
    <form
      className="grid gap-5.5"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (codigo.length === 6) entrar(codigo)
      }}
    >
      <div className="grid gap-2.5">
        <h1 className="font-serif text-display text-balance">Entra con el código que te mandé</h1>
        <p className="text-apagado">
          Lo envié a {correoEnmascarado}. Vence en 1 hora. Si no llega, mira la carpeta de spam.
        </p>
      </div>
      <CasillasCodigo
        key={vuelta}
        alCambiar={setCodigo}
        alCompletar={(valor) => {
          setCodigo(valor)
          entrar(valor)
        }}
        invalido={error !== null}
        deshabilitado={pendiente}
      />
      {error ? <MensajeDeError mensaje={error} /> : null}
      {aviso && !error ? (
        <output className="rounded-md bg-ok-fondo p-3.5 text-[1rem] text-ok-tinta">{aviso}</output>
      ) : null}
      <div className="grid gap-1">
        <Boton type="submit" cargando={pendiente} deshabilitado={codigo.length < 6}>
          Entrar
        </Boton>
        <Boton variante="callado" onClick={() => mandarCodigo(true)} cargando={pendiente}>
          Mandar otro código
        </Boton>
      </div>
    </form>
  )
}

function MensajeDeError({ mensaje }: { mensaje: string }) {
  return (
    <p role="alert" className="rounded-md bg-error-fondo p-3.5 text-[1rem] text-error-tinta">
      {mensaje}
    </p>
  )
}
