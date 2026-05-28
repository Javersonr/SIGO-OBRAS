-- 0024 — Os últimos 103 records
alter table public.usuario_empresa drop constraint if exists usuario_empresa_projeto_fk;
alter table public.projeto         alter column nome drop not null;
notify pgrst, 'reload schema';
