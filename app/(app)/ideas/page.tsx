import { leerBanco } from "@/lib/datos/banco"
import { exigirConi } from "@/lib/sesion/coni"
import {
  crearIdeaPropiaAccion,
  descartarIdeaAccion,
  proponerIdeaAccion,
  quitarIdeaAccion,
  usarIdeaAccion,
} from "./acciones"
import { BancoDeIdeas } from "./banco-de-ideas"

export default async function Ideas() {
  const { db } = await exigirConi()
  const ideas = await leerBanco(db, Date.now())

  return (
    <BancoDeIdeas
      ideas={ideas}
      acciones={{
        usar: usarIdeaAccion,
        quitar: quitarIdeaAccion,
        descartar: descartarIdeaAccion,
        proponer: proponerIdeaAccion,
        crear: crearIdeaPropiaAccion,
      }}
    />
  )
}
