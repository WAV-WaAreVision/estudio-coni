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
  type NumerosDeLaSemana,
  SEMANAS_POR_ANOTAR,
} from "@/lib/metricas/linkedin"

interface PostEnLista {
  piezaId: string
  titulo: string
  /** "miércoles 14 · 19:00". */
  fecha: string
  /** What she noted this week, shown to correct. */
  estaSemana: NumerosDeLaSemana | null
}

interface PropiedadesDeNumeros {
  posts: readonly PostEnLista[]
  seguidores: number | null
  alGuardar: (anotacion: Anotacion) => Promise<Resultado<{ anotados: number }>>
}

const VACIOS: CamposDePost = { impresiones: "", reacciones: "", comentarios: "", compartidos: "" }
const CAMPO = "campo w-full text-cuerpo tabular-nums"

const comoTexto = (valor: number | null) => (valor === null ? "" : valor.toLocaleString("es-CL"))

function camposDe(numeros: NumerosDeLaSemana | null): CamposDePost {
  if (!numeros) return VACIOS
  return {
    impresiones: comoTexto(numeros.impresiones),
    reacciones: comoTexto(numeros.reacciones),
    comentarios: comoTexto(numeros.comentarios),
    compartidos: comoTexto(numeros.compartidos),
  }
}

/**
 * Decision 19: WAV copies each post's four numbers from LinkedIn once a week, plus the followers. A post noted this week
 * shows its numbers and is sent again only when one is changed (a second save of the day replaces the row).
 */
export function NumerosDeLinkedin({ posts, seguidores, alGuardar }: PropiedadesDeNumeros) {
  const [guardados, setGuardados] = useState<Record<string, CamposDePost>>(() =>
    Object.fromEntries(posts.map((post) => [post.piezaId, camposDe(post.estaSemana)])),
  )
  const [campos, setCampos] = useState<Record<string, CamposDePost>>({})
  const valores = (piezaId: string) => campos[piezaId] ?? guardados[piezaId] ?? VACIOS
  const [textoDeSeguidores, setTextoDeSeguidores] = useState(seguidores === null ? "" : String(seguidores))
  const [invalido, setInvalido] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<string | null>(null)
  const { pendiente, error, ejecutar } = useAccion()

  function cambiar(piezaId: string, campo: keyof CamposDePost, valor: string) {
    setGuardado(null)
    setCampos((actuales) => ({ ...actuales, [piezaId]: { ...valores(piezaId), [campo]: valor } }))
  }

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setGuardado(null)
    const armada = armarAnotacion(
      posts.map((post) => ({
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
        setGuardados((anteriores) => ({ ...anteriores, ...campos }))
        setCampos({})
        setGuardado(resultado.anotados === 1 ? "Guardado: 1 post." : `Guardado: ${resultado.anotados} posts.`)
      },
    )
  }

  return (
    <form onSubmit={guardar} className="grid gap-6 pb-5">
      <p className="text-meta text-apagado">
        {`Posts de LinkedIn de las últimas ${SEMANAS_POR_ANOTAR} semanas. Copia los números de las estadísticas de cada publicación; los que ya anotaste esta semana se pueden corregir.`}
      </p>
      {posts.length === 0 ? (
        <p className="text-cuerpo">{`No hay posts de LinkedIn de las últimas ${SEMANAS_POR_ANOTAR} semanas.`}</p>
      ) : (
        <ul className="grid gap-6">
          {posts.map((post) => (
            <li key={post.piezaId} className="grid gap-3">
              <p className="grid gap-0.5">
                <span className="text-cuerpo font-semibold">{post.titulo}</span>
                <span data-snapshot="varia" className="text-meta text-apagado">
                  {post.fecha}
                </span>
                {post.estaSemana ? (
                  <span className="text-meta text-apagado">Anotado esta semana: puedes corregirlo.</span>
                ) : null}
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
                      value={valores(post.piezaId)[campo]}
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
