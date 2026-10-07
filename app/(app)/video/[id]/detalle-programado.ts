import { type Destino, nombreDeDestinos, type PublicacionConEnlace } from "@/lib/dominio/destinos"

const LINKEDIN_SOLO = "LinkedIn sale solo a la hora aprobada."

/** The line under "Programado para...": what goes out by itself at the approved time and what she uploads. */
export function detalleDeProgramado(
  destinos: readonly Destino[],
  conexiones: { instagramConectado: boolean; linkedinConectado: boolean },
): string {
  const conInstagram = destinos.includes("instagram")
  const conLinkedin = destinos.includes("linkedin")
  const linkedinSolo = conLinkedin && conexiones.linkedinConectado
  if (conInstagram && !conexiones.instagramConectado) {
    if (linkedinSolo) {
      return `Instagram todavía no está conectado, así que ese reel no sale solo: a esa hora te aviso y lo subes tú. ${LINKEDIN_SOLO}`
    }
    const base = "Instagram todavía no está conectado, así que este reel no sale solo."
    return conLinkedin
      ? `${base} LinkedIn tampoco: a esa hora te aviso y los subes tú.`
      : `${base} A esa hora te aviso y lo subes tú.`
  }
  if (conInstagram) {
    const base = "Sale con la etiqueta de IA. Puedes cambiar la fecha mientras no se publique."
    if (!conLinkedin) return base
    return linkedinSolo ? `${base} ${LINKEDIN_SOLO}` : `${base} LinkedIn lo subes tú a mano.`
  }
  return linkedinSolo ? LINKEDIN_SOLO : "LinkedIn se sube a mano: a esa hora te aviso y lo subes tú."
}

/** The line of the closing moment when LinkedIn may have gone out by itself, and the link to that post. */
export function detalleDePublicado(filas: readonly PublicacionConEnlace[]): {
  detalle: string
  enlaces: { etiqueta: string; href: string }[]
} {
  const instagramSolo = filas.some((f) => f.destino === "instagram" && f.estado === "publicado")
  const linkedin = filas.find((f) => f.destino === "linkedin" && f.estado === "publicado")
  const aMano = filas.filter((f) => f.estado === "subido_a_mano").map((f) => f.destino)
  const enlaces = linkedin?.enlace ? [{ etiqueta: "Ver en LinkedIn", href: linkedin.enlace }] : []
  // A piece published before destinations existed has no rows: it was an Instagram reel.
  if (instagramSolo || filas.length === 0) {
    const base = "La etiqueta de IA quedó puesta en Instagram."
    return { detalle: linkedin ? `${base} También salió en LinkedIn.` : base, enlaces }
  }
  if (linkedin && aMano.length > 0) {
    return { detalle: `Lo subiste tú a ${nombreDeDestinos(aMano)}. LinkedIn salió solo.`, enlaces }
  }
  return { detalle: linkedin ? "Salió en LinkedIn." : "", enlaces }
}
