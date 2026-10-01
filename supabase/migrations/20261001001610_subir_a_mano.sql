-- Manual upload mode. `para_subir_a_mano`: the approved time came and Instagram was never connected, so the piece waits
-- for Coni to upload the video herself. `publicado_a_mano`: she says she did. Both keep the approved video, caption and
-- time (gate 2), exactly like `programado` and `publicado`.
alter table public.piezas
  drop constraint aprobada_para_grabar,
  drop constraint aprobada_para_publicar;
alter table public.piezas
  add constraint aprobada_para_grabar check (
    estado not in (
      'en_render', 'subtitulando', 'video_por_aprobar', 'programado', 'para_subir_a_mano', 'publicado',
      'publicado_a_mano'
    )
    or puerta1_hash is not null
  ),
  add constraint aprobada_para_publicar check (
    estado not in ('programado', 'para_subir_a_mano', 'publicado', 'publicado_a_mano')
    or puerta2_hash_texto is not null
  );

-- Only Coni says a reel is on Instagram: neither the tasks nor the maintainer can enter `publicado_a_mano`. Nothing else
-- of this function changes.
create or replace function public.proteger_pieza() returns trigger
language plpgsql set search_path = '' as $$
declare
  aprueba_puerta1 boolean;
  aprueba_puerta2 boolean;
begin
  if tg_op = 'INSERT' then
    if new.version <> 0 or new.puerta1_hash is not null or new.puerta2_hash_texto is not null then
      raise exception using errcode = '42501', message = 'pieza_nueva_invalida';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception using errcode = '40001', message = 'version_desfasada';
  end if;

  aprueba_puerta1 := new.puerta1_hash is not null and new.puerta1_hash is distinct from old.puerta1_hash;
  aprueba_puerta2 := new.puerta2_hash_texto is not null and (
    new.puerta2_hash_texto is distinct from old.puerta2_hash_texto
    or new.puerta2_video_id is distinct from old.puerta2_video_id
    or new.puerta2_publicar_en is distinct from old.puerta2_publicar_en
  );
  if (aprueba_puerta1 or aprueba_puerta2) and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_aprueba';
  end if;
  if new.estado in ('en_render', 'programado', 'publicado_a_mano') and new.estado is distinct from old.estado
     and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_entra_a_puerta';
  end if;

  -- Who approved is recorded by the database, never taken from the caller.
  if aprueba_puerta1 then
    new.puerta1_por := auth.uid();
  elsif new.puerta1_hash is null then
    new.puerta1_por := null;
  else
    new.puerta1_por := old.puerta1_por;
  end if;
  if aprueba_puerta2 then
    new.puerta2_por := auth.uid();
  elsif new.puerta2_hash_texto is null then
    new.puerta2_por := null;
  else
    new.puerta2_por := old.puerta2_por;
  end if;

  new.actualizada_en := now();
  return new;
end $$;

-- `listo_para_subir`: the reel is ready for her to upload (Instagram not connected).
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir'
));
