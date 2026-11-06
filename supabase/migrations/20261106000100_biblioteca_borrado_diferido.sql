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
