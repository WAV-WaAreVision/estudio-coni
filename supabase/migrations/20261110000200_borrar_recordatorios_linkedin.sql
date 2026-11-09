-- The nightly email that asked WAV to type LinkedIn's numbers (decision 20) left with the Excel importer (#124,
-- Trigger 20261109.1): Coni uploads the Excel herself and Inicio reminds her. This table only claimed the weeks that
-- email went out, so nothing reads it any more. Dropped with Federico's OK on 2026-11-09 (#125).
drop table public.recordatorios_linkedin;
