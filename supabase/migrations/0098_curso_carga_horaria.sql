-- 0098: carga horária do curso (base p/ listas de presença de 10h/dia)
alter table public.treinamento_curso
  add column if not exists carga_horaria_horas integer;
select 'ok' as res;
