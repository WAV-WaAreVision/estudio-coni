"use client"

import { useState } from "react"
import { type AutorResumido, buscarAutores } from "@/lib/dominio/biblioteca/autores"
import { Campo, CLASES_DE_CAMPO } from "../campo"
import { TablaDeAutores } from "./tabla-de-autores"
import { TarjetaDeAutor } from "./tarjeta-de-autor"

/** The search filters on the client (D5): one list read by the page, no request per key. */
export function ListaDeAutores({ autores, seleccion }: { autores: AutorResumido[]; seleccion: string | null }) {
  const [texto, setTexto] = useState("")
  const visibles = buscarAutores(autores, texto)
  return (
    <div className="grid gap-4">
      <div className="md:max-w-sm">
        <Campo id="buscar-autor" etiqueta="Buscar por nombre">
          <input
            id="buscar-autor"
            type="search"
            autoComplete="off"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            className={CLASES_DE_CAMPO}
          />
        </Campo>
      </div>
      {visibles.length === 0 ? (
        <output className="text-cuerpo text-apagado">Nadie se llama así todavía.</output>
      ) : (
        <>
          <ul aria-label="Autores" className="grid gap-3 md:hidden">
            {visibles.map((autor) => (
              <TarjetaDeAutor key={autor.id} autor={autor} />
            ))}
          </ul>
          <div className="hidden md:block">
            <TablaDeAutores autores={visibles} seleccion={seleccion} />
          </div>
        </>
      )}
    </div>
  )
}
