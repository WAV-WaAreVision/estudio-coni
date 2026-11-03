// Ported from Ingesta's lib/ingesta/youtube.ts (change 29b), plus the podcast hosts of the spec.

const ANFITRIONES_DE_YOUTUBE = ["youtube.com", "youtu.be", "youtube-nocookie.com"]
const ANFITRIONES_DE_PODCAST = new Set(["open.spotify.com", "podcasts.apple.com"])

export const PASOS_DE_YOUTUBE =
  "YouTube no deja leer lo que se dice en el video. Ábrelo, toca «…más» y luego «Mostrar transcripción», cópiala y pégala aquí."

export const AVISO_DE_PODCAST = "Por ahora leo solo la página del episodio; el audio llega más adelante."

function anfitrion(direccion: string): string | null {
  try {
    return new URL(direccion.trim()).hostname.toLowerCase()
  } catch {
    // Not an address yet (she is still typing): no host, and the form reports the address itself.
    return null
  }
}

/** Whether a link points to YouTube (any subdomain); third-party video is never fetched, so its transcript is pasted. */
export function esYoutube(direccion: string): boolean {
  const host = anfitrion(direccion)
  if (host === null) return false
  return ANFITRIONES_DE_YOUTUBE.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))
}

/** An episode page of Spotify or Apple Podcasts: only the page is read until the audio arrives (a later batch). */
export function esPodcast(direccion: string): boolean {
  const host = anfitrion(direccion)
  return host !== null && ANFITRIONES_DE_PODCAST.has(host)
}
