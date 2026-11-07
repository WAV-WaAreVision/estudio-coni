import Link from "next/link"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"
import { sePuedeReintentar } from "@/lib/dominio/biblioteca/estado"
import { subidoHace, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { etiquetaDeRol, etiquetaDeTipo } from "@/lib/dominio/biblioteca/modelo"
import { BotonReintentar } from "./boton-reintentar"
import { EstadoDeMaterial } from "./estado-de-material"
import { TemaDelMaterial } from "./tema-del-material"

/** A material on the phone list: the text opens the detail; Reintentar stays on the card. */
export function TarjetaDeMaterial({ material, ahora }: { material: MaterialDeLista; ahora: number }) {
  return (
    <li className="grid gap-2 rounded-panel bg-piedra p-4 shadow-relieve">
      <Link href={`/biblioteca/materiales/${material.id}`} className="grid gap-1">
        <span className="text-cuerpo font-semibold text-balance text-tinta">{material.titulo ?? "Sin título"}</span>
        <span className="text-meta text-apagado">
          {`${etiquetaDeTipo(material.tipo)} · ${material.autor} · ${etiquetaDeRol(material.rol)}`}
        </span>
        <span className="text-meta text-apagado">
          <TemaDelMaterial tema={material.tema} />
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <EstadoDeMaterial material={material} />
        <span data-snapshot="varia" className="text-meta text-apagado">
          {subidoHace(material.creado_en, ahora, ZONA_DE_LA_BIBLIOTECA)}
        </span>
      </div>
      {sePuedeReintentar(material) ? <BotonReintentar materialId={material.id} /> : null}
    </li>
  )
}
