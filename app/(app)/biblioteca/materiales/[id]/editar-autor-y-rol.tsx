"use client"

import { useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Eleccion } from "@/components/ui/filas"
import { LineaDeError } from "@/components/ui/linea-de-error"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"
import { AYUDA_DE_ROL, ETIQUETA_DE_ROL, ROLES, type Rol } from "@/lib/dominio/biblioteca/modelo"
import { PALABRAS } from "@/lib/dominio/biblioteca/palabras"
import { crearAutorAccion, editarMaterialAccion } from "../../acciones"
import { SelectorDeAutor } from "../../selector-de-autor"

export const AVISO_REPROCESAR = "Reprocesa el material para que sus ideas sacadas usen el cambio."

interface Propiedades {
  materialId: string
  autores: AutorDeLista[]
  autorId: string
  rol: Rol
  /** Its ideas were taken with the author and role it had: a change reaches them only by reprocessing. */
  conIdeas: boolean
}

export function EditarAutorYRol({ materialId, autores, autorId: inicial, rol: rolInicial, conIdeas }: Propiedades) {
  const [abierto, setAbierto] = useState(false)
  const [autorId, setAutorId] = useState(inicial)
  const [rol, setRol] = useState<Rol>(rolInicial)
  const [aviso, setAviso] = useState<string | null>(null)
  const { pendiente, error, ejecutar, limpiarError } = useAccion()

  function guardar() {
    ejecutar(
      () => editarMaterialAccion({ materialId, autorId, rol }),
      () => {
        setAbierto(false)
        setAviso(conIdeas ? AVISO_REPROCESAR : null)
      },
    )
  }

  function cerrar() {
    setAutorId(inicial)
    setRol(rolInicial)
    limpiarError()
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <div className="grid gap-2">
        {aviso ? <LineaDeEstado tipo="aviso" titulo={aviso} /> : null}
        <Boton variante="secundario" tamano="chico" className="w-fit" onClick={() => setAbierto(true)}>
          Cambiar autor o quién es para ti
        </Boton>
      </div>
    )
  }

  return (
    <section aria-label="Autor y quién es para ti" className="grid gap-4 rounded-panel bg-piedra p-4 shadow-relieve">
      <SelectorDeAutor autores={autores} valor={autorId} alElegir={setAutorId} alCrear={crearAutorAccion} />
      <fieldset className="elecciones grid">
        <legend className="text-cuerpo font-semibold">{PALABRAS.papel}</legend>
        {ROLES.map((opcion) => (
          <Eleccion
            key={opcion}
            nombre="rol"
            valor={opcion}
            elegido={rol === opcion}
            etiqueta={ETIQUETA_DE_ROL[opcion]}
            detalle={AYUDA_DE_ROL[opcion]}
            alElegir={() => setRol(opcion)}
          />
        ))}
      </fieldset>
      {error ? <LineaDeError>{error}</LineaDeError> : null}
      <Boton cargando={pendiente} onClick={guardar}>
        Guardar
      </Boton>
      <Boton variante="callado" deshabilitado={pendiente} onClick={cerrar}>
        Cancelar
      </Boton>
    </section>
  )
}
