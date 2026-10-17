import { readFileSync } from "node:fs"
import { join } from "node:path"
import { claveDeToma } from "@/lib/dominio/voz"
import { huellaDelGuion } from "@/lib/produccion/voz"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import { pool } from "../integration/db"
import { ajustarPieza, sembrarIdea, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { GUION_VALIDO, limpiarDisparos, TEXTO_VALIDO } from "./ayudas"

const IDEAS = [
  {
    pilar: "etica-regulacion",
    gancho: "Las apps de bienestar emocional reciben datos de salud y casi nadie las regula.",
  },
  { pilar: "ia-salud-mental", gancho: "Una de cada cuatro personas ya usa IA para su salud mental." },
  { pilar: "caso-coni", gancho: "Uso un avatar de IA para divulgar. Esto es lo que decidí no delegarle." },
  { pilar: "acceso-salud-publica", gancho: "Un contacto de confianza nombrado de antemano puede salvar una vida." },
  { pilar: "practica-clinica", gancho: "La IA en terapia debería aprender como los autos autónomos." },
]
const ELEVENLABS = leerConfigProduccion(
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8")),
).elevenlabs

async function conIdea(destino: Parameters<typeof sembrarPieza>[0], pilar: string, titulo: string) {
  // The idea of a piece in flight is used: Inicio does not offer it again, as in the design.
  const idea = await sembrarIdea({ pilar, gancho: titulo, estado: "usada" })
  return sembrarPieza(destino, {
    titulo,
    idea_id: idea,
    guion: GUION_VALIDO,
    texto: TEXTO_VALIDO,
    video_id: "videos/e2e.webm",
  })
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
  const guion = await conIdea("guion_por_aprobar", "practica-clinica", "El deseo no se apaga, se esconde")
  // The writer delivers the script with her voice, and so without the note of a voice that failed: gate 1 shows its
  // player.
  await ajustarPieza(guion, {
    audio_id: claveDeToma(guion, huellaDelGuion(GUION_VALIDO, ELEVENLABS), 0),
    explicacion: null,
  })
  const video = await conIdea("video_por_aprobar", "etica-regulacion", "Ser tu propia diosa")
  await conIdea("en_render", "acceso-salud-publica", "Puedes decir que no")
  await conIdea("programado", "ia-salud-mental", "Si van a discutir, siéntense del mismo lado")
  for (let i = 0; i < 3; i++) await pool.query("insert into public.consultas default values")
  // Seeding a piece through the real flow raises its notices, in an order that can change from run to run: the scene
  // shows none, so every run draws the same Inicio.
  await pool.query("delete from public.avisos")
  return { guion, video }
}
