-- C3: the backing a script was written from is frozen on the piece with the draft, and gate 1 gets formula 3, which
-- hashes it with the script, the caption and the avatar. Formulas 1 and 2 stay valid for pieces approved with them.

alter table public.piezas add column respaldo jsonb;
comment on column public.piezas.respaldo is
  'Theory and claims of the engine idea the current draft was written from (C3). Written only with the draft; hashed by gate 1 formula 3.';

alter table public.piezas drop constraint piezas_puerta1_formula_check;
alter table public.piezas add constraint piezas_puerta1_formula_check check (puerta1_formula in (1, 2, 3));

-- The old signature goes so PostgREST does not see two candidates. A worker deployed before C3 calls with the 7 old
-- named arguments and still matches: p_respaldo defaults to null.
drop function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric);

create function public.guardar_borrador(
  p_pieza uuid,
  p_version integer,
  p_guion text,
  p_texto text,
  p_revision jsonb,
  p_clave text,
  p_real numeric,
  p_respaldo jsonb default null
) returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_pieza public.piezas;
begin
  update public.piezas
    set guion = p_guion, texto = p_texto, revision = p_revision, respaldo = p_respaldo, version = version + 1
    where id = p_pieza and version = p_version
    returning * into v_pieza;
  if not found then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  insert into public.guion_versiones (pieza_id, numero, guion, texto, autor, creada_por)
  values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'claude', null);

  -- Without a reserved spend there is nothing to confirm; raising rolls back the writes above as well.
  update public.gastos set estado = 'confirmado', real_usd = p_real
    where clave = p_clave and estado = 'reservado';
  if not found then
    raise exception using errcode = 'P0001', message = 'gasto_no_reservado';
  end if;

  return v_pieza;
end $$;

revoke execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric, jsonb) to service_role;

-- proteger_pieza as of 20261003000181, plus: only the tasks change `respaldo`.
CREATE OR REPLACE FUNCTION public.proteger_pieza()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  aprueba_puerta1 boolean;
  aprueba_puerta2 boolean;
begin
  if tg_op = 'INSERT' then
    if new.version <> 0 or new.puerta1_hash is not null or new.puerta2_hash_texto is not null
       or new.avatar_id is not null or new.puerta1_formula is not null then
      raise exception using errcode = '42501', message = 'pieza_nueva_invalida';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
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

  if new.avatar_id is distinct from old.avatar_id then
    if not public.es_coni() then
      raise exception using errcode = '42501', message = 'solo_coni_elige_avatar';
    end if;
    if old.estado <> 'guion_por_aprobar' then
      raise exception using errcode = '42501', message = 'avatar_fuera_del_guion';
    end if;
  end if;
  if new.puerta1_formula is distinct from old.puerta1_formula and not aprueba_puerta1 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  -- The backing is written only with the draft, by the tasks (service role or the owner), never from Coni's session:
  -- gate 1 formula 3 hashes it, so a change from there would sign something she did not see.
  if new.respaldo is distinct from old.respaldo and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'respaldo_solo_de_tareas';
  end if;
  if aprueba_puerta1 and new.avatar_id is null then
    raise exception using errcode = '42501', message = 'falta_avatar';
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
end $function$;
