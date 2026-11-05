import { Volver } from "@/components/ui/volver"
import { listarBorradores } from "@/lib/datos/borradores"
import { leerAviso } from "@/lib/dominio/biblioteca/borradores"
import { RUTA_DE_TEMAS } from "@/lib/dominio/biblioteca/filtros-de-temas"
import { porRed } from "@/lib/dominio/pilares"
import { exigirConi } from "@/lib/sesion/coni"
import { AvisoDeIdeas } from "../../aviso-de-ideas"
import { TrasElAviso } from "../../tras-el-aviso"
import { TarjetaDeBorradorDePilar, TarjetaDeBorradorDeRed } from "./tarjetas-de-borrador"

/** Spec 15c: the drafts that wait, pillars by network and then networks; approving is a second, separate step. */
export default async function Borradores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ db }, params] = await Promise.all([exigirConi(), searchParams])
  const { pilares, redes } = await listarBorradores(db)
  const aviso = leerAviso(params)
  return (
    <div className="grid gap-6 md:max-w-[42rem]">
      <Volver href={RUTA_DE_TEMAS}>Temas</Volver>
      <h1 className="text-pantalla">Borradores</h1>
      <AvisoDeIdeas texto={aviso} />
      {aviso ? <TrasElAviso parametro="aviso" /> : null}
      {pilares.length === 0 && redes.length === 0 ? (
        <p className="text-cuerpo text-apagado">No tienes borradores. Agrega un pilar o una red desde Temas.</p>
      ) : null}
      {porRed(pilares).map((grupo) => {
        const idDelTitulo = `borradores-${grupo.red ?? "sin-red"}`
        return (
          <section key={idDelTitulo} aria-labelledby={idDelTitulo} className="grid gap-3">
            <h2 id={idDelTitulo} className="text-pieza">
              {`Pilares de ${grupo.etiqueta}`}
            </h2>
            <ul className="grid gap-3">
              {grupo.pilares.map((borrador) => (
                <li key={borrador.id}>
                  <TarjetaDeBorradorDePilar borrador={borrador} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {redes.length > 0 ? (
        <section aria-labelledby="borradores-redes" className="grid gap-3">
          <h2 id="borradores-redes" className="text-pieza">
            Redes
          </h2>
          <ul className="grid gap-3">
            {redes.map((borrador) => (
              <li key={borrador.id}>
                <TarjetaDeBorradorDeRed borrador={borrador} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
