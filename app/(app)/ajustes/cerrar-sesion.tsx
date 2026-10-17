"use client"

import { useState, useTransition } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"

/** "Cerrar sesión" asks in line first, like Desconectar: signing out on a stray tap means waiting for a new code. */
export function CerrarSesion({ cerrar }: { cerrar: () => Promise<void> }) {
  const [preguntando, setPreguntando] = useState(false)
  const [pendiente, empezar] = useTransition()

  if (!preguntando)
    return (
      <Boton variante="callado" onClick={() => setPreguntando(true)}>
        Cerrar sesión
      </Boton>
    )
  return (
    <ConfirmacionEnLinea
      trato="destructivo"
      pregunta="Para volver a entrar te mando un código a tu correo. ¿Cerrar sesión?"
      confirmar="Sí, cerrar sesión"
      volver="Cancelar"
      cargando={pendiente}
      alConfirmar={() => empezar(() => cerrar())}
      alVolver={() => setPreguntando(false)}
    />
  )
}
