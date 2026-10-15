-- 20261004000110 recreated aprobada_para_grabar without para_subir_a_mano and publicado_a_mano (20261001001610 had
-- them), so a piece handed over for a manual upload could lose its gate 1 approval unnoticed. NOT VALID enforces the
-- full list on every write from now on without scanning existing rows; 20261015000060 validates those, so a legacy
-- row stops that migration with a clear error and this one still applies.
alter table public.piezas drop constraint aprobada_para_grabar;
alter table public.piezas add constraint aprobada_para_grabar check (
  estado not in (
    'guion_aprobado', 'grabando_voz', 'en_render', 'subtitulando', 'video_por_aprobar', 'programado',
    'para_subir_a_mano', 'publicado', 'publicado_a_mano'
  )
  or puerta1_hash is not null
) not valid;
