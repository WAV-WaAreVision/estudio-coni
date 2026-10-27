import { readFileSync } from "node:fs"
import { join } from "node:path"
import { leerVersionVigente } from "@/lib/datos/carrusel"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { claveDeToma } from "@/lib/dominio/voz"
import { armarCarrusel } from "@/lib/produccion/armar-carrusel"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"
import { pool } from "../integration/db"
import { clienteDeServicio } from "../integration/servicio"
import {
  ajustarPieza,
  leerFila,
  sembrarCarrusel,
  sembrarCorrida,
  sembrarIdea,
  sembrarIdeaDelMotor,
  sembrarPieza,
  vaciarPiezasEIdeas,
} from "../integration/siembra"
import { limpiarDisparos } from "./ayudas"

/** A source as the backing of a piece stores it: the line Coni reads is "Fuente: autor · título (año)". */
interface FuenteDeEscena {
  autor: string
  titulo: string
  anio: number
}

export const FUENTES = {
  stanford: { autor: "Stanford Medicine", titulo: "AI for Mental Health Symposium", anio: 2026 },
  mozilla: { autor: "Mozilla Foundation", titulo: "Privacy Not Included: Mental Health Apps", anio: 2023 },
  oms: { autor: "Organización Mundial de la Salud", titulo: "Informe mundial sobre salud mental", anio: 2022 },
} as const satisfies Record<string, FuenteDeEscena>

export function lineaDeFuenteDe({ autor, titulo, anio }: FuenteDeEscena): string {
  return `Fuente: ${autor} · ${titulo} (${anio})`
}

const AVISO = "Video hecho con mi avatar digital."

/** The caption as the writer leaves it: the source line right before the avatar notice, which stays last. */
function leyenda(cuerpo: string, fuente: FuenteDeEscena | null): string {
  return [cuerpo, ...(fuente ? [lineaDeFuenteDe(fuente)] : []), AVISO].join("\n\n")
}

export interface PiezaDeEscena {
  pilar: string
  titulo: string
  guion: string
  texto: string
  /** null: the backing is Coni's own experience ("De Coni"), which the caption does not cite. */
  fuente: FuenteDeEscena | null
}

/**
 * The pieces every scene draws from, each on an active LinkedIn pillar with a script, a caption and a source on its
 * own topic. A title always goes with the same pillar, on every screen.
 */
export const PIEZAS = {
  guion: {
    pilar: "practica-clinica",
    titulo: "Lo que un chatbot no ve",
    guion: [
      "Un chatbot puede responderte a cualquier hora. Pero hay cosas que no ve.",
      "No ve cómo cambia tu voz cuando hablas de tu familia. No nota el silencio largo antes de una respuesta difícil. No se da cuenta cuando dices que estás bien y tu cuerpo dice otra cosa.",
      "La investigación sobre inteligencia artificial y salud mental muestra que estas herramientas pueden ayudar a ordenar ideas o a ensayar una conversación. Lo que sostiene un proceso terapéutico sigue siendo el vínculo con una persona que te conoce.",
      "Si usas una app para sentirte mejor, úsala como apoyo. Y si lo que te pasa pesa más de lo que una pantalla puede contener, busca a una profesional.",
      "Soy Coni del Rosario.",
    ].join("\n\n"),
    texto: leyenda(
      "Un chatbot puede acompañarte un rato. El vínculo que sostiene un proceso terapéutico lo construyen dos personas.",
      FUENTES.stanford,
    ),
    fuente: FUENTES.stanford,
  },
  video: {
    pilar: "etica-regulacion",
    titulo: "Tus datos en una app de bienestar",
    guion: [
      "Una app de bienestar puede saber cómo duermes, qué te angustia y con quién discutes.",
      "Muchas personas le cuentan a una aplicación cosas que todavía no le han dicho a nadie. Y casi nunca se preguntan quién más va a leer eso.",
      "Lo que dices en terapia está protegido por el secreto profesional. Lo que escribes en una app depende de su política de privacidad, y muchas son débiles.",
      "Antes de instalarla, revisa tres cosas. Quién guarda lo que escribes. Si comparte tus datos con otras empresas. Y si puedes borrar tu historial cuando quieras.",
      "Tus datos de salud también merecen cuidado.",
      "Soy Coni del Rosario.",
    ].join("\n\n"),
    texto: leyenda(
      "Una app de bienestar puede saber cómo duermes y qué te angustia. Antes de contarle algo, revisa quién guarda esos datos y si puedes borrarlos.\n\n#saludmental #privacidad",
      FUENTES.mozilla,
    ),
    fuente: FUENTES.mozilla,
  },
  enRender: {
    pilar: "acceso-salud-publica",
    titulo: "Mientras esperas una hora",
    guion: [
      "En muchos lugares de Chile, conseguir una hora de salud mental puede tomar meses.",
      "Mientras esperas, lo que te pasa sigue ahí. Por eso conviene saber qué puedes hacer en ese tiempo.",
      "Pregunta en tu centro de salud si hay atención grupal o talleres. Revisa si tu trabajo o tu universidad tienen un programa de apoyo. Y anota lo que sientes cada semana, para llegar a la primera sesión con más claridad.",
      "Esperar no significa quedarte sola con lo que te pasa. Pedir ayuda ya es un primer paso.",
      "Soy Coni del Rosario.",
    ].join("\n\n"),
    texto: leyenda("Mientras esperas una hora de salud mental, hay cosas que sí puedes hacer.", FUENTES.oms),
    fuente: FUENTES.oms,
  },
  programado: {
    pilar: "caso-coni",
    titulo: "Por qué mi avatar dice que es un avatar",
    guion: [
      "Este video lo dice mi avatar digital. Y quiero que lo sepas desde el principio.",
      "Lo uso para llegar a más personas con información sobre salud mental, sin tener que grabar cada semana. Pero hay cosas que decidí no delegarle.",
      "Cada guion lo reviso yo. Cada video lo veo completo antes de que salga. Y nunca responde mensajes ni comentarios en mi nombre.",
      "Contarte que es un avatar es parte del cuidado. La confianza se construye con transparencia, también cuando hay inteligencia artificial de por medio.",
      "Soy Coni del Rosario.",
    ].join("\n\n"),
    texto: leyenda("Por qué mi avatar dice que es un avatar, y qué decidí no delegarle.", null),
    fuente: null,
  },
  conFalla: {
    pilar: "ia-salud-mental",
    titulo: "Qué hace un chatbot con lo que le cuentas",
    guion: [
      "Cuando le cuentas tus penas a un chatbot, esa conversación queda guardada en algún lugar.",
      "Muchas personas usan estas herramientas para desahogarse de noche, cuando no hay nadie más despierto. Se entiende. Responden rápido, no juzgan y siempre están disponibles.",
      "Pero conviene saber qué pasa después. Algunas empresas usan esas conversaciones para entrenar sus modelos. Otras las guardan por años.",
      "Antes de abrirte, lee qué hace la app con lo que escribes. Y si lo que sientes no da tregua, conversarlo con una profesional también ayuda.",
      "Soy Coni del Rosario.",
    ].join("\n\n"),
    texto: leyenda("Antes de contarle tus penas a un chatbot, revisa qué hace con lo que escribes.", FUENTES.stanford),
    fuente: FUENTES.stanford,
  },
} as const satisfies Record<string, PiezaDeEscena>

/** The frozen backing of a piece: one claim with its source, or Coni's own when the piece cites no one. */
export function respaldoDe({ fuente }: PiezaDeEscena) {
  return {
    teoria: {
      id: "00000000-0000-4000-8000-0000000000aa",
      titulo: "La teoría detrás del guion",
      tesis: "Lo que el guion propone.",
      porQue: "Por qué sirve para esta pieza.",
    },
    afirmaciones: [
      fuente
        ? {
            id: "00000000-0000-4000-8000-0000000000ab",
            texto: "Lo que afirma la fuente.",
            cita: "La cita de la fuente.",
            aporte: "aporta",
            autor: fuente.autor,
            deConi: false,
            esPersona: false,
            fuente: { autor: fuente.autor, titulo: fuente.titulo, anio: fuente.anio },
          }
        : {
            id: "00000000-0000-4000-8000-0000000000ac",
            texto: "Lo que Coni aprendió usando su avatar.",
            cita: "Lo que Coni contó.",
            aporte: "aporta",
            autor: "Coni del Rosario",
            deConi: true,
            esPersona: true,
          },
    ],
  }
}

/** The bank: five distinct hooks, one per active pillar, none repeating a piece or the engine's idea. */
export const IDEAS = [
  {
    pilar: "etica-regulacion",
    gancho: "Las apps de bienestar emocional reciben datos de salud y casi nadie las regula.",
    tema: "Privacidad de las apps de bienestar",
  },
  {
    pilar: "ia-salud-mental",
    gancho: "Un chatbot te responde a las tres de la mañana. ¿Eso es acompañar?",
    tema: "Chatbots y compañía",
  },
  {
    pilar: "caso-coni",
    gancho: "Lo que aprendí en un mes publicando con mi avatar digital.",
    tema: "Un mes con el avatar",
  },
  {
    pilar: "acceso-salud-publica",
    gancho: "La salud mental en el trabajo también es salud pública.",
    tema: "Salud mental en el trabajo",
  },
  {
    pilar: "practica-clinica",
    gancho: "La IA en terapia debería aprender como los autos autónomos.",
    tema: "Seguridad de la IA en terapia",
  },
] as const

/** This week's engine idea, with its backing: the first card of the deck, so it shows its source line. */
export const IDEA_DEL_MOTOR = {
  pilar: "ia-salud-mental",
  gancho: "Una de cada cuatro personas ya usa IA para su salud mental.",
  tema: "Uso de chatbots para la salud mental",
  fuente: FUENTES.stanford,
} as const

const ELEVENLABS = leerConfigProduccion(
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8")),
).elevenlabs

/** A piece of the set walked to `destino`, with its pillar's idea (used, so Inicio does not offer it again). */
export async function sembrarPiezaDeEscena(
  destino: Parameters<typeof sembrarPieza>[0],
  pieza: PiezaDeEscena,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const idea = await sembrarIdea({ pilar: pieza.pilar, gancho: pieza.titulo, tema: pieza.titulo, estado: "usada" })
  return sembrarPieza(destino, {
    titulo: pieza.titulo,
    idea_id: idea,
    guion: pieza.guion,
    texto: pieza.texto,
    respaldo: respaldoDe(pieza),
    ...extra,
  })
}

/** Her voice of this take for a script of the set, as the voice run names it. */
export function vozDe(id: string, guion: string, intento = 0): string {
  return claveDeToma(id, huellaDelGuion(guion, ELEVENLABS), intento)
}

/**
 * One scene with a piece in every state the screens show, shared by the accessibility and the visual specs so both
 * look at the same data. Returns the ids of the two pieces that have their own screen to approve.
 */
export async function sembrarEscena(): Promise<{ guion: string; video: string }> {
  await vaciarPiezasEIdeas()
  limpiarDisparos()
  await pool.query("delete from public.consultas")
  // Numbered, so the five that Inicio offers do not depend on the random ids that break ties.
  for (const [i, idea] of IDEAS.entries()) await sembrarIdea({ ...idea, numero: i + 1 })
  const semana = "2026-10-12"
  await sembrarCorrida(semana)
  await sembrarIdeaDelMotor({
    gancho: IDEA_DEL_MOTOR.gancho,
    tema: IDEA_DEL_MOTOR.tema,
    semana,
    pilar: IDEA_DEL_MOTOR.pilar,
    teoria: {
      titulo: "El chatbot llena un hueco de acceso",
      tesis: "Quien usa IA para su salud mental suele tener problemas de acceso.",
      nivel: "alto",
      respaldo: [
        {
          autor: IDEA_DEL_MOTOR.fuente.autor,
          tipo: "institucion",
          cita: "Una de cada cuatro personas consultadas ya usó un chatbot para hablar de su salud mental.",
          titulo: IDEA_DEL_MOTOR.fuente.titulo,
          anio: IDEA_DEL_MOTOR.fuente.anio,
          evidencia: "estudio",
        },
      ],
    },
  })
  // The writer delivers the script with her voice, and so without the note of a voice that failed: gate 1 shows its
  // player and, under the script, the source line of its frozen backing.
  const guion = await sembrarPiezaDeEscena("guion_por_aprobar", PIEZAS.guion)
  await ajustarPieza(guion, { audio_id: vozDe(guion, PIEZAS.guion.guion), explicacion: null })
  const video = await sembrarPiezaDeEscena("video_por_aprobar", PIEZAS.video, { video_id: "videos/e2e.webm" })
  await sembrarPiezaDeEscena("en_render", PIEZAS.enRender, { video_id: "videos/e2e.webm" })
  await sembrarPiezaDeEscena("programado", PIEZAS.programado, { video_id: "videos/e2e.webm" })
  for (let i = 0; i < 3; i++) await pool.query("insert into public.consultas default values")
  // Seeding a piece through the real flow raises its notices, in an order that can change from run to run: the scene
  // shows none, so every run draws the same Inicio.
  await pool.query("delete from public.avisos")
  return { guion, video }
}

/** The scene's carousel: its own idea (used) on an active pillar, walked to `destino`. Not part of `sembrarEscena`. */
export const CARRUSEL = { pilar: "ia-salud-mental", titulo: "Lo que un chatbot no ve de ti" } as const

export async function sembrarCarruselDeEscena(
  destino: Parameters<typeof sembrarCarrusel>[0],
  opciones: Parameters<typeof sembrarCarrusel>[1] = {},
): Promise<string> {
  const idea = await sembrarIdea({
    pilar: CARRUSEL.pilar,
    gancho: CARRUSEL.titulo,
    tema: CARRUSEL.titulo,
    estado: "usada",
  })
  return sembrarCarrusel(destino, { ideaId: idea, titulo: CARRUSEL.titulo, ...opciones })
}

const PNG_DE_LAMINA = new Uint8Array(readFileSync(join(__dirname, "fixtures", "avatar-a.png")))

/** What `producir-pieza` leaves for a carousel: version 1 and the piece at gate 1, written as the service. */
export async function escribirCarruselComoLaTarea(id: string): Promise<void> {
  const db = clienteDeServicio()
  const hash = hashTextoDeCarrusel({ laminas: LAMINAS_DE_PRUEBA, textoPost: TEXTO_POST_DE_PRUEBA })
  await pool.query(
    `insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen)
     values ($1, 1, $2::jsonb, $3, $4, 'inicial')`,
    [id, JSON.stringify(LAMINAS_DE_PRUEBA), TEXTO_POST_DE_PRUEBA, hash],
  )
  const { error } = await db
    .from("piezas")
    .update({ estado: "guion_por_aprobar", revision: [], version: (await leerFila(id)).version + 1 })
    .eq("id", id)
  if (error) throw new Error(`No pude dejar el carrusel en la puerta 1: ${error.message}`)
}

/** `armar-carrusel` for real, with Chromium replaced by fixed PNGs at its boundary. */
export async function armarCarruselComoLaTarea(id: string): Promise<void> {
  const resultado = await armarCarrusel(
    {
      db: clienteDeServicio(),
      almacen: almacenEnMemoria(),
      avisos: notificadorEnMemoria(),
      ahora: () => new Date().toISOString(),
      renderizar: async ({ laminas }) => ({
        tipo: "listo",
        pngs: laminas.map(() => PNG_DE_LAMINA),
        pdf: new TextEncoder().encode("%PDF-1.7"),
      }),
      fuente: async () => "data:font/ttf;base64,AAAA",
      claude: async () => {
        throw new Error("El E2E no llama a Claude.")
      },
    },
    id,
  )
  if (resultado.resultado !== "armado") throw new Error(`El carrusel ${id} no quedó armado: ${resultado.resultado}`)
  // The version is read back so a failing write shows here, not as an empty rail.
  if ((await leerVersionVigente(clienteDeServicio(), id))?.estado !== "listo") throw new Error("Versión sin armar")
}
