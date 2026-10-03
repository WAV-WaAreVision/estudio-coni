-- Claims always carry their material's author, so changing a material's author needs no reprocess.
create function public.afirmaciones_siguen_autor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.afirmaciones set autor_id = new.autor_id where material_id = new.id;
  return null;
end;
$$;

revoke execute on function public.afirmaciones_siguen_autor() from public, anon, authenticated;

create trigger afirmaciones_siguen_autor after update of autor_id on public.materiales
  for each row when (old.autor_id is distinct from new.autor_id)
  execute function public.afirmaciones_siguen_autor();
