-- 0118 — referências só para registros da MESMA empresa
--
-- A RLS confere apenas o empresa_id da linha gravada, não os IDs que ela
-- referencia (e o legado não tem FK). Assim a empresa A gravava, direto pela
-- API, uma linha "sua" apontando para um registro da empresa B, e as Edge
-- Functions (service role) seguiam a referência:
--   - fornecedor_acesso.fornecedor_id da B → portal do fornecedor com as
--     cotações da B e os tokens para responder por ele;
--   - cotacao_fornecedor.cotacao_id da B → cabeçalho da cotação da B;
--   - token_cliente_oportunidade.oportunidade_id da B → oportunidade/projeto
--     inteiros da B no portal do cliente;
--   - treinamento_matricula.curso_id da B → curso, apostilas, vídeos e
--     gabarito da B no portal do funcionário (e certificado com o RT da B);
--   - transacao_financeira.fornecedor_id da B → nome/CNPJ/telefone do
--     fornecedor da B no recibo.
--
-- Trigger genérica: cada argumento é "coluna:tabela" (ou "coluna:t1|t2"
-- quando a referência pode estar em mais de uma tabela). O pai tem que
-- existir COM o mesmo empresa_id da linha. No UPDATE só confere se a
-- referência ou a empresa mudou (linhas antigas intocadas seguem salváveis).
-- Roda com os direitos de quem grava: para o usuário, a RLS já esconde o pai
-- de outra empresa; service role e super admin enxergam e comparam.

create or replace function public.exigir_referencias_da_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  i int;
  coluna text;
  tabela text;
  valor text;
  achou boolean;
  novo jsonb := to_jsonb(new);
  velho jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  for i in 0 .. tg_nargs - 1 loop
    coluna := split_part(tg_argv[i], ':', 1);
    valor := novo ->> coluna;
    continue when valor is null;
    continue when tg_op = 'UPDATE'
      and valor is not distinct from (velho ->> coluna)
      and (novo ->> 'empresa_id') is not distinct from (velho ->> 'empresa_id');

    achou := false;
    foreach tabela in array string_to_array(split_part(tg_argv[i], ':', 2), '|') loop
      execute format(
        'select exists(select 1 from public.%I where id = $1::uuid and empresa_id = $2::uuid)',
        tabela
      ) into achou using valor, novo ->> 'empresa_id';
      exit when achou;
    end loop;

    if not achou then
      raise exception 'Acesso negado: % aponta para registro de outra empresa', coluna
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.exigir_referencias_da_empresa() from public, anon, authenticated;

-- Portal do fornecedor / cotações
drop trigger if exists referencias_da_empresa on public.fornecedor_acesso;
create trigger referencias_da_empresa
  before insert or update of fornecedor_id, empresa_id on public.fornecedor_acesso
  for each row execute function public.exigir_referencias_da_empresa('fornecedor_id:fornecedor');

drop trigger if exists referencias_da_empresa on public.cotacao_fornecedor;
create trigger referencias_da_empresa
  before insert or update of cotacao_id, fornecedor_id, empresa_id on public.cotacao_fornecedor
  for each row execute function public.exigir_referencias_da_empresa(
    'cotacao_id:cotacao', 'fornecedor_id:fornecedor');

drop trigger if exists referencias_da_empresa on public.cotacao_resposta;
create trigger referencias_da_empresa
  before insert or update of cotacao_fornecedor_id, cotacao_id, fornecedor_id, empresa_id
  on public.cotacao_resposta
  for each row execute function public.exigir_referencias_da_empresa(
    'cotacao_fornecedor_id:cotacao_fornecedor', 'cotacao_id:cotacao', 'fornecedor_id:fornecedor');

drop trigger if exists referencias_da_empresa on public.cotacao;
create trigger referencias_da_empresa
  before insert or update of solicitacao_id, projeto_id, empresa_id on public.cotacao
  for each row execute function public.exigir_referencias_da_empresa(
    'solicitacao_id:solicitacao_compra', 'projeto_id:projeto');

-- Portal do cliente (o "oportunidade_id" do link pode ser projeto ou oportunidade)
drop trigger if exists referencias_da_empresa on public.token_cliente_oportunidade;
create trigger referencias_da_empresa
  before insert or update of oportunidade_id, empresa_id on public.token_cliente_oportunidade
  for each row execute function public.exigir_referencias_da_empresa(
    'oportunidade_id:oportunidade|projeto');

drop trigger if exists referencias_da_empresa on public.cliente_portal_usuario;
create trigger referencias_da_empresa
  before insert or update of projeto_id, empresa_id on public.cliente_portal_usuario
  for each row execute function public.exigir_referencias_da_empresa(
    'projeto_id:projeto|oportunidade');

-- Portal do funcionário (EAD)
drop trigger if exists referencias_da_empresa on public.treinamento_matricula;
create trigger referencias_da_empresa
  before insert or update of curso_id, funcionario_id, empresa_id on public.treinamento_matricula
  for each row execute function public.exigir_referencias_da_empresa(
    'curso_id:treinamento_curso', 'funcionario_id:funcionario');

drop trigger if exists referencias_da_empresa on public.treinamento_aula;
create trigger referencias_da_empresa
  before insert or update of curso_id, empresa_id on public.treinamento_aula
  for each row execute function public.exigir_referencias_da_empresa('curso_id:treinamento_curso');

drop trigger if exists referencias_da_empresa on public.treinamento_questao;
create trigger referencias_da_empresa
  before insert or update of curso_id, empresa_id on public.treinamento_questao
  for each row execute function public.exigir_referencias_da_empresa('curso_id:treinamento_curso');

drop trigger if exists referencias_da_empresa on public.treinamento_progresso;
create trigger referencias_da_empresa
  before insert or update of matricula_id, aula_id, empresa_id on public.treinamento_progresso
  for each row execute function public.exigir_referencias_da_empresa(
    'matricula_id:treinamento_matricula', 'aula_id:treinamento_aula');

drop trigger if exists referencias_da_empresa on public.treinamento_duvida;
create trigger referencias_da_empresa
  before insert or update of curso_id, matricula_id, funcionario_id, aula_id, empresa_id
  on public.treinamento_duvida
  for each row execute function public.exigir_referencias_da_empresa(
    'curso_id:treinamento_curso', 'matricula_id:treinamento_matricula',
    'funcionario_id:funcionario', 'aula_id:treinamento_aula');

drop trigger if exists referencias_da_empresa on public.treinamento_tentativa;
create trigger referencias_da_empresa
  before insert or update of curso_id, matricula_id, funcionario_id, empresa_id
  on public.treinamento_tentativa
  for each row execute function public.exigir_referencias_da_empresa(
    'curso_id:treinamento_curso', 'matricula_id:treinamento_matricula',
    'funcionario_id:funcionario');

drop trigger if exists referencias_da_empresa on public.treinamento_certificado;
create trigger referencias_da_empresa
  before insert or update of curso_id, matricula_id, funcionario_id, empresa_id
  on public.treinamento_certificado
  for each row execute function public.exigir_referencias_da_empresa(
    'curso_id:treinamento_curso', 'matricula_id:treinamento_matricula',
    'funcionario_id:funcionario');

-- Recibo do fornecedor
drop trigger if exists referencias_da_empresa on public.transacao_financeira;
create trigger referencias_da_empresa
  before insert or update of fornecedor_id, empresa_id on public.transacao_financeira
  for each row execute function public.exigir_referencias_da_empresa('fornecedor_id:fornecedor');
