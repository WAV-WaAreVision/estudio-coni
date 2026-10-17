"use client"

import { type ClipboardEvent, type KeyboardEvent, useRef, useState } from "react"

const LARGO = 6

interface PropiedadesDeCasillas {
  /** Called once the six boxes are full, whether typed, pasted or autofilled. */
  alCompletar: (codigo: string) => void
  alCambiar?: (codigo: string) => void
  invalido?: boolean
  deshabilitado?: boolean
}

const soloNumeros = (texto: string) => texto.replace(/\D/g, "")

/** Six boxes for the emailed code. Remount it (change its `key`) to clear it after a wrong code. */
export function CasillasCodigo({
  alCompletar,
  alCambiar,
  invalido = false,
  deshabilitado = false,
}: PropiedadesDeCasillas) {
  const [celdas, setCeldas] = useState<string[]>(() => Array.from({ length: LARGO }, () => ""))
  const referencias = useRef<(HTMLInputElement | null)[]>([])

  function escribir(desde: number, texto: string) {
    const digitos = soloNumeros(texto).slice(0, LARGO - desde)
    const siguientes = [...celdas]
    if (digitos === "") {
      siguientes[desde] = ""
    } else {
      for (const [indice, digito] of [...digitos].entries()) siguientes[desde + indice] = digito
    }
    setCeldas(siguientes)
    alCambiar?.(siguientes.join(""))
    if (digitos !== "") referencias.current[Math.min(desde + digitos.length, LARGO - 1)]?.focus()
    if (siguientes.every((celda) => celda !== "")) alCompletar(siguientes.join(""))
  }

  function alEscribirEnCasilla(indice: number, valor: string) {
    const digitos = soloNumeros(valor)
    const actual = celdas[indice]
    // Typing over a box that was not selected arrives as "old + new"; only the new digit counts.
    if (actual && digitos.length === 2 && digitos.includes(actual)) {
      escribir(indice, digitos.replace(actual, ""))
      return
    }
    escribir(indice, valor)
  }

  function alPegar(indice: number, evento: ClipboardEvent<HTMLInputElement>) {
    evento.preventDefault()
    escribir(indice, evento.clipboardData.getData("text"))
  }

  function alTeclear(indice: number, evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Backspace" && celdas[indice] === "" && indice > 0) {
      evento.preventDefault()
      const siguientes = [...celdas]
      siguientes[indice - 1] = ""
      setCeldas(siguientes)
      alCambiar?.(siguientes.join(""))
      referencias.current[indice - 1]?.focus()
    } else if (evento.key === "ArrowLeft" && indice > 0) {
      referencias.current[indice - 1]?.focus()
    } else if (evento.key === "ArrowRight" && indice < LARGO - 1) {
      referencias.current[indice + 1]?.focus()
    }
  }

  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-6 gap-2 border-0 p-0">
      <legend className="sr-only">Código de 6 números</legend>
      {celdas.map((celda, indice) => (
        <input
          // The boxes are positions, not items: their order never changes.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed set of six positions
          key={indice}
          ref={(elemento) => {
            referencias.current[indice] = elemento
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={indice === 0 ? "one-time-code" : "off"}
          aria-label={`Número ${indice + 1} de ${LARGO}`}
          aria-invalid={invalido || undefined}
          disabled={deshabilitado}
          value={celda}
          onChange={(evento) => alEscribirEnCasilla(indice, evento.target.value)}
          onPaste={(evento) => alPegar(indice, evento)}
          onKeyDown={(evento) => alTeclear(indice, evento)}
          onFocus={(evento) => evento.target.select()}
          className="campo h-[4rem] w-full rounded-bloque px-0 text-center text-pieza text-tinta tabular-nums"
        />
      ))}
    </fieldset>
  )
}
