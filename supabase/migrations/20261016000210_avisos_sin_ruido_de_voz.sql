-- The voice is made before gate 1 now (design 2026-10-15): an edit that changes what the voice says (the voice
-- fingerprint) sends the piece through grabando_voz and back, while caption or LinkedIn text edits never do, and an undo
-- brings a signed piece back to guion_por_aprobar. Neither is news for Coni, who is on that screen:
-- the "script ready" notice is written only when someone else hands the script to her (the writer, HeyGen's refusal).
-- Body as of 20261001001520 plus the early return; the privileges revoked there stay.
create or replace function public.avisar_pieza_lista() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tipo_aviso text;
  texto text;
begin
  if new.estado = 'guion_por_aprobar' then
    if old.estado = 'grabando_voz' or public.es_coni() then
      return null;
    end if;
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
