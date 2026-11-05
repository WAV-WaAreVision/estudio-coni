import { leerBanco } from "@/lib/datos/banco"
import { pilaresElegibles } from "@/lib/datos/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { elegirLoteAccion, hacerCarruselAccion } from "../piezas/acciones"
import {
  cambiarAnguloAccion,
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
  const [ideas, activos] = await Promise.all([leerBanco(db, Date.now()), pilaresElegibles(db)])

  return (
    <BancoDeIdeas
      ideas={ideas}
      pilares={activos.map(({ slug, nombre, nombreCorto, red, angulos }) => ({
        slug,
        nombre,
        nombreCorto,
        red,
        angulos: angulos.map((angulo) => ({ id: angulo.id, slug: angulo.slug, nombre: angulo.nombre })),
      }))}
      acciones={{
        usar: usarIdeaAccion,
        quitar: quitarIdeaAccion,
        descartar: descartarIdeaAccion,
        proponer: proponerIdeaAccion,
        crear: crearIdeaPropiaAccion,
        elegirVarias: elegirLoteAccion,
        descartarVarias: descartarIdeasAccion,
        restaurar: restaurarIdeasAccion,
        hacerCarrusel: hacerCarruselAccion,
        cambiarAngulo: cambiarAnguloAccion,
      }}
    />
  )
}
