-- Same reason as 20261003000180: PostgREST 14.18 never answers SQLSTATE 40001. Stale-version conflicts raise PT409 (HTTP 409).
-- Bodies are the live definitions with only the errcode changed; create or replace keeps owner and grants.

CREATE OR REPLACE FUNCTION public.editar_texto_como_coni(p_pieza uuid, p_version integer, p_texto text, p_revision jsonb)
 RETURNS piezas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pieza public.piezas;
  v_resultado public.piezas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_edita_texto';
  end if;
  if jsonb_typeof(p_revision) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'revision_invalida';
  end if;

  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado not in ('guion_por_aprobar', 'video_por_aprobar', 'programado') then
    raise exception using errcode = 'P0001', message = 'estado_no_editable';
  end if;

  update public.piezas
     set texto = p_texto,
         revision = p_revision,
         version = version + 1,
         estado = case when estado = 'programado' then 'video_por_aprobar'::public.estado_pieza else estado end,
         intento = case when estado = 'programado' then intento + 1 else intento end,
         puerta2_video_id = case when estado = 'guion_por_aprobar' then puerta2_video_id else null end,
         puerta2_hash_texto = case when estado = 'guion_por_aprobar' then puerta2_hash_texto else null end,
         puerta2_publicar_en = case when estado = 'guion_por_aprobar' then puerta2_publicar_en else null end,
         puerta2_en = case when estado = 'guion_por_aprobar' then puerta2_en else null end
   where id = p_pieza
  returning * into v_resultado;
  return v_resultado;
end $function$

;

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
end $function$

;

CREATE OR REPLACE FUNCTION public.editar_guion_como_coni(p_pieza uuid, p_version integer, p_guion text, p_texto text, p_revision jsonb)
 RETURNS piezas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  fila public.piezas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_edita_guion';
  end if;
  if jsonb_typeof(p_revision) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'revision_invalida';
  end if;

  if btrim(coalesce(p_guion, ''), E' \t\r\n') = '' then
    raise exception using errcode = '22023', message = 'guion_vacio';
  end if;
  if btrim(coalesce(p_texto, ''), E' \t\r\n') = '' then
    raise exception using errcode = '22023', message = 'texto_vacio';
  end if;

  update public.piezas
     set guion = p_guion, texto = p_texto, revision = p_revision, version = version + 1
   where id = p_pieza and version = p_version and estado = 'guion_por_aprobar'
  returning * into fila;
  if fila.id is null then
    if exists (select 1 from public.piezas where id = p_pieza and estado <> 'guion_por_aprobar') then
      raise exception using errcode = '22023', message = 'guion_fuera_de_revision';
    end if;
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  insert into public.guion_versiones (pieza_id, numero, guion, texto, autor, creada_por)
  values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'coni', auth.uid());
  return fila;
end $function$

;
