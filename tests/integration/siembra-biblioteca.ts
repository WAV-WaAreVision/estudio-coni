import { CONI, pool } from "./db"

/** Any 1024-dimension vector: topics need a centroid, and these tests never search by meaning. */
const CENTROIDE = `[${Array.from({ length: 1024 }, () => "0.1").join(",")}]`

export async function sembrarAutor(nombre: string, credencial: string | null = null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.autores (nombre, credencial, tipo) values ($1, $2, 'persona') returning id",
    [nombre, credencial],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el autor ${nombre}`)
  return id
}

export interface MaterialDePrueba {
  titulo: string
  autorId: string
  estado?: "procesando" | "listo" | "fallido"
  rol?: "voz_propia" | "referente" | "evidencia" | "estrategia"
  tipo?: "documento" | "link" | "audio" | "video" | "imagen" | "post"
  motivo?: string | null
  costo?: number | null
  /** ISO instant; now when not given. */
  creadoEn?: string
}

export async function sembrarMaterial(m: MaterialDePrueba): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.materiales
       (titulo, tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por, estado, motivo_fallo,
        costo_estimado_usd, creado_en)
     values ($1, $2, $3, $4, 'texto de prueba', now(), $5, $6, $7, $8, coalesce($9::timestamptz, now()))
     returning id`,
    [
      m.titulo,
      m.tipo ?? "documento",
      m.autorId,
      m.rol ?? "referente",
      CONI,
      m.estado ?? "listo",
      m.motivo ?? null,
      m.costo ?? null,
      m.creadoEn ?? null,
    ],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el material ${m.titulo}`)
  return id
}

export async function sembrarTema(nombre: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.temas (nombre, centroide) values ($1, $2::extensions.vector) returning id",
    [nombre, CENTROIDE],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`No se creó el tema ${nombre}`)
  return id
}

/** `cantidad` ideas of one material, taken a millisecond apart in the order given ("Idea 1", "Idea 2", ...). */
export async function sembrarIdeas(
  materialId: string,
  autorId: string,
  temaId: string | null,
  cantidad: number,
  extra: { excluida?: boolean; texto?: string; evidencia?: string } = {},
): Promise<void> {
  await pool.query(
    `insert into public.afirmaciones
       (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, excluida, creada_en)
     select $1::uuid, $2::uuid, 0, '{"pagina":1}'::jsonb, $5::text || ' ' || g, 'cita', 'dato', $6::text, $3::uuid,
            $4::boolean, now() + g * interval '1 millisecond'
       from generate_series(1, $7::int) g`,
    [
      materialId,
      autorId,
      temaId,
      extra.excluida ?? false,
      extra.texto ?? "Idea",
      extra.evidencia ?? "estudio",
      cantidad,
    ],
  )
}

/** One idea with a chosen id: `ffffffff-...` sorts after every other, so only a paged read ever reaches it. */
export async function sembrarIdeaConId(id: string, materialId: string, autorId: string, temaId: string): Promise<void> {
  await pool.query(
    `insert into public.afirmaciones (id, material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id)
     values ($1, $2, $3, 0, '{"pagina":1}'::jsonb, 'La última', 'cita', 'dato', 'estudio', $4)`,
    [id, materialId, autorId, temaId],
  )
}

export async function sembrarFicha(materialId: string, ideas: string[]): Promise<void> {
  await pool.query(
    `insert into public.fichas (material_id, resumen, ideas_clave, citas, fuente)
     values ($1, 'Un resumen', $2::jsonb, '[]'::jsonb, '{"autor":null,"anio":null,"enlace":null}'::jsonb)`,
    [materialId, JSON.stringify(ideas)],
  )
}

/** Materials first: their ideas go with them, and only then can their topics and authors go. */
export async function borrarSembrado(materiales: string[], temas: string[], autores: string[]): Promise<void> {
  await pool.query("delete from public.materiales where id = any($1::uuid[])", [materiales])
  await pool.query("delete from public.temas where id = any($1::uuid[])", [temas])
  await pool.query("delete from public.autores where id = any($1::uuid[])", [autores])
}
