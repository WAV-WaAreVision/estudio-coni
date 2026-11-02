"use client"

import { useEffect, useRef, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { useAccion } from "@/components/use-accion"
import { ERROR_GENERICO, type Resultado } from "@/lib/acciones/resultado"
import {
  type AutorDeLista,
  autoresParecidos,
  buscarAutores,
  LARGO_DE_AUTOR_NUEVO,
} from "@/lib/dominio/biblioteca/autores"
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

const cuantos = (total: number) =>
  total === 0 ? "Nadie se llama así todavía." : total === 1 ? "1 autor" : `${total} autores`

/** Search an author by name or alias, or add one ("Autor nuevo"); whoever holds it only ever sees the picked id. */
export function SelectorDeAutor({ autores: iniciales, valor, alElegir, alCrear }: Propiedades) {
  const [autores, setAutores] = useState(iniciales)
  const [texto, setTexto] = useState("")
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState("")
  const [credencial, setCredencial] = useState("")
  const [tipo, setTipo] = useState<TipoDeAutorNuevo>("persona")
  const [cambiando, setCambiando] = useState(false)
  /** "Ya existía como …": the new name was an author she already had. */
  const [yaExistia, setYaExistia] = useState<string | null>(null)
  const [enfocar, setEnfocar] = useState<"busqueda" | "cambiar" | null>(null)
  const busqueda = useRef<HTMLInputElement>(null)
  const cambiar = useRef<HTMLButtonElement>(null)
  const { pendiente: guardando, error, ejecutar, limpiarError } = useAccion()

  const elegido = autores.find((autor) => autor.id === valor)
  const mostrandoElegido = elegido !== undefined && !cambiando

  // The element to focus only exists after the render that shows it (and, after choosing, after the parent takes the id).
  useEffect(() => {
    const destino =
      enfocar === "busqueda" ? busqueda.current : enfocar === "cambiar" && mostrandoElegido ? cambiar.current : null
    if (!destino) return
    destino.focus()
    setEnfocar(null)
  }, [enfocar, mostrandoElegido])

  function elegir(id: string) {
    setCambiando(false)
    setCreando(false)
    limpiarError()
    setEnfocar("cambiar")
    alElegir(id)
  }

  function abrirBusqueda() {
    setYaExistia(null)
    setCambiando(true)
    setEnfocar("busqueda")
  }

  function dejarElActual() {
    setCambiando(false)
    setCreando(false)
    setTexto("")
    setEnfocar("cambiar")
  }

  function empezarNuevo() {
    setNombre(texto.trim())
    setCredencial("")
    setTipo("persona")
    limpiarError()
    setCreando(true)
  }

  function crear() {
    const conocidos = autores
    ejecutar(
      async () => {
        try {
          return await alCrear({ nombre, credencial, tipo })
        } catch (fallo) {
          // A rejected action (the network, the server) must not leave the button spinning or break the screen.
          console.error("No pude crear el autor", fallo)
          return { ok: false, error: ERROR_GENERICO }
        }
      },
      ({ autor }) => {
        // crear_autor answers the existing author when the name or one of its aliases was already taken.
        const existente = conocidos.find((actual) => actual.id === autor.id)
        if (!existente) setAutores([...conocidos, autor])
        setYaExistia(existente ? `Ya existía como ${existente.nombre}; lo elegí.` : null)
        setTexto("")
        elegir(autor.id)
      },
    )
  }

  if (elegido && mostrandoElegido) {
    return (
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3 rounded-bloque bg-piedra-honda p-3.5 shadow-hundido">
          <p className="grid text-cuerpo">
            <span className="font-semibold text-tinta">{elegido.nombre}</span>
            {elegido.credencial ? <span className="text-meta text-apagado">{elegido.credencial}</span> : null}
          </p>
          <Boton ref={cambiar} variante="callado" onClick={abrirBusqueda} aria-label="Cambiar autor">
            Cambiar
          </Boton>
        </div>
        <output aria-live="polite" className="block text-meta text-apagado">
          {yaExistia}
        </output>
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
            maxLength={LARGO_DE_AUTOR_NUEVO}
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
            maxLength={LARGO_DE_AUTOR_NUEVO}
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
        <Boton variante="secundario" cargando={guardando} onClick={crear}>
          Crear autor
        </Boton>
        <Boton
          variante="callado"
          deshabilitado={guardando}
          onClick={() => {
            limpiarError()
            setCreando(false)
          }}
        >
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
          ref={busqueda}
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
      {/* One live line for both cases: the count is only heard, the empty message is also seen. */}
      <output aria-live="polite" className={encontrados.length === 0 ? "block text-cuerpo text-apagado" : "sr-only"}>
        {cuantos(encontrados.length)}
      </output>
      {encontrados.length === 0 ? null : (
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
      {elegido ? (
        <Boton variante="callado" tamano="chico" className="w-fit" onClick={dejarElActual}>
          Dejar a {elegido.nombre}
        </Boton>
      ) : null}
    </div>
  )
}
