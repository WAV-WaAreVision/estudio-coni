"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { Aviso } from "@/components/ui/aviso"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import { deshacerAprobacionAccion } from "../../piezas/acciones"
import { textoFirmaste } from "./textos"

/**
 * The toast of a fresh signature (design 2026-10-15, section 6): "Deshacer" while the undo window lasts. `quedanMs`
 * comes from the server clock the undo is checked against. Both values are kept from the first render: the screen
 * refreshes every 4 s, and once the render claims the piece the row's version moves on; the undo must send the
 * version she signed at so the lock refuses a late one, and a refresh must not restart the toast's timer. After an
 * undo the Guion screen opens again with its own toast (`?deshecho=1`).
 */
export function DeshacerFirma({ piezaId, version, quedanMs }: { piezaId: string; version: number; quedanMs: number }) {
  const router = useRouter()
  const deshacer = useAccion()
  const [firmada] = useState(version)
  const [duracionMs] = useState(quedanMs)
  const [visible, setVisible] = useState(true)
  // Stable, so a re-render does not restart the toast's timer.
  const cerrar = useCallback(() => setVisible(false), [])

  return (
    <>
      {visible ? (
        <Aviso
          mensaje={textoFirmaste(duracionMs)}
          duracionMs={duracionMs}
          alCerrar={cerrar}
          alDeshacer={() =>
            deshacer.ejecutar(
              () => deshacerAprobacionAccion(piezaId, firmada),
              () => router.replace(`/guion/${piezaId}?deshecho=1`),
            )
          }
        />
      ) : null}
      {deshacer.error ? <LineaDeEstado tipo="error" titulo={deshacer.error} /> : null}
    </>
  )
}
