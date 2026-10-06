import { AVISO_AVATAR, AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu

/**
 * Where the text of a piece from before LinkedIn starts: its Instagram caption without the hashtags and with the
 * LinkedIn avatar notice in place of the Instagram one. Deterministic and free (no Claude call): Coni reads it, edits it
 * and saves it, and the review runs on what she saves.
 */
export function textoDeLinkedinDesdeInstagram(caption: string): string {
  const lineas = caption
    .split("\n")
    .map((linea) => ({ linea, sinHashtags: linea.replace(HASHTAG, "$1").replace(/ {2,}/g, " ").trimEnd() }))
    // A line that held only hashtags goes with them; a blank line between paragraphs stays.
    .filter(({ linea, sinHashtags }) => sinHashtags !== "" || linea.trim() === "")
    .map(({ sinHashtags }) => sinHashtags)
  return lineas
    .join("\n")
    .replace(AVISO_AVATAR, AVISO_AVATAR_LINKEDIN)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
