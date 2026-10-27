-- Review fixes of carousels part 2 (plan 2026-10-27, amendments 1 and 5): cambiar_diseno_de_carrusel checks every
-- slide as lib/dominio/diseno-carrusel.ts does, a rendered version keeps its files, Reintentar enters armando_carrusel
-- only after a failed render, and the words see JavaScript's spaces whatever the database's locale.

-- The spaces JavaScript's \s knows beyond ASCII (frasesDe, palabrasDelCarrusel), as one plain space: whether
-- [[:space:]] takes them depends on the locale, so a split the app makes after "hora.<U+00A0>Eso" would not keep the words.
create function public.espacios_simples(p_texto text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p_texto, '[   -     　﻿]', ' ', 'g')
$$;

-- palabras_de_laminas as of 20261027000110, through espacios_simples.
create or replace function public.palabras_de_laminas(p_laminas jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(p.palabra, ' ' order by l.orden, p.orden), '')
    from jsonb_array_elements(p_laminas) with ordinality as l(lamina, orden),
         regexp_split_to_table(
           public.espacios_simples(
             normalize(coalesce(l.lamina ->> 'texto', '') || ' ' || coalesce(l.lamina ->> 'fuente', ''), nfc)
           ),
           '\s+'
         ) with ordinality as p(palabra, orden)
   where p.palabra <> ''
$$;

-- The words of one text as palabrasDe (lib/dominio/carrusel.ts) sees them, runs of letters and digits: what a highlight
-- may be. ICU classifies letters the same under any database locale (under "C", "ñ" would not be one).
create function public.palabras_de(p_texto text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(m[1]), '{}')
    from regexp_matches(normalize(coalesce(p_texto, ''), nfc) collate "und-x-icu", '[[:alpha:][:digit:]]+', 'g') as m
$$;

-- proteger_carrusel as of 20261026000110, plus: a rendered version is what gate 2 saw and signs, so its state and its
-- files never move again, not even for the service (a late or doubled render must not overwrite them).
create or replace function public.proteger_carrusel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.piezas where id = new.pieza_id and tipo = 'carrusel') then
      raise exception using errcode = '42501', message = 'pieza_no_es_carrusel';
    end if;
    return new;
  end if;
  if new.pieza_id is distinct from old.pieza_id or new.version is distinct from old.version
     or new.laminas is distinct from old.laminas or new.texto_post is distinct from old.texto_post
     or new.hash_texto is distinct from old.hash_texto or new.diseno is distinct from old.diseno
     or new.origen is distinct from old.origen or new.pedido is distinct from old.pedido
     or new.creado_en is distinct from old.creado_en then
    raise exception using errcode = '42501', message = 'carrusel_inmutable';
  end if;
  if old.estado = 'listo' and (
    new.estado is distinct from old.estado or new.pdf_clave is distinct from old.pdf_clave
    or new.png_claves is distinct from old.png_claves
  ) then
    raise exception using errcode = '42501', message = 'carrusel_inmutable';
  end if;
  return new;
end $$;

-- proteger_pieza as of 20261027000100, plus: Reintentar takes a carousel back to armando_carrusel only when its error
-- came from there (estado_antes_del_error), not from a publication or anything else.
create or replace function public.proteger_pieza()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  aprueba_puerta1 boolean;
  aprueba_puerta2 boolean;
begin
  if tg_op = 'INSERT' then
    if new.version <> 0 or new.puerta1_hash is not null or new.puerta2_hash_texto is not null
       or new.avatar_id is not null or new.puerta1_formula is not null or new.pedido_de_cambio is not null then
      raise exception using errcode = '42501', message = 'pieza_nueva_invalida';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  if new.tipo is distinct from old.tipo then
    raise exception using errcode = '42501', message = 'tipo_inmutable';
  end if;

  if old.puerta2_hash_texto is not null and new.puerta2_hash_texto is not null
     and (new.texto_linkedin is distinct from old.texto_linkedin or new.destinos is distinct from old.destinos) then
    raise exception using errcode = '42501', message = 'artefacto_aprobado';
  end if;

  aprueba_puerta1 := new.puerta1_hash is not null and new.puerta1_hash is distinct from old.puerta1_hash;
  aprueba_puerta2 := new.puerta2_hash_texto is not null and (
    new.puerta2_hash_texto is distinct from old.puerta2_hash_texto
    or new.puerta2_video_id is distinct from old.puerta2_video_id
    or new.puerta2_carrusel_id is distinct from old.puerta2_carrusel_id
    or new.puerta2_publicar_en is distinct from old.puerta2_publicar_en
  );
  if (aprueba_puerta1 or aprueba_puerta2) and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_aprueba';
  end if;
  if new.estado in ('grabando_voz', 'en_render', 'armando_carrusel', 'programado', 'publicado_a_mano')
     and new.estado is distinct from old.estado and not public.es_coni() then
    -- The publish task may close a mixed piece (one destination by hand, the last one automatic: L7) only when
    -- nothing is left to upload.
    if not (new.estado = 'publicado_a_mano' and old.estado = 'programado'
            and not exists (select 1 from public.publicaciones
                             where pieza_id = new.id and estado in ('esperando', 'para_subir'))) then
      raise exception using errcode = '42501', message = 'solo_coni_entra_a_puerta';
    end if;
  end if;

  -- Her change request counts against three (pedir_cambio_de_carrusel): a session must not get around it, at gate 1
  -- or at gate 2 ("El texto").
  if new.tipo = 'carrusel' and old.estado in ('guion_por_aprobar', 'carrusel_por_aprobar')
     and new.estado = 'guion_en_proceso' and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'cambio_por_funcion';
  end if;
  if new.pedido_de_cambio is distinct from old.pedido_de_cambio and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'pedido_solo_por_funcion';
  end if;
  if new.cambios_de_texto is distinct from old.cambios_de_texto and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'cambios_solo_por_funcion';
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
  if new.puerta2_formula is distinct from old.puerta2_formula
     and new.puerta2_hash_texto is not null and not aprueba_puerta2 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  if new.respaldo is distinct from old.respaldo and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'respaldo_solo_de_tareas';
  end if;
  if aprueba_puerta1 and new.tipo = 'reel' and new.avatar_id is null then
    raise exception using errcode = '42501', message = 'falta_avatar';
  end if;
  -- A carousel enters armando_carrusel from its gate 1 signature (exigir_revision_limpia checks the review on leaving
  -- guion_por_aprobar), from a design change at gate 2 (only through cambiar_diseno_de_carrusel, which keeps the words)
  -- or from Reintentar after a failed render.
  if new.tipo = 'carrusel' and new.estado = 'armando_carrusel' and new.estado is distinct from old.estado then
    if old.estado not in ('guion_por_aprobar', 'carrusel_por_aprobar', 'error_produccion')
       or (old.estado = 'error_produccion' and old.estado_antes_del_error is distinct from 'armando_carrusel') then
      raise exception using errcode = '42501', message = 'firma_fuera_de_puerta1';
    end if;
    if old.estado = 'carrusel_por_aprobar' and current_user in ('authenticated', 'anon') then
      raise exception using errcode = '42501', message = 'diseno_por_funcion';
    end if;
  end if;
  -- What she signs is the latest version she read (amendment 4 of part 1): a version written meanwhile is not signed blind.
  if aprueba_puerta1 and new.tipo = 'carrusel' and new.puerta1_hash is distinct from (
    select c.hash_texto from public.carruseles c where c.pieza_id = new.id order by c.version desc limit 1
  ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;
  if new.tipo = 'carrusel' and new.estado is distinct from old.estado
     and new.estado in ('armando_carrusel', 'carrusel_por_aprobar', 'programado', 'para_subir_a_mano', 'publicado',
                        'publicado_a_mano', 'error_publicacion')
     and new.puerta1_hash is distinct from (
       select c.hash_texto from public.carruseles c where c.pieza_id = new.id order by c.version desc limit 1
     ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;
  -- Gate 2 of a carousel (plan amendment 2): from carrusel_por_aprobar, on the latest version, rendered, with the words
  -- gate 1 signed.
  if aprueba_puerta2 and new.tipo = 'carrusel' and (
    old.estado <> 'carrusel_por_aprobar'
    or not exists (
      select 1 from public.carruseles c
       where c.id = new.puerta2_carrusel_id and c.pieza_id = new.id and c.estado = 'listo'
         and c.hash_texto = new.puerta2_hash_texto and c.hash_texto = new.puerta1_hash
         and c.version = (select max(v.version) from public.carruseles v where v.pieza_id = new.id)
    )
  ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;

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
  -- The formula describes an approval: without one there is nothing for it to describe.
  if new.puerta2_hash_texto is null then
    new.puerta2_formula := null;
  end if;

  new.actualizada_en := now();
  return new;
end $function$;

-- cambiar_diseno_de_carrusel as of 20261027000110, plus each slide as the app builds it (aplicarCambioDeDiseno): only the
-- keys tipo, texto, destacado and fuente; texts as text; the source line only on the closing slide; a highlight only one
-- of its own slide's words (palabras_de). The words and the bounds are checked as before.
create or replace function public.cambiar_diseno_de_carrusel(p_pieza uuid, p_version integer, p_laminas jsonb, p_diseno jsonb)
returns public.carruseles
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_actual public.carruseles;
  v_nueva public.carruseles;
  v_n integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_cambia_diseno';
  end if;
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.tipo <> 'carrusel' or v_pieza.estado <> 'carrusel_por_aprobar' then
    raise exception using errcode = 'P0001', message = 'estado_no_cambiable';
  end if;
  select * into v_actual from public.carruseles where pieza_id = p_pieza order by version desc limit 1;
  if v_actual.estado <> 'listo' then
    raise exception using errcode = 'P0001', message = 'estado_no_cambiable';
  end if;

  if jsonb_typeof(p_laminas) <> 'array' or jsonb_typeof(p_diseno) <> 'object' then
    raise exception using errcode = '22023', message = 'diseno_invalido';
  end if;
  v_n := jsonb_array_length(p_laminas);
  if v_n not between 6 and 8
     or exists (
       select 1 from jsonb_array_elements(p_laminas) with ordinality as e(lamina, orden)
        where case
          when jsonb_typeof(e.lamina) <> 'object' or jsonb_typeof(e.lamina -> 'texto') is distinct from 'string'
            then true
          when exists (select 1 from jsonb_object_keys(e.lamina) as k(clave)
                        where k.clave not in ('tipo', 'texto', 'destacado', 'fuente'))
            then true
          when e.lamina ? 'fuente'
            then e.orden <> v_n or jsonb_typeof(e.lamina -> 'fuente') <> 'string'
          else false
        end
           or case
                when not e.lamina ? 'destacado' then false
                when jsonb_typeof(e.lamina -> 'destacado') <> 'string' then true
                else not (e.lamina ->> 'destacado' = any (public.palabras_de(e.lamina ->> 'texto')))
              end
     )
     or p_laminas -> 0 ->> 'tipo' is distinct from 'portada'
     or p_laminas -> (v_n - 1) ->> 'tipo' is distinct from 'cierre'
     or exists (select 1 from jsonb_array_elements(p_laminas) with ordinality as e(lamina, orden)
                 where e.orden between 2 and v_n - 1 and e.lamina ->> 'tipo' is distinct from 'idea')
     or p_laminas -> 0 ->> 'texto' is distinct from v_actual.laminas -> 0 ->> 'texto'
     or p_laminas -> (v_n - 1) ->> 'texto' is distinct from v_actual.laminas -> (jsonb_array_length(v_actual.laminas) - 1) ->> 'texto'
     or p_laminas -> (v_n - 1) ->> 'fuente' is distinct from v_actual.laminas -> (jsonb_array_length(v_actual.laminas) - 1) ->> 'fuente'
     or public.palabras_de_laminas(p_laminas) <> public.palabras_de_laminas(v_actual.laminas)
     or (select count(*) from jsonb_object_keys(p_diseno)) <> 1
     or p_diseno ->> 'variante' is null
     or p_diseno ->> 'variante' not in ('crema', 'piedra', 'oscura') then
    raise exception using errcode = '22023', message = 'diseno_invalido';
  end if;
  if p_laminas = v_actual.laminas and p_diseno = v_actual.diseno then
    raise exception using errcode = '22023', message = 'diseno_sin_cambio';
  end if;

  insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, diseno, origen)
  values (p_pieza, v_actual.version + 1, p_laminas, v_actual.texto_post, v_actual.hash_texto, p_diseno, 'cambio_diseno')
  returning * into v_nueva;
  update public.piezas set estado = 'armando_carrusel', intento = intento + 1, explicacion = null, version = version + 1
   where id = p_pieza;
  return v_nueva;
end $$;

