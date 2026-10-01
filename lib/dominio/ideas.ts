import type { Pilar } from "@/lib/dominio/pilares"

export interface IdeaDelBanco {
  id: string
  pilar: Pilar
  fuerza: "alta" | "media" | "baja"
  numero: number | null
}

const PESO_DE_FUERZA: Record<IdeaDelBanco["fuerza"], number> = { alta: 0, media: 1, baja: 2 }

/**
 * The ideas offered for the week: the pillars that came out least lately go first, one idea per pillar before any
 * pillar repeats, and inside a pillar the stronger idea and then the lower number. Same bank, same answer.
 */
export function sugerirIdeas(entrada: {
  banco: readonly IdeaDelBanco[]
  /** Pillars of the pieces started in the last weeks, one entry per piece. */
  recientes: readonly Pilar[]
  cuantas: number
}): IdeaDelBanco[] {
  const usos = new Map<Pilar, number>()
  for (const pilar of entrada.recientes) usos.set(pilar, (usos.get(pilar) ?? 0) + 1)

  const pendientes = [...entrada.banco].sort(
    (a, b) =>
      PESO_DE_FUERZA[a.fuerza] - PESO_DE_FUERZA[b.fuerza] ||
      (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id),
  )
  const elegidas: IdeaDelBanco[] = []
  while (elegidas.length < entrada.cuantas && pendientes.length > 0) {
    // Each pick counts as a use of its pillar, so the next one goes to the pillar with the fewest.
    let mejor = 0
    for (let candidata = 1; candidata < pendientes.length; candidata++) {
      const pilarMejor = pendientes[mejor]?.pilar
      const pilarCandidata = pendientes[candidata]?.pilar
      if (!pilarMejor || !pilarCandidata) continue
      if ((usos.get(pilarCandidata) ?? 0) < (usos.get(pilarMejor) ?? 0)) mejor = candidata
    }
    const [idea] = pendientes.splice(mejor, 1)
    if (!idea) break
    usos.set(idea.pilar, (usos.get(idea.pilar) ?? 0) + 1)
    elegidas.push(idea)
  }
  return elegidas
}
