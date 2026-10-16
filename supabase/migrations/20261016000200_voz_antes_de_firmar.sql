-- The voice joins gate 1 (design 2026-10-15): it is made with the script, before the signature, so a piece can be in
-- grabando_voz without an approval. Only grabando_voz leaves the list of 20261015000050; guion_aprobado stays
-- (unreachable now, harmless). proteger_pieza does not change: only Coni moves a piece into grabando_voz or en_render.
alter table public.piezas drop constraint aprobada_para_grabar;
alter table public.piezas add constraint aprobada_para_grabar check (
  estado not in (
    'guion_aprobado', 'en_render', 'subtitulando', 'video_por_aprobar', 'programado', 'para_subir_a_mano', 'publicado',
    'publicado_a_mano'
  )
  or puerta1_hash is not null
);
