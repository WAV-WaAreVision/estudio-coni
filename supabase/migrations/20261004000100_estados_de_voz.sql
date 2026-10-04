-- Approve, record the voice and record the video as three steps. The states mirror lib/dominio/estados.ts (ESTADOS).
-- A new enum value cannot be used in the transaction that adds it, so the rules that name them are in the next file.
alter type public.estado_pieza add value if not exists 'guion_aprobado' after 'guion_por_aprobar';
alter type public.estado_pieza add value if not exists 'grabando_voz' after 'guion_aprobado';
