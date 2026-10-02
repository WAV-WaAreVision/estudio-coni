import { Falla } from "@/lib/dominio/falla"
import type { Almacen } from "@/lib/proveedores/almacen"
import { bajar, leerLook } from "@/lib/proveedores/heygen-api"

export interface EntradaDeAvatar {
  avatar_id: string
  nombre: string
  imagen: string
}

const TIPO_POR_EXTENSION = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const
type Extension = keyof typeof TIPO_POR_EXTENSION

function empieza(datos: Uint8Array, firma: readonly number[], desde = 0): boolean {
  return firma.every((byte, i) => datos[desde + i] === byte)
}

/** By the first bytes, not by the URL: the preview link has a signature and no reliable extension. */
export function extensionDeImagen(datos: Uint8Array): Extension {
  if (empieza(datos, [0xff, 0xd8, 0xff])) return "jpg"
  if (empieza(datos, [0x89, 0x50, 0x4e, 0x47])) return "png"
  if (empieza(datos, [0x52, 0x49, 0x46, 0x46]) && empieza(datos, [0x57, 0x45, 0x42, 0x50], 8)) return "webp"
  throw new Falla("La vista previa del look no es una imagen jpg, png ni webp.")
}

export function claveDeImagen(lookId: string, extension: Extension): string {
  return `avatares/${lookId}.${extension}`
}

const ADVERTENCIA_DE_ORIGEN =
  "Revisa que este look salga de una foto real de Coni o un gemelo digital: los looks generados con IA redibujan su cara."

/**
 * Reads the look from HeyGen v3, keeps its preview photo in the private bucket and returns the entry for
 * `heygen.avatares`. It never writes to the database: the maintainer applies the entry (see `sqlParaAgregar`).
 */
export async function agregarAvatar(entrada: {
  lookId: string
  nombre: string
  clave: string
  almacen: Almacen
}): Promise<{ entrada: EntradaDeAvatar; advertencia: string | null }> {
  const look = await leerLook({ clave: entrada.clave, lookId: entrada.lookId })
  const imagen = await bajar(look.imagenUrl)
  const extension = extensionDeImagen(imagen)
  const clave = claveDeImagen(look.id, extension)
  await entrada.almacen.subir(clave, imagen, TIPO_POR_EXTENSION[extension])
  return {
    entrada: { avatar_id: look.id, nombre: entrada.nombre.trim() || look.nombre, imagen: clave },
    advertencia: look.tipo === "digital_twin" ? null : ADVERTENCIA_DE_ORIGEN,
  }
}

function literal(texto: string): string {
  return `'${texto.replaceAll("'", "''")}'`
}

// Every other look stays, in order; a repeated avatar_id is replaced, so running the statement twice changes nothing.
const SIN = (lookId: string) =>
  `(select coalesce(jsonb_agg(a order by n), '[]'::jsonb) from jsonb_array_elements(coalesce(produccion #> '{heygen,avatares}', '[]'::jsonb)) with ordinality as t(a, n) where a ->> 'avatar_id' <> ${literal(lookId)})`

/** The statement WAV runs in the Supabase SQL editor of production. This code never runs it there. */
export function sqlParaAgregar(entrada: EntradaDeAvatar): string {
  const json = literal(JSON.stringify(entrada))
  return `update public.ajustes set produccion = jsonb_set(produccion, '{heygen,avatares}', ${SIN(entrada.avatar_id)} || ${json}::jsonb) where id;`
}

export function sqlParaQuitar(lookId: string): string {
  return `update public.ajustes set produccion = jsonb_set(produccion, '{heygen,avatares}', ${SIN(lookId)}) where id;`
}
