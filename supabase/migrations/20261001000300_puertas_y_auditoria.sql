create function public.proteger_pieza() returns trigger
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
  if new.estado in ('en_render', 'programado') and new.estado is distinct from old.estado and not public.es_coni() then
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

create trigger proteger_pieza before insert or update on public.piezas
  for each row execute function public.proteger_pieza();

create function public.registrar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fila jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  insert into public.eventos (pieza_id, tabla, operacion, actor_usuario, actor_rol, datos)
  values (
    case when tg_table_name = 'piezas' then (fila ->> 'id')::uuid else (fila ->> 'pieza_id')::uuid end,
    tg_table_name,
    lower(tg_op),
    auth.uid(),
    -- current_user is always the function owner in a security definer function, so it cannot name the writer:
    -- the token's role comes first, then the role set with SET ROLE, then the login role.
    coalesce(claims ->> 'role', nullif(current_setting('role'), 'none'), session_user),
    fila
  );
  return null;
end $$;

create trigger auditar after insert or update or delete on public.piezas
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.ideas
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.ajustes
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.gastos
  for each row execute function public.registrar_evento();
create trigger auditar after insert or update or delete on public.intervenciones
  for each row execute function public.registrar_evento();

create function public.solo_agregar() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'registro_inmutable';
end $$;

create trigger solo_agregar before update or delete on public.eventos
  for each row execute function public.solo_agregar();
create trigger solo_agregar before update or delete on public.intervenciones
  for each row execute function public.solo_agregar();
-- Row triggers do not fire on TRUNCATE, which would wipe the log in one statement.
create trigger solo_agregar_vaciar before truncate on public.eventos
  for each statement execute function public.solo_agregar();
create trigger solo_agregar_vaciar before truncate on public.intervenciones
  for each statement execute function public.solo_agregar();
