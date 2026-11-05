import { pool } from "./db"

/** `pilar_pesos` as 20261104000100_pilares_por_red.sql seeds it. */
const PESOS_DE_LA_SEMILLA = [
  ["diagnostico-doble", "2026-11-04", 30],
  ["diagnostico-doble", "2027-01-01", 25],
  ["diagnostico-doble", "2027-07-01", 25],
  ["bienestar-e-impacto", "2026-11-04", 25],
  ["bienestar-e-impacto", "2027-01-01", 25],
  ["bienestar-e-impacto", "2027-07-01", 20],
  ["psicologia-en-la-mesa", "2026-11-04", 30],
  ["psicologia-en-la-mesa", "2027-01-01", 35],
  ["psicologia-en-la-mesa", "2027-07-01", 30],
  ["mujeres-lideres", "2026-11-04", 15],
  ["mujeres-lideres", "2027-01-01", 15],
  ["mujeres-lideres", "2027-07-01", 25],
  ["game-over-impostora", "2026-11-04", 35],
  ["mi-nueva-partida", "2026-11-04", 40],
  ["inteligencia-emocional", "2026-11-04", 25],
].map(([slug, desde, peso]) => ({ slug, desde, peso }))

/**
 * Approvals through real clients commit (decision 19): every draft goes, every pillar a draft became goes with its
 * weights and topic rows, and `pilar_pesos` is back to the seed, so the counts other suites expect still hold.
 */
export async function limpiarBorradores(): Promise<void> {
  const { rows } = await pool.query<{ pilar_id: string }>(
    "select pilar_id from public.borradores_de_pilar where pilar_id is not null",
  )
  const aprobados = rows.map((fila) => fila.pilar_id)
  await pool.query("delete from public.tema_pilares where pilar_id = any($1::uuid[])", [aprobados])
  await pool.query("delete from public.pilar_pesos where pilar_id = any($1::uuid[])", [aprobados])
  await pool.query("delete from public.borradores_de_pilar")
  await pool.query("delete from public.borradores_de_red")
  await pool.query("delete from public.categorias where id = any($1::uuid[])", [aprobados])
  const semilla = JSON.stringify(PESOS_DE_LA_SEMILLA)
  await pool.query(
    `delete from public.pilar_pesos p using public.categorias c
     where c.id = p.pilar_id
       and not exists (
         select 1 from jsonb_to_recordset($1::jsonb) as s (slug text, desde date, peso numeric)
         where s.slug = c.slug and s.desde = p.desde
       )`,
    [semilla],
  )
  await pool.query(
    `insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
     select c.id, c.red, c.es_capa, s.desde, s.peso
     from jsonb_to_recordset($1::jsonb) as s (slug text, desde date, peso numeric)
     join public.categorias c on c.slug = s.slug
     on conflict (pilar_id, desde) do update set peso = excluded.peso`,
    [semilla],
  )
}
