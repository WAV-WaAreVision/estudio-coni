-- A blocking finding from the automatic review (missing closing line, symbols, missing avatar notice or help
-- lines) must be fixed before Coni can approve; the database enforces it, not only the screen.
create function public.exigir_revision_limpia() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Only server tasks write the review; otherwise Coni could clear it in the same update that approves.
  if new.revision is distinct from old.revision and public.es_coni() then
    raise exception using errcode = '42501', message = 'revision_solo_servidor';
  end if;
  if (
    (old.estado = 'guion_por_aprobar' and new.estado = 'en_render')
    or (old.estado = 'video_por_aprobar' and new.estado = 'programado')
  ) and exists (
    select 1 from jsonb_array_elements(new.revision) as hallazgo where hallazgo ->> 'tipo' = 'bloquea'
  ) then
    raise exception using errcode = '42501', message = 'revision_bloquea';
  end if;
  return new;
end $$;

revoke execute on function public.exigir_revision_limpia() from public, anon, authenticated, service_role;

create trigger exigir_revision_limpia before update on public.piezas
  for each row execute function public.exigir_revision_limpia();
