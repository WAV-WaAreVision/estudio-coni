/** Change 6a: the closed lists, as read from the vigente versions, and how a raw answer maps onto them. */
export const LISTAS = ["tipo", "evidencia", "publico", "dolor", "emocion", "gancho"] as const
export type Lista = (typeof LISTAS)[number]
export const REDES = ["linkedin", "instagram"] as const
export type Red = (typeof REDES)[number]
export type RedDeLista = Red | "todas"
export const MARCAS = ["problema", "solucion", "emocion", "dato", "caso", "publico"] as const
export type Marca = (typeof MARCAS)[number]
export const CERTEZAS = ["alta", "media", "baja"] as const
export type Certeza = (typeof CERTEZAS)[number]

export interface ValorDeLista {
  valor: string
  etiqueta: string
  descripcion?: string
  grupo?: "problema" | "puente" | "solucion" | "respaldo"
  activacion?: "alta" | "media" | "baja"
}

export interface ListaVigente {
  versionId: number
  valores: ValorDeLista[]
}

/** Public and pain lists differ per network; the others are one list for both. */
export interface Vocabulario {
  tipo: { todas: ListaVigente }
  evidencia: { todas: ListaVigente }
  publico: Record<Red, ListaVigente>
  dolor: Record<Red, ListaVigente>
  emocion: { todas: ListaVigente }
  gancho: { todas: ListaVigente }
}

export interface FilaDeVocabulario {
  id: number
  lista: string
  red: string
  valores: (ValorDeLista & { retirado?: boolean })[]
}

export function vocabularioDeFilas(filas: readonly FilaDeVocabulario[]): Vocabulario {
  const buscar = (lista: Lista, red: RedDeLista): ListaVigente => {
    const f = filas.find((x) => x.lista === lista && x.red === red)
    if (!f) throw new Error(`No hay una lista vigente de ${lista} para ${red}`)
    return {
      versionId: f.id,
      valores: f.valores.filter((v) => !v.retirado).map(({ retirado, ...valor }) => valor),
    }
  }
  return {
    tipo: { todas: buscar("tipo", "todas") },
    evidencia: { todas: buscar("evidencia", "todas") },
    publico: { linkedin: buscar("publico", "linkedin"), instagram: buscar("publico", "instagram") },
    dolor: { linkedin: buscar("dolor", "linkedin"), instagram: buscar("dolor", "instagram") },
    emocion: { todas: buscar("emocion", "todas") },
    gancho: { todas: buscar("gancho", "todas") },
  }
}

export function listaDeMarca(marca: Marca): Lista | null {
  if (marca === "problema" || marca === "solucion") return "dolor"
  if (marca === "emocion" || marca === "publico") return marca
  return null
}

/** A list shared by both networks ignores `red`; a per-network list reads `todas` as linkedin. */
export function listaVigente(vocab: Vocabulario, lista: Lista, red: RedDeLista): ListaVigente {
  const de = vocab[lista]
  if ("todas" in de) return de.todas
  return red === "instagram" ? de.instagram : de.linkedin
}

const limpio = (texto: string) =>
  texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s/-]+/g, "_")

const buscarValor = (vigente: ListaVigente, crudo: string): ValorDeLista | undefined =>
  vigente.valores.find((v) => v.valor === limpio(crudo) || limpio(v.etiqueta) === limpio(crudo))

export interface MarcaCruda {
  marca: Marca
  red: RedDeLista
  valor: string
  frase: string | null
  certeza: Certeza
  porQue: string | null
}

export interface MarcaNormalizada extends MarcaCruda {
  versionId: number | null
}

export function normalizarMarca(vocab: Vocabulario, cruda: MarcaCruda): MarcaNormalizada {
  const lista = listaDeMarca(cruda.marca)
  if (lista === null) return { ...cruda, red: "todas", versionId: null }
  const vigente = listaVigente(vocab, lista, cruda.red)
  const conocido = buscarValor(vigente, cruda.valor)
  if (conocido) return { ...cruda, valor: conocido.valor, versionId: vigente.versionId }
  return {
    ...cruda,
    valor: lista === "emocion" ? "otra" : "otro",
    frase: cruda.frase ?? cruda.valor,
    porQue: cruda.porQue?.trim() ? cruda.porQue : `fuera de la lista: ${cruda.valor}`,
    versionId: vigente.versionId,
  }
}

export function normalizarGancho(vocab: Vocabulario, tipo: string): { tipo: string; versionId: number } {
  const vigente = vocab.gancho.todas
  return { tipo: buscarValor(vigente, tipo)?.valor ?? "ninguno", versionId: vigente.versionId }
}
