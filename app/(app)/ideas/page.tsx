import { leerBanco } from "@/lib/datos/banco"
import { pilaresActivos } from "@/lib/datos/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { elegirLoteAccion } from "../piezas/acciones"
import {
  crearIdeaPropiaAccion,
  descartarIdeaAccion,
  descartarIdeasAccion,
  proponerIdeaAccion,
  quitarIdeaAccion,
  restaurarIdeasAccion,
  usarIdeaAccion,
} from "./acciones"
import { BancoDeIdeas } from "./banco-de-ideas"

export default async function Ideas() {
  const { db } = await exigirConi()
  const [ideas, activos] = await Promise.all([leerBanco(db, Date.now()), pilaresActivos(db)])

  return (
    <BancoDeIdeas
      ideas={ideas}
      pilares={activos.map(({ slug, nombre, nombreCorto }) => ({ slug, nombre, nombreCorto }))}
      acciones={{
        usar: usarIdeaAccion,
        quitar: quitarIdeaAccion,
        descartar: descartarIdeaAccion,
        proponer: proponerIdeaAccion,
        crear: crearIdeaPropiaAccion,
        elegirVarias: elegirLoteAccion,
        descartarVarias: descartarIdeasAccion,
        restaurar: restaurarIdeasAccion,
      }}
    />
  )
}
