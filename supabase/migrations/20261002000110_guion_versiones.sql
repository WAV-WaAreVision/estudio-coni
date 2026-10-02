-- Script history. Every draft Claude saves and every edit Coni makes is kept, so she can compare and go back.
create table public.guion_versiones (
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  numero integer not null check (numero >= 1),
  guion text not null,
  texto text,
  autor text not null check (autor in ('claude', 'coni')),
  creada_por uuid,
  creada_en timestamptz not null default now(),
  primary key (pieza_id, numero)
);

alter table public.guion_versiones enable row level security;
create policy "coni y wav leen versiones" on public.guion_versiones
  for select to authenticated using (public.es_coni() or public.es_mantenedor());
-- Rows are written only by the two functions below; the table grants stay read-only for every API role.
revoke insert, update, delete, truncate on public.guion_versiones from anon, authenticated;

create function public.siguiente_version_de_guion(p_pieza uuid) returns integer
language sql stable set search_path = '' as $$
  select coalesce(max(numero), 0) + 1 from public.guion_versiones where pieza_id = p_pieza
$$;

-- Coni edits the script (and the publication text) before approving gate 1. Runs as the owner so it may write the
-- history table, while auth.uid() still reads her token: the audit trigger on piezas names her as the actor, and
-- exigir_revision_limpia does not refuse the review write because current_user is not `authenticated` in here.
create function public.editar_guion_como_coni(
  p_pieza uuid, p_version integer, p_guion text, p_texto text, p_revision jsonb
) returns public.piezas
language plpgsql security definer set search_path = '' as $$
declare
  fila public.piezas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_edita_guion';
  end if;
  if jsonb_typeof(p_revision) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'revision_invalida';
  end if;

  update public.piezas
     set guion = p_guion, texto = p_texto, revision = p_revision, version = version + 1
   where id = p_pieza and version = p_version and estado = 'guion_por_aprobar'
  returning * into fila;
  if fila.id is null then
    if exists (select 1 from public.piezas where id = p_pieza and estado <> 'guion_por_aprobar') then
      raise exception using errcode = '22023', message = 'guion_fuera_de_revision';
    end if;
    raise exception using errcode = '40001', message = 'version_desfasada';
  end if;

  insert into public.guion_versiones (pieza_id, numero, guion, texto, autor, creada_por)
  values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'coni', auth.uid());
  return fila;
end $$;

revoke execute on function public.editar_guion_como_coni(uuid, integer, text, text, jsonb) from public, anon;
grant execute on function public.editar_guion_como_coni(uuid, integer, text, text, jsonb) to authenticated;
