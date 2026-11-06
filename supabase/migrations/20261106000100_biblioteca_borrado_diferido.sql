-- Borrar con «Deshacer» (pedido 29, punto 4g; Coni's SQL, docs/pedido-coni-2026-10-31/pedido-original.md:253-322):
-- a row is marked, hidden everywhere Coni looks, and the ten-minute maintenance deletes it a minute later. Adds only.
alter table public.materiales add column borrar_desde timestamptz;
alter table public.autores add column borrar_desde timestamptz;
create index materiales_por_borrar on public.materiales (borrar_desde) where borrar_desde is not null;
create index autores_por_borrar on public.autores (borrar_desde) where borrar_desde is not null;

-- What is marked is not seen in the Biblioteca's lists.
create view public.materiales_visibles with (security_invoker = true) as
select * from public.materiales where borrar_desde is null;
create view public.autores_visibles with (security_invoker = true) as
select * from public.autores where borrar_desde is null;
revoke all on public.materiales_visibles, public.autores_visibles from anon, authenticated;
grant select on public.materiales_visibles, public.autores_visibles to authenticated;

-- Coni, or whoever uploaded the material, marks it. Same rule as today's delete policy.
create function public.marcar_material_para_borrar(p_id uuid, p_borrar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.materiales set borrar_desde = case when p_borrar then now() end
  where id = p_id and (public.es_coni() or subido_por = auth.uid())
    and (p_borrar = (borrar_desde is null));
  if not found then
    raise exception using errcode = '22023', message = 'no_se_pudo_marcar';
  end if;
  -- Deshacer: a recovered material never shows a hidden author, its own or the author of one of its ideas.
  if not p_borrar then
    update public.autores set borrar_desde = null
    where borrar_desde is not null
      and (id = (select autor_id from public.materiales where id = p_id)
           or id in (select autor_id from public.afirmaciones where material_id = p_id));
  end if;
end $$;

revoke execute on function public.marcar_material_para_borrar(uuid, boolean) from public, anon, authenticated;
grant execute on function public.marcar_material_para_borrar(uuid, boolean) to authenticated;

create function public.marcar_autor_para_borrar(p_id uuid, p_borrar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_coni() or public.es_mantenedor()) then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if exists (select 1 from public.autores where id = p_id and tipo = 'coni') then
    raise exception using errcode = '22023', message = 'autor_coni_protegido';
  end if;
  if p_borrar and (
    exists (select 1 from public.materiales where autor_id = p_id and borrar_desde is null)
    or exists (select 1 from public.afirmaciones f join public.materiales m on m.id = f.material_id
               where f.autor_id = p_id and m.borrar_desde is null)
  ) then
    raise exception using errcode = '22023', message = 'autor_con_materiales';
  end if;
  update public.autores set borrar_desde = case when p_borrar then now() end
  where id = p_id and (p_borrar = (borrar_desde is null));
  if not found then
    raise exception using errcode = '22023', message = 'no_se_pudo_marcar';
  end if;
end $$;

revoke execute on function public.marcar_autor_para_borrar(uuid, boolean) from public, anon, authenticated;
grant execute on function public.marcar_autor_para_borrar(uuid, boolean) to authenticated;

-- service_role (ten-minute maintenance): deletes what was marked before p_antes and returns the deleted materials so
-- the task deletes their R2 folders. The counts go to the deletion log, as the nightly deletions do.
create function public.borrar_lo_marcado(p_antes timestamptz) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  borrados uuid[];
  autores_borrados integer := 0;
begin
  -- The cut comes from the worker's clock and the marks from this one: never closer than a minute to now(), so a
  -- worker clock running ahead cannot delete inside the 8 seconds of «Deshacer».
  p_antes := least(p_antes, now() - interval '1 minute');
  with b as (delete from public.materiales where borrar_desde < p_antes returning id)
  select coalesce(array_agg(id), '{}') into borrados from b;
  -- An author marked while an edit or an upload gave it a material, or an idea, would stay hidden for good: nothing
  -- else unmarks it and the delete below skips it. It comes back instead.
  update public.autores a set borrar_desde = null
   where a.borrar_desde is not null
     and (exists (select 1 from public.materiales m where m.autor_id = a.id and m.borrar_desde is null)
       or exists (select 1 from public.afirmaciones f join public.materiales m on m.id = f.material_id
                   where f.autor_id = a.id and m.borrar_desde is null));
  -- afirmaciones.autor_id is on delete restrict: an author that still says something elsewhere is not deleted.
  -- A material or idea added between the check and the delete raises 23503; only the authors' part is undone,
  -- they stay marked for the next sweep and the materials (and their R2 ids) still go.
  begin
    delete from public.autores a where a.borrar_desde < p_antes and a.tipo <> 'coni'
      and not exists (select 1 from public.materiales m where m.autor_id = a.id)
      and not exists (select 1 from public.afirmaciones f where f.autor_id = a.id);
    get diagnostics autores_borrados = row_count;
  exception when foreign_key_violation then
    raise warning 'borrar_lo_marcado: authors kept by a foreign key: %', sqlerrm;
    autores_borrados := 0;
  end;
  if cardinality(borrados) > 0 then
    insert into public.registro_de_borrados (regla, cantidad) values ('materiales_de_biblioteca', cardinality(borrados));
  end if;
  if autores_borrados > 0 then
    insert into public.registro_de_borrados (regla, cantidad) values ('autores_de_biblioteca', autores_borrados);
  end if;
  return borrados;
end $$;

revoke execute on function public.borrar_lo_marcado(timestamptz) from public, anon, authenticated;
grant execute on function public.borrar_lo_marcado(timestamptz) to service_role;

-- Topic counts (Temas in Conidolly through temas_de_red, Ingesta's /temas, the motor) drop a marked material at once.
-- Same body as 20261003000310, plus the mark in the join and in the evidence subquery.
create or replace view public.temas_resumen with (security_invoker = true) as
select
  t.id, t.nombre, t.descripcion, t.categoria_id, t.alias, t.creado_en, t.actualizado_en,
  coalesce(r.afirmaciones, 0) as afirmaciones,
  coalesce(r.autores, 0) as autores,
  coalesce(r.evidencia, '{}'::jsonb) as evidencia,
  coalesce(r.cubierto_por_coni, false) as cubierto_por_coni,
  r.ultima_afirmacion
from public.temas t
left join lateral (
  select
    count(*)::int as afirmaciones,
    count(distinct x.autor_id)::int as autores,
    (select jsonb_object_agg(e.evidencia, e.n)
     from (
       select a2.evidencia, count(*)::int as n
       from public.afirmaciones a2
       join public.materiales m2 on m2.id = a2.material_id
       where a2.tema_id = t.id and not a2.excluida and m2.borrar_desde is null
       group by a2.evidencia
     ) e) as evidencia,
    bool_or(x.rol = 'voz_propia') as cubierto_por_coni,
    max(x.creada_en) as ultima_afirmacion
  from (
    select a.autor_id, a.creada_en, m.rol
    from public.afirmaciones a
    join public.materiales m on m.id = a.material_id
    where a.tema_id = t.id and not a.excluida and m.borrar_desde is null
  ) x
) r on true
where t.fusionado_en is null;
