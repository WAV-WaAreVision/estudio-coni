-- The public page `/l` (Plan 5b, Track B, design T12): its links and its click counter.

-- The links of the page, in order. Each is { id, titulo, detalle, url }; one without a `url` is hidden, so a link that
-- is not ready (a workshop with no dates, design "Pass 2") never shows. The id is what `/l/ir/<id>` looks up.
-- No URL is guessed here: Coni or WAV fills them in.
alter table public.ajustes add column enlaces jsonb not null default '[
  {"id": "agenda", "titulo": "Agenda una consulta", "detalle": "Adolescentes, adultos y parejas", "url": null},
  {"id": "taller", "titulo": "Taller Ser tu propia diosa", "detalle": "Próximas fechas", "url": null},
  {"id": "libros", "titulo": "Mis libros", "detalle": "Si la cama hablara… y Soy mi propia diosa", "url": null},
  {"id": "ring", "titulo": "Fundación Ring!", "detalle": "Relaciones Inteligentes", "url": null}
]'::jsonb check (jsonb_typeof(enlaces) = 'array');

-- What Coni reads: clicks per link per day. Counts only.
create table public.clics_enlace_dia (
  dia date not null,
  enlace text not null,
  clics integer not null default 0 check (clics >= 0),
  primary key (dia, enlace)
);

-- What lets the count be "one per visitor per day": a daily-salted hash of the visitor (never the address or the
-- device), kept only until the day after it was made and then deleted by `registrar_clic` itself. The salt is not here:
-- the server derives it from a secret and the day.
create table public.visitas_clic (
  dia date not null,
  enlace text not null,
  visitante text not null check (visitante ~ '^[0-9a-f]{64}$'),
  primary key (dia, enlace, visitante)
);

alter table public.clics_enlace_dia enable row level security;
alter table public.visitas_clic enable row level security;

create policy "coni y wav leen clics" on public.clics_enlace_dia for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
-- `visitas_clic` has no policy: nobody reads it through the API, only `registrar_clic` touches it.

revoke insert, update, delete, truncate on public.clics_enlace_dia from anon, authenticated;
revoke all on public.visitas_clic from anon, authenticated;
revoke all on public.clics_enlace_dia from anon;

-- Counts one click per (day, link, visitor). Returns true when this visitor had not clicked that link today. The
-- hashes of earlier days are deleted on the way, so they never pile up.
create function public.registrar_clic(p_enlace text, p_visitante text, p_dia date) returns boolean
language plpgsql set search_path = '' as $$
declare
  v_nuevo integer;
begin
  insert into public.visitas_clic (dia, enlace, visitante) values (p_dia, p_enlace, p_visitante)
    on conflict do nothing;
  get diagnostics v_nuevo = row_count;

  delete from public.visitas_clic where dia < p_dia - 1;

  if v_nuevo = 0 then
    return false;
  end if;
  insert into public.clics_enlace_dia (dia, enlace, clics) values (p_dia, p_enlace, 1)
    on conflict (dia, enlace) do update set clics = public.clics_enlace_dia.clics + 1;
  return true;
end $$;

revoke execute on function public.registrar_clic(text, text, date) from public, anon, authenticated;
grant execute on function public.registrar_clic(text, text, date) to service_role;
