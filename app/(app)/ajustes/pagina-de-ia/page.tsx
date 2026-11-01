import { Volver } from "@/components/ui/volver"
import { leerZona } from "@/lib/datos/metricas"
import { instanteEnPalabras } from "@/lib/datos-personales/fechas"
import { exigirConi } from "@/lib/sesion/coni"
import { LINEA_PARA_LA_BIO, TITULO_DE_TRANSPARENCIA } from "@/lib/transparencia/texto"
import { leerVersionesDeTransparencia, type VersionDeTransparencia } from "@/lib/transparencia/versiones"
import { publicarTransparenciaAccion, volverATransparenciaAccion } from "../acciones"
import { EditorDePaginaDeIa } from "./editor-de-pagina-de-ia"

/** Ajustes › Página de IA (spec 2026-11-01, D3): the editor of /l/ia, its versions and the line for her bios. */
export default async function AjustesPaginaDeIa() {
  const { db } = await exigirConi()
  const [versiones, zona] = await Promise.all([leerVersionesDeTransparencia(db), leerZona(db)])
  const fecha = (version: VersionDeTransparencia) => instanteEnPalabras(version.creadaEn, zona, { anio: true })

  return (
    <div>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="mt-5 text-pantalla text-balance">Página de IA</h1>
      <p className="mt-1.5 text-meta text-apagado">
        «{TITULO_DE_TRANSPARENCIA}»: lo que cuentas en público sobre cómo usas IA. Cada vez que publicas queda una
        versión.
      </p>
      <div className="mt-6">
        <EditorDePaginaDeIa
          publicada={versiones.vigente ? { texto: versiones.vigente.texto, fecha: fecha(versiones.vigente) } : null}
          inicial={versiones.vigente?.texto ?? versiones.propuesta?.texto ?? ""}
          esPropuesta={versiones.vigente === null && versiones.propuesta !== null}
          historial={versiones.historial.map((version) => ({
            version: version.version,
            fecha: fecha(version),
            motivo: version.motivo,
            texto: version.texto,
            vigente: version.vigente,
          }))}
          lineaParaLaBio={LINEA_PARA_LA_BIO}
          publicar={publicarTransparenciaAccion}
          volverA={volverATransparenciaAccion}
        />
      </div>
    </div>
  )
}
