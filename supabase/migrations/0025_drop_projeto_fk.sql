alter table public.projeto drop constraint if exists projeto_oportunidade_origem_id_fkey;
notify pgrst, 'reload schema';
