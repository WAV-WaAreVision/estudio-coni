import { CONI, pool } from "./db"

/** A unit vector of 1024 dimensions with the given components (the rest zero). */
export function vec(componentes: Record<number, number>): number[] {
  const v = Array.from({ length: 1024 }, () => 0)
  for (const [i, x] of Object.entries(componentes)) v[Number(i)] = x
  const norma = Math.hypot(...v)
  return v.map((x) => x / norma)
}
export const texto = (v: readonly number[]) => `[${v.join(",")}]`

let autorId = ""
let materialId = ""

/** Calibration 1 vigente again, with no dry run, no saved vectors and no voyage-4 calibration left. */
export async function reiniciarCalibracion(): Promise<void> {
  await pool.query("delete from public.huellas_anteriores")
  await pool.query("delete from public.huellas_candidatas")
  await pool.query("update public.calibraciones_de_parecido set vigente = false where version <> 1")
  await pool.query("update public.calibraciones_de_parecido set vigente = true where version = 1")
  await pool.query("delete from public.calibraciones_de_parecido where version <> 1")
  await pool.query("delete from public.pruebas_de_modelo")
}

/** Back to the seeded state for the model tests: calibration 1, no claims, topics, pauses or model spends. */
export async function reiniciarHuellas(): Promise<void> {
  autorId = ""
  materialId = ""
  await reiniciarCalibracion()
  await pool.query("delete from public.decisiones_de_tema")
  await pool.query("delete from public.afirmaciones")
  await pool.query("delete from public.temas")
  await pool.query("delete from public.materiales where texto_pegado = 'huellas'")
  await pool.query("delete from public.autores where nombre = 'Autor huellas'")
  await pool.query("delete from public.pausas_de_proveedor")
  await pool.query("delete from public.gastos where clave like 'modelo:%'")
}

async function material(): Promise<void> {
  if (materialId) return
  const a = await pool.query<{ id: string }>(
    "insert into public.autores (nombre, tipo) values ('Autor huellas', 'persona') returning id",
  )
  autorId = a.rows[0]?.id ?? ""
  const m = await pool.query<{ id: string }>(
    `insert into public.materiales (tipo, autor_id, rol, texto_pegado, declaracion_sin_pacientes_en, subido_por)
     values ('documento', $1, 'referente', 'huellas', now(), $2) returning id`,
    [autorId, CONI],
  )
  materialId = m.rows[0]?.id ?? ""
}

export async function afirmacion(
  v: readonly number[] | null,
  extra: { tema?: string | null; texto?: string; modelo?: string; excluida?: boolean } = {},
): Promise<string> {
  await material()
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.afirmaciones
       (material_id, autor_id, tramo, ubicacion, texto, cita, tipo, evidencia, tema_id, vector, modelo_vector, excluida)
     values ($1, $2, 0, '{"pagina": 1}', $3, 'cita', 'consejo', 'opinion', $4, $5::extensions.vector, $6, $7)
     returning id`,
    [
      materialId,
      autorId,
      extra.texto ?? "Una idea.",
      extra.tema ?? null,
      v ? texto(v) : null,
      extra.modelo ?? null,
      extra.excluida ?? false,
    ],
  )
  return rows[0]?.id ?? ""
}

export async function tema(nombre: string, v: readonly number[], extra: { fusionado?: string } = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.temas (nombre, descripcion, centroide, fusionado_en)
     values ($1, 'd', $2::extensions.vector, $3) returning id`,
    [nombre, texto(v), extra.fusionado ?? null],
  )
  return rows[0]?.id ?? ""
}

export const UMBRALES_DE_PRUEBA = { tema: 0.7, grupo: 0.71, fusion: 0.72, puente_min: 0.5, puente_max: 0.7 }

export async function prueba(extra: { modelo?: string; creada?: string } = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.pruebas_de_modelo (modelo, umbrales, informe, creada_en)
     values ($1, $2, '{}', coalesce($3::timestamptz, now())) returning id`,
    [extra.modelo ?? "voyage-4", JSON.stringify(UMBRALES_DE_PRUEBA), extra.creada ?? null],
  )
  return rows[0]?.id ?? ""
}

export async function candidata(pruebaId: string, afirmacionId: string, v: readonly number[], modelo = "voyage-4") {
  await pool.query(
    `insert into public.huellas_candidatas (prueba_id, afirmacion_id, modelo, vector)
     values ($1, $2, $3, $4::extensions.vector)`,
    [pruebaId, afirmacionId, modelo, texto(v)],
  )
}
