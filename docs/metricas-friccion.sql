-- Fricción de Coni, por semana (lunes a domingo, hora de Chile). Solo lectura.
-- Fuente: public.eventos (cada cambio con actor y hora) y public.piezas. Metas en
-- docs/superpowers/plans/2026-10-16-impeccable-metodologia.md, sección 1.2. Leer siempre con su muestra (n).
with coni as (
  select e.pieza_id, e.en, e.datos
  from public.eventos e
  where e.actor_rol = 'authenticated' and e.tabla = 'piezas'
),
sesiones as (
  -- A session ends after 10 minutes without a write by Coni.
  select en, sum(nueva) over (order by en) as sesion
  from (
    select en, case when en - lag(en) over (order by en) > interval '10 minutes' then 1 else 0 end as nueva
    from coni
  ) s
),
minutos as (
  select date_trunc('week', min(en) at time zone 'America/Santiago') as semana,
         -- one minute of reading per session on top of the time between writes
         extract(epoch from max(en) - min(en)) / 60 + 1 as minutos
  from sesiones group by sesion
),
estados as (
  select e.pieza_id, e.en, e.datos ->> 'estado' as estado, e.actor_rol
  from public.eventos e
  where e.tabla = 'piezas' and e.datos ? 'estado'
),
firmas as (
  select pieza_id,
         min(en) filter (where estado = 'guion_por_aprobar') as listo,
         min(en) filter (where estado = 'en_render' and actor_rol = 'authenticated') as firma1,
         min(en) filter (where estado = 'video_por_aprobar') as video,
         min(en) filter (where estado = 'programado' and actor_rol = 'authenticated') as firma2,
         count(*) filter (where estado = 'guion_en_proceso') - 1 as pedir_cambios,
         count(*) filter (where estado = 'en_render' and actor_rol = 'authenticated') - 1 as refirmas
  from estados group by pieza_id
)
select to_char(s.semana, 'YYYY-MM-DD') as semana,
       (select round(sum(m.minutos)) from minutos m where m.semana = s.semana) as minutos_coni,
       count(*) as piezas_n,
       count(*) filter (where p.estado in ('publicado', 'publicado_a_mano', 'programado')) as firmadas_n,
       round(percentile_cont(0.5) within group (order by extract(epoch from f.firma1 - f.listo) / 3600)::numeric, 1)
         as horas_a_firma1_mediana,
       round(percentile_cont(0.5) within group (order by extract(epoch from f.firma2 - f.video) / 3600)::numeric, 1)
         as horas_a_firma2_mediana,
       round(100.0 * count(*) filter (where f.pedir_cambios > 0 or f.refirmas > 0) / nullif(count(*), 0))
         as retrabajo_pct,
       round(100.0 * count(*) filter (where p.estado = 'descartado') / nullif(count(*), 0)) as descartadas_pct,
       count(*) filter (where p.explicacion is not null) as con_falla_n
from firmas f
join public.piezas p on p.id = f.pieza_id
cross join lateral (select date_trunc('week', f.listo at time zone 'America/Santiago') as semana) s
where f.listo is not null
group by s.semana
order by s.semana desc;
