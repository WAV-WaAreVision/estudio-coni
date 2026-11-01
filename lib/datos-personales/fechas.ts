// Calendar days travel as `2026-11-01`. Midday UTC stands for the day, so no offset can move it to the next one.
const DIA_MS = 86_400_000

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** A `YYYY-MM-DD` that names a real day; anything else (a 30 February, an instant) throws instead of drifting. */
function aMediodia(dia: string): Date {
  const fecha = new Date(`${dia}T12:00:00Z`)
  if (!DIA.test(dia) || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== dia) {
    throw new Error(`Día ilegible: ${dia}`)
  }
  return fecha
}

/** `dias` calendar days before `dia`. */
export function diaAntes(dia: string, dias: number): string {
  return new Date(aMediodia(dia).getTime() - dias * DIA_MS).toISOString().slice(0, 10)
}

/** The same calendar day a year later; Date.UTC turns a 29 February that does not exist into 1 March. */
export function unAnioDespues(dia: string): string {
  const fecha = aMediodia(dia)
  return new Date(Date.UTC(fecha.getUTCFullYear() + 1, fecha.getUTCMonth(), fecha.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

const formatos = new Map<string, Intl.DateTimeFormat>()

function formato(zona: string, anio: boolean): Intl.DateTimeFormat {
  const clave = `${zona}:${anio}`
  let creado = formatos.get(clave)
  if (!creado) {
    creado = new Intl.DateTimeFormat("es-CL", {
      timeZone: zona,
      day: "numeric",
      month: "long",
      ...(anio ? { year: "numeric" } : {}),
    })
    formatos.set(clave, creado)
  }
  return creado
}

/** "15 de noviembre de 2027" for a calendar day. */
export function diaEnPalabras(dia: string): string {
  return formato("UTC", true).format(aMediodia(dia))
}

/**
 * "2 de noviembre" (or "2 de noviembre de 2026") for an instant, on the calendar of `zona`. A date-only string such as
 * `2026-11-02` is a calendar day, not an instant: it goes to `diaEnPalabras`.
 */
export function instanteEnPalabras(instante: string, zona: string, opciones: { anio: boolean }): string {
  const ms = Date.parse(instante)
  if (Number.isNaN(ms)) throw new Error(`Instante ilegible: ${instante}`)
  return formato(zona, opciones.anio).format(ms)
}
