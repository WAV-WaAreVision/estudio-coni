"use client"

import { type FormEvent, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { Resultado } from "@/lib/acciones/resultado"
import {
  type Anotacion,
  armarAnotacion,
  CAMPOS_DE_POST,
  type CamposDePost,
  SEMANAS_POR_ANOTAR,
} from "@/lib/metricas/linkedin"

interface PostEnLista {
  piezaId: string
  titulo: string
  /** "miércoles 14 · 19:00". */
  fecha: string
}

interface PropiedadesDeNumeros {
  pendientes: readonly PostEnLista[]
  seguidores: number | null
  alGuardar: (anotacion: Anotacion) => Promise<Resultado<{ anotados: number }>>
}

const VACIOS: CamposDePost = { impresiones: "", reacciones: "", comentarios: "", compartidos: "" }
const CAMPO = "campo w-full text-cuerpo tabular-nums"

/** Decision 19: WAV copies each post's four numbers from LinkedIn once a week, plus the followers. Rows only. */
export function NumerosDeLinkedin({ pendientes, seguidores, alGuardar }: PropiedadesDeNumeros) {
  const [campos, setCampos] = useState<Record<string, CamposDePost>>({})
  const [textoDeSeguidores, setTextoDeSeguidores] = useState(seguidores === null ? "" : String(seguidores))
  const [invalido, setInvalido] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<string | null>(null)
  const { pendiente, error, ejecutar } = useAccion()

  function cambiar(piezaId: string, campo: keyof CamposDePost, valor: string) {
    setGuardado(null)
    setCampos((actuales) => ({ ...actuales, [piezaId]: { ...(actuales[piezaId] ?? VACIOS), [campo]: valor } }))
  }

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setGuardado(null)
    const armada = armarAnotacion(
      pendientes.map((post) => ({
        piezaId: post.piezaId,
        titulo: post.titulo,
        campos: campos[post.piezaId] ?? VACIOS,
      })),
      textoDeSeguidores,
    )
    if (!armada.ok) {
      setInvalido(armada.error)
      return
    }
    setInvalido(null)
    ejecutar(
      () => alGuardar(armada.anotacion),
      (resultado) => {
        setCampos({})
        setGuardado(resultado.anotados === 1 ? "Guardado: 1 post." : `Guardado: ${resultado.anotados} posts.`)
      },
    )
  }

  return (
    <form onSubmit={guardar} className="grid gap-6 pb-5">
      <p className="text-meta text-apagado">
        {`Posts de LinkedIn de las últimas ${SEMANAS_POR_ANOTAR} semanas sin números de esta semana. Cópialos de las estadísticas de cada publicación.`}
      </p>
      {pendientes.length === 0 ? (
        <p className="text-cuerpo">
          {`Todos los posts de las últimas ${SEMANAS_POR_ANOTAR} semanas ya tienen sus números de esta semana.`}
        </p>
      ) : (
        <ul className="grid gap-6">
          {pendientes.map((post) => (
            <li key={post.piezaId} className="grid gap-3">
              <p className="grid gap-0.5">
                <span className="text-cuerpo font-semibold">{post.titulo}</span>
                <span data-snapshot="varia" className="text-meta text-apagado">
                  {post.fecha}
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {CAMPOS_DE_POST.map(({ campo, etiqueta }) => (
                  <label key={campo} className="grid gap-1">
                    <span className="text-meta font-semibold">{etiqueta}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={`${etiqueta} de ${post.titulo}`}
                      value={(campos[post.piezaId] ?? VACIOS)[campo]}
                      onChange={(evento) => cambiar(post.piezaId, campo, evento.target.value)}
                      className={CAMPO}
                    />
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <label className="grid gap-1">
        <span className="text-meta font-semibold">Seguidores esta semana</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={textoDeSeguidores}
          onChange={(evento) => {
            setGuardado(null)
            setTextoDeSeguidores(evento.target.value)
          }}
          className={CAMPO}
        />
      </label>
      {invalido ? <LineaDeEstado tipo="error" titulo={invalido} /> : null}
      {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      {guardado ? <LineaDeEstado tipo="exito" titulo={guardado} /> : null}
      <Boton type="submit" variante="secundario" cargando={pendiente}>
        Guardar números
      </Boton>
    </form>
  )
}
