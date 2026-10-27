"use client"

import { useId, useState } from "react"
import { Boton } from "@/components/ui/boton"
import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

/** The post as it goes on LinkedIn, folded to four lines with "Ver texto completo" (mockup option A). */
export function TextoDelPost({ texto }: { texto: string }) {
  const [completo, setCompleto] = useState(false)
  const id = useId()
  return (
    <div className="grid gap-2">
      <Panel>
        <p id={id} className={cn("whitespace-pre-wrap text-cuerpo leading-prosa", !completo && "line-clamp-4")}>
          {texto}
        </p>
      </Panel>
      <Boton
        variante="callado"
        tamano="chico"
        aria-expanded={completo}
        aria-controls={id}
        onClick={() => setCompleto((actual) => !actual)}
      >
        {completo ? "Ver menos" : "Ver texto completo"}
      </Boton>
    </div>
  )
}
