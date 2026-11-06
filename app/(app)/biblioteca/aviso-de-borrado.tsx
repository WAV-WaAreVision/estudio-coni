"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Aviso } from "@/components/ui/aviso"
import { ERROR_SESION_VENCIDA } from "@/lib/acciones/resultado"
import {
  avisoTrasBorrar,
  ID_DEL_TITULO_DE_LA_LISTA,
  LO_RECUPERE,
  type LoBorrado,
} from "@/lib/dominio/biblioteca/borrado"
import { recuperarAutorAccion, recuperarMaterialAccion } from "./acciones"

interface LoQueSeBorro {
  id: string
  nombre: string | null
}

interface Propiedades {
  tipo: LoBorrado
  /** What the address says was just deleted; null with no note, and once `TrasElAviso` took it out. */
  borrado: LoQueSeBorro | null
}

type Fase =
  | { tipo: "cerrado" }
  | ({ tipo: "borrado" | "deshaciendo" } & LoQueSeBorro)
  | { tipo: "final"; mensaje: string }

/**
 * Conidolly's toast after «Borrar» (spec): 8 s with «Deshacer», then «Lo recuperé.» or why not. The list draws it on
 * every render, so the toast outlives the note leaving the address and the list redrawn after «Deshacer».
 */
export function AvisoDeBorrado({ tipo, borrado }: Propiedades) {
  const router = useRouter()
  const [, empezar] = useTransition()
  const [visto, setVisto] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>({ tipo: "cerrado" })
  // Derived from the props during render on purpose: a new id is a new deletion and starts a new toast.
  if (borrado !== null && borrado.id !== visto) {
    setVisto(borrado.id)
    setFase({ tipo: "borrado", ...borrado })
  }
  // Once the note left the address, the same id coming back is a second deletion (desktop: the list stays mounted).
  if (borrado === null && visto !== null) setVisto(null)
  const cerrar = useCallback(() => setFase({ tipo: "cerrado" }), [])

  // «Deshacer» held her focus; when it goes (the toast closed, or «Lo recuperé.» took its place) the focus would
  // fall to <body>. Give it to the list's heading, unless she already moved it elsewhere.
  const conDeshacer = fase.tipo === "borrado" || fase.tipo === "deshaciendo"
  const habiaDeshacer = useRef(false)
  useEffect(() => {
    if (conDeshacer) {
      habiaDeshacer.current = true
      return
    }
    if (!habiaDeshacer.current) return
    habiaDeshacer.current = false
    const activo = document.activeElement
    if (activo !== null && activo !== document.body) return
    document.getElementById(ID_DEL_TITULO_DE_LA_LISTA)?.focus()
  }, [conDeshacer])

  if (fase.tipo === "cerrado") return null
  if (fase.tipo === "final") return <Aviso key="final" mensaje={fase.mensaje} alCerrar={cerrar} />
  const { id, nombre } = fase
  return (
    <Aviso
      key={id}
      mensaje={avisoTrasBorrar(nombre)}
      alCerrar={cerrar}
      enfocarDeshacer
      deshaciendo={fase.tipo === "deshaciendo"}
      alDeshacer={() => {
        if (fase.tipo === "deshaciendo") return
        setFase({ tipo: "deshaciendo", id, nombre })
        empezar(async () => {
          const resultado = tipo === "material" ? await recuperarMaterialAccion(id) : await recuperarAutorAccion(id)
          if (!resultado.ok && resultado.error === ERROR_SESION_VENCIDA) {
            router.push("/ingreso")
            return
          }
          setFase({ tipo: "final", mensaje: resultado.ok ? LO_RECUPERE : resultado.error })
        })
      }}
    />
  )
}
