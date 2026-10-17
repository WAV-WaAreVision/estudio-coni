-- ideas.pilar points at the pillar rows of categorias (spec 2026-10-17, decision 3). Ideas still in the bank whose
-- pillar retired leave it with the motive pilar_retirado; used ideas keep their old slug (history and metrics).
alter table public.ideas alter column pilar type text using pilar::text;
drop type public.pilar;
alter table public.ideas add constraint ideas_pilar_fkey foreign key (pilar) references public.categorias (slug);
create index ideas_pilar on public.ideas (pilar);

-- A new idea, or a pillar change, must name an active pillar. Retired slugs stay valid on rows that already have them.
-- A slug that is no category at all is left to the foreign key (23503), which runs after this before-trigger.
create function public.exigir_pilar_activo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.categorias c where c.slug = new.pilar)
     and not exists (select 1 from public.categorias c where c.slug = new.pilar and c.es_pilar and c.activa) then
    raise exception using errcode = '23514', message = 'pilar_inactivo';
  end if;
  return new;
end $$;

create trigger exigir_pilar_activo before insert or update of pilar on public.ideas
  for each row execute function public.exigir_pilar_activo();

-- System motive only: descartar_idea (Coni's) keeps its four.
alter table public.ideas drop constraint ideas_motivo_descarte_check;
alter table public.ideas add constraint ideas_motivo_descarte_check
  check (motivo_descarte in ('no_me_representa', 'repetida', 'debil', 'otro', 'pilar_retirado'));

create function public.archivar_ideas_de_pilares_retirados() returns int
language plpgsql set search_path = '' as $$
declare
  v_n int;
begin
  update public.ideas i
     set estado = 'descartada', motivo_descarte = 'pilar_retirado', fijada_en = null
    from public.categorias c
   where c.slug = i.pilar and c.es_pilar and not c.activa and i.estado = 'idea';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.archivar_ideas_de_pilares_retirados() from public, anon, authenticated, service_role;

select public.archivar_ideas_de_pilares_retirados();
