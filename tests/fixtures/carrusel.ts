import type { EscritoDeCarrusel, Lamina } from "@/lib/dominio/carrusel"

export const FUENTE_DEL_CARRUSEL = "Fuente: Stanford Medicine · AI for Mental Health Symposium (2026)"

/** What the writer answers (the post body without the source line and the signature). */
export const ESCRITO_DE_PRUEBA: EscritoDeCarrusel = {
  portada: { texto: "Lo que un chatbot no ve de ti" },
  ideas: [
    { texto: "Un chatbot te responde a cualquier hora. Eso ayuda, pero no te conoce.", destacado: null },
    { texto: "No nota el silencio largo antes de una respuesta difícil.", destacado: "silencio" },
    { texto: "No ve cómo cambia tu voz cuando hablas de tu familia.", destacado: "voz" },
    { texto: "Puede ayudarte a ordenar ideas o a ensayar una conversación difícil.", destacado: "ordenar" },
  ],
  cierre: { pregunta: "¿En qué momento te sirvió escribirle a una app, y en cuál sentiste que faltaba alguien?" },
  textoPost: [
    "Un chatbot puede acompañarte a las tres de la mañana, cuando no hay nadie más despierto.",
    "Y eso tiene valor. Ordenar por escrito lo que sientes, ensayar una conversación difícil o encontrar palabras para algo que todavía no sabes nombrar puede ayudarte.",
    "Pero hay cosas que una pantalla no registra. El silencio antes de una respuesta. El cambio en la voz cuando aparece un tema familiar. La distancia entre decir que estás bien y estarlo.",
    "En un proceso terapéutico, eso es parte del trabajo. Lo que sostiene el cambio es el vínculo con una persona que te conoce y te acompaña en el tiempo.",
    "Si usas una app para sentirte mejor, úsala como apoyo y no como reemplazo.",
    "¿En qué momento te ha servido escribirle a una app?",
  ].join("\n\n"),
}

/** The slides as stored for it: the app's source line on the closing slide. */
export const LAMINAS_DE_PRUEBA: Lamina[] = [
  { tipo: "portada", texto: "Lo que un chatbot no ve de ti" },
  { tipo: "idea", texto: "Un chatbot te responde a cualquier hora. Eso ayuda, pero no te conoce." },
  { tipo: "idea", texto: "No nota el silencio largo antes de una respuesta difícil.", destacado: "silencio" },
  { tipo: "idea", texto: "No ve cómo cambia tu voz cuando hablas de tu familia.", destacado: "voz" },
  { tipo: "idea", texto: "Puede ayudarte a ordenar ideas o a ensayar una conversación difícil.", destacado: "ordenar" },
  {
    tipo: "cierre",
    texto: "¿En qué momento te sirvió escribirle a una app, y en cuál sentiste que faltaba alguien?",
    fuente: FUENTE_DEL_CARRUSEL,
  },
]

/** The post as stored for it (810 characters): the body, the source line, the signature. */
export const TEXTO_POST_DE_PRUEBA = `${ESCRITO_DE_PRUEBA.textoPost}\n\n${FUENTE_DEL_CARRUSEL}\n\nConstanza del Rosario`
