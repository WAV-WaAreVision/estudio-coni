import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { ETIQUETAS_DE_TONO, MAXIMO_DE_ETIQUETAS, MINIMO_DE_ETIQUETAS, sinEtiquetas } from "@/lib/dominio/etiquetas"
import type { Fuente } from "@/lib/dominio/fuente"
import {
  type Alerta,
  AVISO_AVATAR,
  AVISO_AVATAR_LINKEDIN,
  CIERRE,
  type Hallazgo,
  LINEAS_AYUDA,
} from "@/lib/dominio/revision"
import { sinCierre } from "@/lib/ingesta/texto-seguro"
import { pedirJson, type UsoClaude } from "./nucleo"
import {
  describirHallazgo,
  type IdeaParaGuion,
  lineaDeAngulo,
  listaDeAlertas,
  type RespaldoParaGuion,
  SalidaRevision,
  SIN_CONSULTA,
  seccionDeFuentes,
  seccionDeRespaldo,
} from "./secciones"

const SalidaGuion = z.object({ guion: z.string(), texto: z.string(), textoLinkedin: z.string() })

const MARCAS_DE_TONO = ETIQUETAS_DE_TONO.map((etiqueta) => `[${etiqueta}]`).join(", ")

function pedidoDeGuion(
  idea: IdeaParaGuion,
  respaldo: RespaldoParaGuion | null,
  fuentes: readonly Fuente[],
  requiereLineasAyuda: boolean,
  correcciones: readonly Hallazgo[],
): string {
  const partes = [
    "Escribe el guion, el texto de publicación de Instagram y el texto para LinkedIn de un reel de Coni del Rosario a partir de esta idea. Sigue la línea editorial de tus instrucciones.",
    `IDEA
Pilar: ${idea.pilar.nombre}${idea.pilar.descripcion ? ` (${idea.pilar.descripcion})` : ""}${lineaDeAngulo(idea.angulo)}
Gancho: ${idea.gancho}
Tema: ${idea.tema}
Formato: ${idea.formato}`,
    `ALERTAS DE LA IDEA (respétalas tal cual)
${listaDeAlertas(idea.alertas)}`,
    ...(respaldo === null ? [] : [seccionDeRespaldo(respaldo)]),
    ...(fuentes.length === 0 ? [] : [seccionDeFuentes(fuentes)]),
    `REGLAS DEL GUION
- Entre 75 y 150 palabras. Las marcas de tono no cuentan como palabras.
- La última línea es exactamente: ${CIERRE}
- Escribe todos los números con palabras.
- Marca el tono de la voz con entre ${MINIMO_DE_ETIQUETAS} y ${MAXIMO_DE_ETIQUETAS} marcas entre corchetes, cada una justo antes de la frase donde el tono cambia. Usa solo estas, escritas tal cual: ${MARCAS_DE_TONO}. No marques risas. La voz no lee las marcas y no salen en los subtítulos. La línea del cierre va sin marca.
- Para una pausa corta usa puntos suspensivos; para una pausa larga, la marca [pause]. El énfasis va solo con la puntuación.
- Sin emojis, hashtags ni símbolos. Usa solo letras, la puntuación del español, saltos de línea y los corchetes de las marcas; nada de # @ * _ ~ ^ = < > { } \\ | / % $ & +.
- Sin diagnósticos, sin consejos para casos particulares, sin anécdotas de pacientes y sin cifras ni estudios que la idea no traiga ya verificados.
- ${SIN_CONSULTA}`,
    `REGLAS DEL TEXTO DE PUBLICACIÓN
- Es el texto que acompaña el video en Instagram. Aquí sí pueden ir emojis y hashtags.
- Sin marcas de tono: van solo en el guion.
- ${SIN_CONSULTA}
- Termina exactamente con: ${AVISO_AVATAR}${
      requiereLineasAyuda ? `\n- Antes de ese aviso incluye, tal cual, esta línea: ${LINEAS_AYUDA}` : ""
    }`,
    `REGLAS DEL TEXTO PARA LINKEDIN
- Acompaña el mismo video en LinkedIn. Lo leen colegas, colegios y empresas: el mismo mensaje del reel, pero reescrito para LinkedIn y no copiado del texto de Instagram. Trátalo de tú normativo («tú puedes», «si sientes»), en español de Chile, sin tecnicismos, sin voseo («podís», «sabís») y sin usted.
- El gancho abre el texto: una o dos líneas, de máximo 140 caracteres, con la idea central. Elige una escena reconocible, un dato que la idea ya traiga verificado, una pregunta concreta o una postura clara. Sin emoji, hashtag ni mención.
- Largo: entre 1.300 y 2.500 caracteres, y nunca más de 3.000.
- Muchos párrafos cortos, de una a tres líneas, separados por una línea en blanco. Ninguna frase de más de veinte palabras. A lo más una lista, de tres a cinco ítems.
- Cierra el cuerpo con exactamente una pregunta abierta y específica, que pida experiencia o criterio.
- Sin enlaces en el texto.
- ${SIN_CONSULTA}
- Hashtags: de cero a tres, en la última línea y con letras normales.
- Emojis: de cero a tres, solo para ordenar (✅ ▸ 📌), nunca como adorno. Ninguno si el tema es delicado. Las listas van con números normales («1.») o en prosa, nunca con emojis numerados.
- Prohibido: la fórmula de contraste «no es X, es Y» y sus variantes («X no es el problema, el problema es Y», «no se trata de X, sino de Y», «no se apaga: se esconde»); pedir reacciones («comenta SÍ», «dale like si», «etiqueta a», «reacciona con», «vota con una reacción»); letras Unicode en negrita o cursiva; rayas largas.
- Sin marcas de tono. Sin diagnósticos, sin consejos para casos particulares, sin promesas de resultados y sin referencias a pacientes, tampoco anonimizadas. ${
      fuentes.length === 0
        ? "No nombres autores, cuentas, libros ni estudios, y no copies frases de las fuentes."
        : "No copies frases de las fuentes."
    }${requiereLineasAyuda ? `\n- Después de la pregunta incluye, tal cual, esta línea: ${LINEAS_AYUDA}` : ""}
- El último párrafo antes de los hashtags (o el último del texto, si no llevas hashtags) es exactamente este aviso, sin cambiar una palabra: ${AVISO_AVATAR_LINKEDIN}`,
  ]
  if (correcciones.length > 0) {
    partes.push(`CORRECCIONES
Tu versión anterior no pasó la revisión. Escribe de nuevo el guion y los dos textos completos, arreglando esto:
${correcciones.map(describirHallazgo).join("\n")}`)
  }
  return partes.join("\n\n")
}

// Claude judges what is said; the tone marks are not speech and would only be quoted back as findings.
function pedidoDeRevision(entrada: {
  guion: string
  texto: string
  textoLinkedin: string | null
  alertas: readonly Alerta[]
}): string {
  const conLinkedin = entrada.textoLinkedin !== null
  return `Revisa el guion y el texto de publicación de un reel de Coni del Rosario${conLinkedin ? ", y también su texto para LinkedIn" : ""}. Marca solo lo que de verdad esté ahí; si no hay nada, devuelve la lista vacía.

REGLAS (usa exactamente estos nombres)
- diagnostico: diagnostica o etiqueta a alguien, por ejemplo «tienes ansiedad» o «tu pareja es narcisista».
- caso_particular: da un consejo para un caso particular en vez de educación general.
- lenguaje_explicito: usa lenguaje sexual explícito en vez del lenguaje clínico y cotidiano de la línea editorial.
- cifra_sin_verificar: trae cifras, porcentajes, estudios o afirmaciones científicas que la idea no trae verificados. Si la idea tiene una alerta «verificar dato», sé estricta.
- tema_de_riesgo: el tema toca violencia, abuso, suicidio o autolesiones, aunque la idea no lo marque.

Cada hallazgo lleva la regla, la frase (una cita textual corta del guion, del texto${conLinkedin ? " o del texto para LinkedIn" : ""}) y un mensaje de una oración para Coni, en español de Chile, sin rayas largas.

ALERTAS DE LA IDEA
${listaDeAlertas(entrada.alertas)}

<guion>
${sinCierre(sinEtiquetas(entrada.guion))}
</guion>

<texto_de_publicacion>
${sinCierre(entrada.texto)}
</texto_de_publicacion>${
    entrada.textoLinkedin === null
      ? ""
      : `

<texto_linkedin>
${sinCierre(entrada.textoLinkedin)}
</texto_linkedin>`
  }`
}

/** Writes the script and the caption of a reel. Only configuration errors are final; the rest is retried by the caller. */
export async function escribirGuion(entrada: {
  cliente: Anthropic
  guia: string
  idea: IdeaParaGuion
  respaldo: RespaldoParaGuion | null
  /** The sources the LinkedIn text may cite; empty when there is none, and then it names nobody. */
  fuentes: readonly Fuente[]
  requiereLineasAyuda: boolean
  correcciones?: readonly Hallazgo[]
}): Promise<{ guion: string; texto: string; textoLinkedin: string; uso: UsoClaude }> {
  const { cliente, guia, idea, respaldo, fuentes, requiereLineasAyuda, correcciones = [] } = entrada
  const { salida, uso } = await pedirJson(cliente, "escribirGuion", {
    guia,
    usuario: pedidoDeGuion(idea, respaldo, fuentes, requiereLineasAyuda, correcciones),
    esquema: SalidaGuion,
  })
  return { guion: salida.guion, texto: salida.texto, textoLinkedin: salida.textoLinkedin, uso }
}

/** The part of the review only Claude can do. Every finding warns; none blocks. */
export async function revisarConClaude(entrada: {
  cliente: Anthropic
  guia: string
  guion: string
  texto: string
  /** The LinkedIn text of the piece; null when it has none yet. */
  textoLinkedin: string | null
  alertas: readonly Alerta[]
}): Promise<{ hallazgos: Hallazgo[]; uso: UsoClaude }> {
  const { cliente, guia, guion, texto, textoLinkedin, alertas } = entrada
  const { salida, uso } = await pedirJson(cliente, "revisarConClaude", {
    guia,
    usuario: pedidoDeRevision({ guion, texto, textoLinkedin, alertas }),
    esquema: SalidaRevision,
  })
  const hallazgos = salida.hallazgos.map(
    (h): Hallazgo => ({ regla: h.regla, tipo: "advierte", mensaje: h.mensaje, frase: h.frase }),
  )
  return { hallazgos, uso }
}
