-- LinkedIn Excel importer (issue 15, spec 2026-11-09): Coni uploads the Excel LinkedIn exports and each number lands on
-- its piece with origin `excel`. Nothing is dropped: `metricool` stays for old rows, and `recordatorios_linkedin`
-- stays unused until a later change removes it with Federico's OK.

alter table public.metricas_linkedin drop constraint metricas_linkedin_origen_check;
alter table public.metricas_linkedin
  add constraint metricas_linkedin_origen_check check (origen in ('manual', 'api', 'metricool', 'excel')),
  -- The Excel brings one total per post, without reactions, comments or shares.
  add column interacciones integer check (interacciones >= 0);

alter table public.metricas_linkedin_cuenta drop constraint metricas_linkedin_cuenta_origen_check;
alter table public.metricas_linkedin_cuenta
  add constraint metricas_linkedin_cuenta_origen_check check (origen in ('manual', 'api', 'metricool', 'excel'));

-- As in 20261017000300, with `interacciones` appended: create or replace view can only add columns at the end.
create or replace view public.metricas_linkedin_ultima with (security_invoker = true) as
  select distinct on (pieza_id) pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen,
         interacciones
  from public.metricas_linkedin
  order by pieza_id, medido_en desc;

-- Coni's import (decisions 1 and 4): the matched posts and the week's followers in one transaction. Definer rights so
-- the `excel` rows need no new policy; the check below keeps it hers alone (A6: the maintainer does not import).
-- A row from the API or Metricool is never changed; a manual or excel row is replaced, and a figure the Excel does not
-- bring (null) keeps the stored one. Returns the post rows written.
create function public.importar_excel_linkedin(
  p_medido_en date,
  p_posts jsonb,
  p_semana date,
  p_seguidores integer default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_escritas integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  insert into public.metricas_linkedin as m (pieza_id, medido_en, impresiones, interacciones, origen)
  select (post ->> 'pieza_id')::uuid, p_medido_en, (post ->> 'impresiones')::integer,
         (post ->> 'interacciones')::integer, 'excel'
    from jsonb_array_elements(coalesce(p_posts, '[]'::jsonb)) as post
  on conflict (pieza_id, medido_en) do update
    set impresiones = coalesce(excluded.impresiones, m.impresiones),
        interacciones = coalesce(excluded.interacciones, m.interacciones),
        origen = 'excel'
    where m.origen in ('manual', 'excel');
  get diagnostics v_escritas = row_count;
  if p_seguidores is not null then
    insert into public.metricas_linkedin_cuenta as c (semana, seguidores, origen)
    values (p_semana, p_seguidores, 'excel')
    on conflict (semana) do update set seguidores = excluded.seguidores, origen = 'excel'
      where c.origen in ('manual', 'excel');
  end if;
  return v_escritas;
end $$;

revoke all on function public.importar_excel_linkedin(date, jsonb, date, integer) from public, anon, service_role;
grant execute on function public.importar_excel_linkedin(date, jsonb, date, integer) to authenticated;
