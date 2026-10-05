import { partirEnMarcas } from "@/lib/dominio/etiquetas"

/** Brandkit 9.9: the approved script in reading mode; the tone marks are chips (plain text only while editing). */
export function GuionEnLectura({ guion }: { guion: string }) {
  const partes = partirEnMarcas(guion)
  let posicion = 0
  return (
    <p className="whitespace-pre-wrap text-guion">
      {partes.map((parte) => {
        const clave = posicion
        posicion += parte.valor.length
        return parte.tipo === "marca" ? (
          <span
            key={clave}
            className="mr-0.5 inline-block rounded-full bg-pista px-2 align-middle text-meta font-medium text-apagado"
          >
            {parte.valor}
          </span>
        ) : (
          <span key={clave}>{parte.valor}</span>
        )
      })}
    </p>
  )
}
