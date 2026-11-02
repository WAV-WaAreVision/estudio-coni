"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import type { Resultado } from "@/lib/acciones/resultado"
import { type AutorDeLista, autoresParecidos, buscarAutores } from "@/lib/dominio/biblioteca/autores"
import {
  ETIQUETA_DE_TIPO_DE_AUTOR,
  esTipoDeAutorNuevo,
  TIPOS_DE_AUTOR_NUEVO,
  type TipoDeAutorNuevo,
} from "@/lib/dominio/biblioteca/modelo"
import { Campo, CLASES_DE_CAMPO } from "./campo"

interface AutorNuevo {
  nombre: string
  credencial: string
  tipo: TipoDeAutorNuevo
}

interface Propiedades {
  autores: AutorDeLista[]
  /** The id of the picked author, "" while there is none. */
  valor: string
  alElegir: (id: string) => void
  alCrear: (datos: AutorNuevo) => Promise<Resultado<{ autor: AutorDeLista }>>
}

const MAXIMO_DE_RESULTADOS = 6

/** An Enter inside these fields must not send a form that contains them. */
const sinEnviar = (evento: { key: string; preventDefault: () => void }) => {
  if (evento.key === "Enter") evento.preventDefault()
}

const descripcion = (autor: AutorDeLista) => (autor.credencial ? `${autor.nombre}, ${autor.credencial}` : autor.nombre)

/** Search an author by name or alias, or add one ("Autor nuevo"); whoever holds it only ever sees the picked id. */
export function SelectorDeAutor({ autores: iniciales, valor, alElegir, alCrear }: Propiedades) {
  const [autores, setAutores] = useState(iniciales)
  const [texto, setTexto] = useState("")
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState("")
  const [credencial, setCredencial] = useState("")
  const [tipo, setTipo] = useState<TipoDeAutorNuevo>("persona")
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [cambiando, setCambiando] = useState(false)

  const elegido = autores.find((autor) => autor.id === valor)

  function elegir(id: string) {
    setCambiando(false)
    setCreando(false)
    setError(null)
    alElegir(id)
  }

  function empezarNuevo() {
    setNombre(texto.trim())
    setCredencial("")
    setTipo("persona")
    setError(null)
    setCreando(true)
  }

  async function crear() {
    setError(null)
    setGuardando(true)
    const resultado = await alCrear({ nombre, credencial, tipo })
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    const { autor } = resultado
    setAutores((actuales) => (actuales.some((actual) => actual.id === autor.id) ? actuales : [...actuales, autor]))
    setTexto("")
    elegir(autor.id)
  }

  if (elegido && !cambiando) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-bloque bg-piedra-honda p-3.5 shadow-hundido">
        <p className="grid text-cuerpo">
          <span className="font-semibold text-tinta">{elegido.nombre}</span>
          {elegido.credencial ? <span className="text-meta text-apagado">{elegido.credencial}</span> : null}
        </p>
        <Boton variante="callado" onClick={() => setCambiando(true)} aria-label="Cambiar autor">
          Cambiar
        </Boton>
      </div>
    )
  }

  if (creando) {
    const parecidos = autoresParecidos(autores, nombre)
    return (
      <div className="grid gap-3 rounded-bloque bg-piedra-honda p-3.5">
        <Campo id="autor-nombre" etiqueta="Nombre del autor" ayuda="Ej: Esther Perel, @cuenta o Instituto Gottman">
          <input
            id="autor-nombre"
            type="text"
            autoComplete="off"
            value={nombre}
            aria-describedby="autor-nombre-ayuda"
            onKeyDown={sinEnviar}
            onChange={(evento) => setNombre(evento.target.value)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
        {parecidos.map((parecido) => (
          <div key={parecido.id} className="grid gap-2">
            <p className="text-cuerpo text-tinta">¿Es el mismo autor que {parecido.nombre}?</p>
            <Boton variante="secundario" tamano="chico" className="w-fit" onClick={() => elegir(parecido.id)}>
              Sí, es {parecido.nombre}
            </Boton>
          </div>
        ))}
        <Campo
          id="autor-credencial"
          etiqueta={
            <>
              Credencial <span className="font-normal text-apagado">(opcional)</span>
            </>
          }
          ayuda="Ej: Psicoterapeuta de parejas"
        >
          <input
            id="autor-credencial"
            type="text"
            autoComplete="off"
            value={credencial}
            aria-describedby="autor-credencial-ayuda"
            onKeyDown={sinEnviar}
            onChange={(evento) => setCredencial(evento.target.value)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
        <Campo id="autor-tipo" etiqueta="Tipo de autor">
          <select
            id="autor-tipo"
            value={tipo}
            onChange={(evento) => {
              if (esTipoDeAutorNuevo(evento.target.value)) setTipo(evento.target.value)
            }}
            className={CLASES_DE_CAMPO}
          >
            {TIPOS_DE_AUTOR_NUEVO.map((opcion) => (
              <option key={opcion} value={opcion}>
                {ETIQUETA_DE_TIPO_DE_AUTOR[opcion]}
              </option>
            ))}
          </select>
        </Campo>
        {error ? <LineaDeError>{error}</LineaDeError> : null}
        <Boton variante="secundario" cargando={guardando} onClick={() => void crear()}>
          Crear autor
        </Boton>
        <Boton variante="callado" deshabilitado={guardando} onClick={() => setCreando(false)}>
          Volver a buscar
        </Boton>
      </div>
    )
  }

  const encontrados = buscarAutores(autores, texto)
  return (
    <div className="grid gap-3">
      <Campo id="autor-busqueda" etiqueta="Autor" ayuda="Busca por nombre o alias.">
        <input
          id="autor-busqueda"
          type="search"
          autoComplete="off"
          value={texto}
          aria-describedby="autor-busqueda-ayuda"
          onKeyDown={sinEnviar}
          onChange={(evento) => setTexto(evento.target.value)}
          className={CLASES_DE_CAMPO}
        />
      </Campo>
      {encontrados.length === 0 ? (
        <p className="text-cuerpo text-apagado">Nadie se llama así todavía.</p>
      ) : (
        <ul className="grid gap-2">
          {encontrados.slice(0, MAXIMO_DE_RESULTADOS).map((autor) => (
            <li key={autor.id}>
              <button
                type="button"
                onClick={() => elegir(autor.id)}
                aria-label={descripcion(autor)}
                className="grid min-h-objetivo w-full content-center gap-0.5 rounded-bloque bg-piedra px-3.5 py-2.5 text-left shadow-relieve active:shadow-hundido"
              >
                <span className="font-semibold">{autor.nombre}</span>
                {autor.credencial ? <span className="text-meta text-apagado">{autor.credencial}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {encontrados.length > MAXIMO_DE_RESULTADOS ? (
        <p className="text-meta text-apagado">Escribe más del nombre para ver el resto.</p>
      ) : null}
      <Boton variante="secundario" tamano="chico" className="w-fit" onClick={empezarNuevo}>
        Autor nuevo
      </Boton>
    </div>
  )
}
