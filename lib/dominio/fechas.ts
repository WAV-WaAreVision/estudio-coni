// Dates in Chile: instants are stored in UTC and shown in `America/Santiago` (design Q4). Everything here is a pure
// function of the instant it is given; nothing reads the clock.

const formateadores = new Map<string, Intl.DateTimeFormat>()

function formateador(clave: string, crear: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  const existente = formateadores.get(clave)
  if (existente) return existente
  const nuevo = crear()
  formateadores.set(clave, nuevo)
  return nuevo
}

interface PartesLocales {
  anio: number
  mes: number
  dia: number
  hora: number
  minuto: number
  segundo: number
}

function partesLocales(ms: number, zona: string): PartesLocales {
  const partes = formateador(
    `numerico:${zona}`,
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: zona,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
  ).formatToParts(ms)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((parte) => parte.type === tipo)?.value)
  return {
    anio: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    minuto: valor("minute"),
    segundo: valor("second"),
  }
}

/** How far the zone's wall clock is from UTC at that instant, in ms (Santiago: -3 h in summer, -4 h in winter). */
function desfaseDeZona(ms: number, zona: string): number {
  const p = partesLocales(ms, zona)
  return Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - Math.floor(ms / 1000) * 1000
}

export interface FechaLocal {
  anio: number
  mes: number
  dia: number
  hora: number
  minuto: number
}

/** The UTC instant at which a wall clock in `zona` reads `fecha`. */
export function instanteLocal(fecha: FechaLocal, zona: string): number {
  const supuesto = Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia, fecha.hora, fecha.minuto)
  const primero = supuesto - desfaseDeZona(supuesto, zona)
  const segundo = supuesto - desfaseDeZona(primero, zona)
  // Across a change of daylight saving time the first guess can sit on the wrong side of it.
  return segundo
}

export interface Horario {
  /** ISO weekdays, Monday = 1 ... Sunday = 7 (`ajustes.dias_publicacion`: 2, 4, 6 is Tuesday, Thursday, Saturday). */
  dias: readonly number[]
  /** `19:00` or `19:00:00`, as the `time` column gives it. */
  hora: string
  zona: string
}

function leerHora(hora: string): { hora: number; minuto: number } {
  const partes = /^(\d{1,2}):(\d{2})/.exec(hora)
  if (!partes) throw new Error(`Hora de publicación ilegible: ${hora}`)
  return { hora: Number(partes[1]), minuto: Number(partes[2]) }
}

const DIAS_A_REVISAR = 400

/**
 * The next free publishing slots after `ahora + antelacionMs`, as UTC ISO strings. A slot is free unless a piece is
 * already scheduled at exactly that instant.
 */
export function proponerFechas(entrada: {
  ahora: number
  horario: Horario
  ocupadas: readonly string[]
  cuantas: number
  antelacionMs?: number
}): string[] {
  const { ahora, horario, ocupadas, cuantas, antelacionMs = 0 } = entrada
  if (horario.dias.length === 0 || cuantas <= 0) return []
  const reloj = leerHora(horario.hora)
  const tomadas = new Set(ocupadas.map((instante) => Date.parse(instante)))
  const hoy = partesLocales(ahora, horario.zona)
  const propuestas: string[] = []
  for (let desplazamiento = 0; desplazamiento < DIAS_A_REVISAR && propuestas.length < cuantas; desplazamiento++) {
    const dia = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + desplazamiento))
    const diaIso = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay()
    if (!horario.dias.includes(diaIso)) continue
    const instante = instanteLocal(
      { anio: dia.getUTCFullYear(), mes: dia.getUTCMonth() + 1, dia: dia.getUTCDate(), ...reloj },
      horario.zona,
    )
    if (instante < ahora + antelacionMs || tomadas.has(instante)) continue
    propuestas.push(new Date(instante).toISOString())
  }
  return propuestas
}

function nombresDeFecha(ms: number, zona: string) {
  const partes = formateador(
    `texto:${zona}`,
    () =>
      new Intl.DateTimeFormat("es-CL", {
        timeZone: zona,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
  ).formatToParts(ms)
  const texto = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? ""
  return {
    diaDeLaSemana: texto("weekday"),
    dia: texto("day"),
    mes: texto("month"),
    hora: `${texto("hour")}:${texto("minute")}`,
  }
}

/** A picked time has to be this far ahead (spec F2): the publisher runs every 5 minutes. */
export const ANTICIPACION_MINIMA_MS = 15 * 60 * 1000
const PASO_EN_MINUTOS = 5
const UN_DIA_MS = 24 * 60 * 60 * 1000

export const MOTIVOS_DE_HORA = {
  dia: "Elige el día.",
  hora: "Elige la hora.",
  paso: "Elige una hora en bloques de 5 minutos.",
  anticipacion: "Elige una hora con al menos 15 minutos de anticipación.",
  lejos: "Elige una fecha dentro del próximo año.",
  noExiste: "Esa hora no existe en Chile ese día. Elige otra.",
} as const

export type HoraElegida = { ok: true; iso: string } | { ok: false; motivo: string }

function leerDia(dia: string): { anio: number; mes: number; dia: number } | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia)
  if (!partes) return null
  const fecha = { anio: Number(partes[1]), mes: Number(partes[2]), dia: Number(partes[3]) }
  const enUtc = new Date(Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia))
  // Date.UTC rolls 30 February over to March: a day that does not round-trip does not exist.
  if (enUtc.getUTCMonth() !== fecha.mes - 1 || enUtc.getUTCDate() !== fecha.dia) return null
  return fecha
}

function leerHoraElegida(hora: string): { hora: number; minuto: number } | null {
  const partes = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(hora)
  if (!partes) return null
  const valor = { hora: Number(partes[1]), minuto: Number(partes[2]) }
  return valor.hora < 24 && valor.minuto < 60 ? valor : null
}

/** "Otra fecha y hora" at gate 2: a Chile day (`2026-10-28`) and time (`10:15`) as a UTC instant, or why not. */
export function horaElegida(entrada: { dia: string; hora: string; zona: string; ahora: number }): HoraElegida {
  const dia = leerDia(entrada.dia)
  if (!dia) return { ok: false, motivo: MOTIVOS_DE_HORA.dia }
  const reloj = leerHoraElegida(entrada.hora)
  if (!reloj) return { ok: false, motivo: MOTIVOS_DE_HORA.hora }
  if (reloj.minuto % PASO_EN_MINUTOS !== 0) return { ok: false, motivo: MOTIVOS_DE_HORA.paso }
  // A repeated hour (summer time ending) takes its first occurrence; a skipped one (summer time starting) does not
  // read back as what she picked.
  const instante = instanteLocal({ ...dia, ...reloj }, entrada.zona)
  const leido = partesLocales(instante, entrada.zona)
  if (
    leido.anio !== dia.anio ||
    leido.mes !== dia.mes ||
    leido.dia !== dia.dia ||
    leido.hora !== reloj.hora ||
    leido.minuto !== reloj.minuto
  ) {
    return { ok: false, motivo: MOTIVOS_DE_HORA.noExiste }
  }
  if (instante < entrada.ahora + ANTICIPACION_MINIMA_MS) return { ok: false, motivo: MOTIVOS_DE_HORA.anticipacion }
  if (instante > entrada.ahora + DIAS_A_REVISAR * UN_DIA_MS) return { ok: false, motivo: MOTIVOS_DE_HORA.lejos }
  return { ok: true, iso: new Date(instante).toISOString() }
}

/** "miércoles 28 de octubre" for a picked day, or "" while it is not a day. */
export function etiquetaDeDia(dia: string, zona: string): string {
  const fecha = leerDia(dia)
  if (!fecha) return ""
  // Midday is the same calendar day in Chile whatever the offset.
  const f = nombresDeFecha(instanteLocal({ ...fecha, hora: 12, minuto: 0 }, zona), zona)
  return `${f.diaDeLaSemana} ${f.dia} de ${f.mes}`
}

/** The schedule hour as the picker starts it: `19:07:00` becomes `19:05`. */
export function horaEnBloques(hora: string): string {
  const reloj = leerHoraElegida(hora)
  if (!reloj) return ""
  const minuto = reloj.minuto - (reloj.minuto % PASO_EN_MINUTOS)
  return `${String(reloj.hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`
}

/** "jueves 8 de octubre · 19:00" (larga) or "jueves 8 · 19:00" (corta). */
export function etiquetaDeFecha(instante: string, zona: string, estilo: "larga" | "corta"): string {
  const ms = Date.parse(instante)
  if (Number.isNaN(ms)) throw new Error(`Instante ilegible: ${instante}`)
  const f = nombresDeFecha(ms, zona)
  return estilo === "larga"
    ? `${f.diaDeLaSemana} ${f.dia} de ${f.mes} · ${f.hora}`
    : `${f.diaDeLaSemana} ${f.dia} · ${f.hora}`
}

/** The calendar day in `zona` as `2026-10-07`, to tell whether two instants fall on the same day. */
export function diaLocal(ms: number, zona: string): string {
  const p = partesLocales(ms, zona)
  return `${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`
}

/** The Monday to Sunday week of `ms` in words: "5 al 11 de octubre". */
export function semanaDe(ms: number, zona: string): string {
  const hoy = partesLocales(ms, zona)
  const base = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia))
  const diaIso = base.getUTCDay() === 0 ? 7 : base.getUTCDay()
  const lunes = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia - (diaIso - 1)))
  const domingo = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia - (diaIso - 1) + 6))
  const mes = (fecha: Date) => new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "long" }).format(fecha)
  if (lunes.getUTCMonth() === domingo.getUTCMonth()) {
    return `${lunes.getUTCDate()} al ${domingo.getUTCDate()} de ${mes(domingo)}`
  }
  return `${lunes.getUTCDate()} de ${mes(lunes)} al ${domingo.getUTCDate()} de ${mes(domingo)}`
}
