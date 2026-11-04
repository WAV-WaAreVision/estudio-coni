"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"
import { useAccion } from "@/components/use-accion"
import { type AutorDeLista, buscarAutores, hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { unirAutoresAccion } from "../../acciones"
import { Campo, CLASES_DE_CAMPO } from "../../campo"

const MAXIMO_DE_RESULTADOS = 6

const descripcion = (autor: AutorDeLista) => (autor.credencial ? `${autor.nombre}, ${autor.credencial}` : autor.nombre)

const pregunta = (origen: string, destino: string) =>
  `Uno a ${origen} con ${destino}: sus materiales y sus ideas sacadas pasan a ${destino}, y ${origen} sale de la lista. No se puede deshacer.`

interface Propiedades {
  /** The author of the page: the one that disappears. Never Coni's own card (the page checks `sePuedeUnir`). */
  origen: { id: string; nombre: string }
  /** Every other author; Coni may be the one that stays. */
  otros: AutorDeLista[]
}

/** Ported from Ingesta's `unir-autores.tsx`, with the search instead of a select (D7). */
export function UnirAutores({ origen, otros }: Propiedades) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  const [destino, setDestino] = useState<AutorDeLista | null>(null)
  // The element to focus only exists after the render that shows it.
  const [enfocar, setEnfocar] = useState<"busqueda" | "abrir" | null>(null)
  const busqueda = useRef<HTMLInputElement>(null)
  const abrir = useRef<HTMLButtonElement>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  useEffect(() => {
    const elemento = enfocar === "busqueda" ? busqueda.current : enfocar === "abrir" ? abrir.current : null
    if (!elemento) return
    elemento.focus()
    setEnfocar(null)
  }, [enfocar])

  function cerrar() {
    setAbierto(false)
    setTexto("")
    setDestino(null)
    limpiarError()
    setEnfocar("abrir")
  }

  if (!abierto) {
    return (
      <Boton
        ref={abrir}
        variante="secundario"
        tamano="chico"
        className="w-fit"
        onClick={() => {
          setAbierto(true)
          setEnfocar("busqueda")
        }}
      >
        Unir con otro autor
      </Boton>
    )
  }

  if (destino) {
    return (
      <ConfirmacionEnLinea
        trato="destructivo"
        pregunta={pregunta(origen.nombre, destino.nombre)}
        confirmar="Sí, unir"
        volver="Elegir otro"
        cargando={pendiente}
        error={error}
        alConfirmar={() =>
          ejecutar(
            () => unirAutoresAccion({ origen: origen.id, destino: destino.id }),
            () => router.push(hrefDeAutor(destino.id)),
          )
        }
        alVolver={() => {
          limpiarError()
          setDestino(null)
          setEnfocar("busqueda")
        }}
      />
    )
  }

  const buscado = texto.trim()
  const resultados = buscado === "" ? [] : buscarAutores(otros, buscado).slice(0, MAXIMO_DE_RESULTADOS)
  return (
    <section aria-label="Unir con otro autor" className="grid gap-3 rounded-panel bg-piedra-alta p-4">
      <p className="text-meta text-apagado">{`Elige con quién unir a ${origen.nombre}: la misma persona escrita de otra forma.`}</p>
      <Campo id="unir-buscar" etiqueta="Buscar por nombre">
        <input
          ref={busqueda}
          id="unir-buscar"
          type="search"
          autoComplete="off"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      <output aria-live="polite" className="text-meta text-apagado empty:sr-only">
        {buscado !== "" && resultados.length === 0 ? "Nadie se llama así todavía." : ""}
      </output>
      {resultados.length === 0 ? null : (
        <ul aria-label="Con quién unir" className="grid gap-2">
          {resultados.map((autor) => (
            <li key={autor.id}>
              <Boton variante="secundario" tamano="chico" className="w-full" onClick={() => setDestino(autor)}>
                {descripcion(autor)}
              </Boton>
            </li>
          ))}
        </ul>
      )}
      <Boton variante="callado" onClick={cerrar}>
        Cancelar
      </Boton>
    </section>
  )
}
