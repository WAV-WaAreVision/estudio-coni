export interface TemaPrincipal {
  nombre: string
  /** How many other topics the material's ideas belong to: the list shows "+N". */
  otros: number
}

export interface IdeaConTema {
  materialId: string
  temaId: string | null
  nombre: string
  excluida: boolean
}

/**
 * The main topic of each material (spec 1, D8): over its ideas that were not excluded and have a named topic, the topic with
 * the most ideas; a tie goes to the name first in Spanish order. A material without such ideas has no entry.
 */
export function temasPrincipales(ideas: readonly IdeaConTema[]): Map<string, TemaPrincipal> {
  const porMaterial = new Map<string, Map<string, { nombre: string; ideas: number }>>()
  for (const idea of ideas) {
    // A blank name (a topic row the reader could not join) would show as an empty main topic: it is left out.
    if (idea.excluida || idea.temaId === null || idea.nombre.trim() === "") continue
    const temas = porMaterial.get(idea.materialId) ?? new Map<string, { nombre: string; ideas: number }>()
    const tema = temas.get(idea.temaId) ?? { nombre: idea.nombre, ideas: 0 }
    tema.ideas += 1
    temas.set(idea.temaId, tema)
    porMaterial.set(idea.materialId, temas)
  }
  const principales = new Map<string, TemaPrincipal>()
  for (const [materialId, temas] of porMaterial) {
    const [primero] = [...temas.values()].sort((a, b) => b.ideas - a.ideas || a.nombre.localeCompare(b.nombre, "es"))
    if (primero) principales.set(materialId, { nombre: primero.nombre, otros: temas.size - 1 })
  }
  return principales
}

/** What the list shows ("Carga mental +2") and what a screen reader says instead ("Carga mental y 2 temas más"). */
export function textoDeTema(tema: TemaPrincipal | null): { visible: string; leido: string } {
  if (tema === null) return { visible: "Sin tema todavía", leido: "Sin tema todavía" }
  if (tema.otros === 0) return { visible: tema.nombre, leido: tema.nombre }
  return {
    visible: `${tema.nombre} +${tema.otros}`,
    leido: `${tema.nombre} y ${tema.otros} ${tema.otros === 1 ? "tema" : "temas"} más`,
  }
}
