-- The two notices that are born from a state change are written by the database, in the same transaction as the change:
-- whichever code moves a piece to "waiting for Coni", the notice exists, and a crash between the two cannot lose it.
-- They wait for the 08:30 summary (design A9); the tasks send the urgent ones themselves.
create function public.avisar_pieza_lista() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tipo_aviso text;
  texto text;
begin
  if new.estado = 'guion_por_aprobar' then
    tipo_aviso := 'guion_listo';
    texto := 'Tu guion «' || left(new.titulo, 120) || '» está listo para revisar.';
  else
    tipo_aviso := 'video_listo';
    texto := 'Tu video «' || left(new.titulo, 120) || '» está listo para verlo y aprobarlo.';
  end if;
  -- `version` goes up on every write, so a state is noted once per time the piece enters it.
  insert into public.avisos (tipo, pieza_id, clave, mensaje)
  values (tipo_aviso, new.id, tipo_aviso || ':' || new.id || ':' || new.version, texto)
  on conflict (clave) do nothing;
  return null;
end $$;

revoke execute on function public.avisar_pieza_lista() from public, anon, authenticated;

create trigger avisar_pieza_lista after update of estado on public.piezas
  for each row
  when (new.estado in ('guion_por_aprobar', 'video_por_aprobar') and new.estado is distinct from old.estado)
  execute function public.avisar_pieza_lista();
