-- 0122 — SG Ligth recebe os editais de fornecimento de material (decisão do
-- Javerson em 25/09/2026). O plano "Fábrica" (usado SÓ pela SG Ligth —
-- conferido em produção) passa a liberar Oportunidades, e a SG Ligth ganha os
-- mesmos status de oportunidade da Sinergia Construções (ordem/cor/tipo).
-- Idempotente: não duplica status se a empresa já tiver algum.

update public.plano
   set modulos_liberados = (
         case jsonb_typeof(modulos_liberados)
           when 'object' then modulos_liberados
           when 'string' then (modulos_liberados #>> '{}')::jsonb
           else '{}'::jsonb
         end
       ) || '{"Oportunidades": true}'::jsonb,
       updated_at = now()
 where id = '4b41d06f-d389-476b-8e63-e2da276fd01f';

insert into public.status_oportunidade (empresa_id, nome, cor, ordem, tipo)
select 'a335df76-d5a9-42fb-be01-5c82032fb5d8'::uuid, s.nome, s.cor, s.ordem, s.tipo
  from (values
    ('Novo Lead', '#3B82F6', 1, 'aberto'),
    ('Proposta', '#F59E0B', 2, 'aberto'),
    ('Ganho', '#10B981', 3, 'ganho'),
    ('Em Andamento', '#f77d3b', 4, 'aberto'),
    ('Aguardando a Prefeitura', '#f73b3b', 5, 'aberto'),
    ('Finalizado', '#e13bf7', 6, 'aberto')
  ) as s(nome, cor, ordem, tipo)
 where not exists (
   select 1 from public.status_oportunidade x
    where x.empresa_id = 'a335df76-d5a9-42fb-be01-5c82032fb5d8' and x.deleted_at is null
 );

select 'ok' as res;
