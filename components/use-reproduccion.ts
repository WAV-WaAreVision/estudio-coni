"use client"

import { type ReactEventHandler, useCallback, useEffect, useRef, useState } from "react"
import { recordarVisto, recuerdaVisto } from "@/lib/medios/recuerdo"
import { avanzar, terminado as estaTerminado, iniciarVisionado } from "@/lib/medios/visionado"

interface Opciones {
  /** Identifies what is being watched (the stored file), so "watched" survives leaving and coming back. */
  clave: string
  alTerminar: () => void
}

/** Play, pause and the "watched 95 percent" tracking of an audio or video element. */
export function useReproduccion<T extends HTMLMediaElement>({ clave, alTerminar }: Opciones) {
  const elemento = useRef<T>(null)
  const visionado = useRef(iniciarVisionado())
  const avisado = useRef(false)
  const [visto, setVisto] = useState(false)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [tiempo, setTiempo] = useState(0)
  const [duracion, setDuracion] = useState(0)
  const [conError, setConError] = useState(false)

  // Read after mounting: the server cannot know, and a different first render would not match its HTML.
  useEffect(() => {
    if (recuerdaVisto(clave)) setVisto(true)
  }, [clave])

  useEffect(() => {
    if (visto && !avisado.current) {
      avisado.current = true
      alTerminar()
    }
  }, [visto, alTerminar])

  const alActualizar = useCallback<ReactEventHandler<T>>(
    (evento) => {
      const medio = evento.currentTarget
      setTiempo(medio.currentTime)
      setDuracion(medio.duration)
      visionado.current = avanzar(visionado.current, medio.currentTime)
      if (estaTerminado(visionado.current, medio.duration)) {
        recordarVisto(clave)
        setVisto(true)
      }
    },
    [clave],
  )

  const alternar = useCallback(() => {
    const medio = elemento.current
    if (!medio) return
    if (!medio.paused) {
      medio.pause()
      return
    }
    medio.play().catch((error: unknown) => {
      console.error("El navegador no dejó reproducir", error)
      setConError(true)
    })
  }, [])

  // Seeking moves the player but never what she watched: `avanzar` only counts steps that look like playing.
  const buscar = useCallback((segundos: number) => {
    const medio = elemento.current
    if (!medio) return
    medio.currentTime = segundos
    setTiempo(segundos)
  }, [])

  const alCargar: ReactEventHandler<T> = (evento) => setDuracion(evento.currentTarget.duration)

  const eventos = {
    onTimeUpdate: alActualizar,
    onLoadedMetadata: alCargar,
    onPlay: () => setReproduciendo(true),
    onPause: () => setReproduciendo(false),
    onEnded: () => setReproduciendo(false),
    onError: () => setConError(true),
  }

  return { elemento, eventos, visto, reproduciendo, tiempo, duracion, conError, alternar, buscar }
}
