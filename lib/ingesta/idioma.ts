import type { Parte } from "@/lib/ingesta/partes"

// Distinctive function words per language. Words shared by several of them (de, que, no, a) are left out on purpose.
const PALABRAS_VACIAS: Record<string, readonly string[]> = {
  es: "el la los las una unos unas es son por con para se su sus lo como más pero muy sin sobre también hasta hay donde cuando porque esta este esto eso ese entre cada del al y en que de un".split(
    " ",
  ),
  en: "the and of to is are was were it that this with for you your they their have has be not but what when from or an at by we he she his her its i in on".split(
    " ",
  ),
  pt: "o os as uma um uns não são por com para se seu sua seus suas mais mas muito sem sobre também até há onde quando porque está este isto isso esse entre cada do da dos das ao em você".split(
    " ",
  ),
  fr: "le la les une des est sont pour avec pas son sa ses mais très sans sur aussi jusqu où quand parce cette ce cet entre chaque du au et en que de un vous nous ils elle je tu".split(
    " ",
  ),
  it: "il lo gli le una uno è sono per con non suo sua suoi sue ma molto senza sopra anche fino dove quando perché questa questo quello tra ogni del al e in che di un voi noi loro lei io tu".split(
    " ",
  ),
}

/** Fewer words than this and the ratios say nothing. */
const MINIMO_DE_PALABRAS = 8
/** Share of the words that must be function words of the winning language. */
const MINIMO_DE_COBERTURA = 0.2
/** The winner must beat the runner-up by this factor (Spanish, Portuguese and Italian overlap a lot). */
const VENTAJA_MINIMA = 1.4

function palabrasDe(texto: string): string[] {
  return texto.toLowerCase().match(/\p{L}+/gu) ?? []
}

/** The language when the stopword ratio is clear, null when it is not. */
export function idiomaPorHeuristica(partes: readonly Parte[]): string | null {
  const palabras = palabrasDe(partes.map((p) => p.texto).join(" "))
  if (palabras.length < MINIMO_DE_PALABRAS) return null
  const puntajes = Object.entries(PALABRAS_VACIAS)
    .map(([idioma, lista]) => {
      const conjunto = new Set(lista)
      return { idioma, cobertura: palabras.filter((p) => conjunto.has(p)).length / palabras.length }
    })
    .sort((a, b) => b.cobertura - a.cobertura)
  const [primero, segundo] = puntajes
  if (!primero || primero.cobertura < MINIMO_DE_COBERTURA) return null
  if (segundo && primero.cobertura < segundo.cobertura * VENTAJA_MINIMA) return null
  return primero.idioma
}
