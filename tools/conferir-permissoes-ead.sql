-- ============================================================================
-- conferir-permissoes-ead.sql — conferência SÓ DE LEITURA para rodar ANTES de aplicar a migração 0147 (T33,
-- permissões do EAD; spec docs/superpowers/specs/2026-10-06-permissoes-ead-design.md, §9).
--
-- Mostra, por empresa, quem perderia alguma coisa no dia da troca:
--   1. "perderia a aba Treinamentos": vínculo ativo que não é Admin nem dono, tem alguma permissão em
--      Segurança do Trabalho → Funcionários e não tem a aba nova "Treinamentos EAD". Hoje a aba Treinamentos
--      aparece para quem tem Funcionários; depois da 0147 ela exige a aba nova, e quem tinha Funcionários →
--      Editar também perde liberar tentativa, revogar certificado e editar resposta de dúvida;
--   2. "perderia publicar/retirar PDF do portal": idem, sem RH → Criar e RH → Deletar (o cartão "PDFs do Portal do
--      Funcionário" da Ficha era aberto a quem via Funcionários; depois da 0147, publicar exige RH → Criar e
--      retirar, RH → Deletar);
--   3. "vínculo com ativo nulo": a tela trata o vínculo como ativo, o banco (tem_permissao) só aceita ativo = true;
--   4. "permissões gravadas como texto JSON": o banco lê (como o servidor já lê), mas vale conferir;
--   5. "PDFs publicados no portal": quantos itens já publicados existem (continuam valendo, nada muda de lugar);
--   0. "resumo": uma linha por empresa, para a lista nunca vir vazia sem explicação.
-- Lista vazia nas categorias 1 e 2 (só Admin e dono usam o EAD) = a fase 1 do plano pode ir junto com a 2.
--
-- Como rodar (o Javerson; nada é gravado):
--   supabase db query --linked -f tools/conferir-permissoes-ead.sql
--
-- SÓ LEITURA: nenhum INSERT, UPDATE ou DELETE. Cria duas funções TEMPORÁRIAS (schema pg_temp, que só existem nesta
-- conexão e somem quando ela fecha) para ler o JSON das permissões sem que um texto inválido derrube a consulta
-- (o Postgres antes do 16 não tem conversão "tenta e não lança"). A saída tem e-mails de usuários: não copie para o
-- repositório.
-- ============================================================================

-- permissões como objeto: objeto, texto JSON ou texto JSON duas vezes; o resto vira {} (a mesma regra da 0147)
create or replace function pg_temp.permissoes_lidas(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v jsonb := p;
begin
  for i in 1..2 loop
    exit when v is null or jsonb_typeof(v) <> 'string';
    begin
      v := (v #>> '{}')::jsonb;
    exception when others then
      return '{}'::jsonb;
    end;
  end loop;
  if v is null or jsonb_typeof(v) <> 'object' then
    return '{}'::jsonb;
  end if;
  return v;
end;
$$;

-- a aba do módulo (já lido) tem a função (ou, sem função, alguma função true ou a aba marcada como true)
create or replace function pg_temp.aba_tem(p_modulo jsonb, p_aba text, p_funcao text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_aba jsonb;
begin
  if p_modulo is null or jsonb_typeof(p_modulo) <> 'object' then
    return false;
  end if;
  v_aba := p_modulo -> p_aba;
  if p_funcao is null then
    if jsonb_typeof(v_aba) = 'boolean' then
      return v_aba = 'true'::jsonb;
    end if;
    return jsonb_typeof(v_aba) = 'object'
       and exists (select 1 from jsonb_each(v_aba) f where f.value = 'true'::jsonb);
  end if;
  return jsonb_typeof(v_aba) = 'object' and coalesce((v_aba -> p_funcao) = 'true'::jsonb, false);
end;
$$;

with vinculos as (
  select ue.empresa_id,
         e.nome as empresa,
         lower(ue.usuario_email) as usuario_email,
         ue.perfil,
         coalesce(ue.is_owner, false) as dono,
         ue.ativo,
         jsonb_typeof(ue.permissoes) as formato,
         pg_temp.permissoes_lidas(ue.permissoes) -> 'Segurança do Trabalho' as sst
    from public.usuario_empresa ue
    join public.empresa e on e.id = ue.empresa_id
   where ue.deleted_at is null
),
abas as (
  select v.*,
         (v.perfil = 'Admin' or v.dono) as admin_ou_dono,
         pg_temp.aba_tem(v.sst, 'Funcionários', null) as funcionarios,
         pg_temp.aba_tem(v.sst, 'Funcionários', 'editar') as funcionarios_editar,
         pg_temp.aba_tem(v.sst, 'Treinamentos EAD', null) as ead,
         pg_temp.aba_tem(v.sst, 'RH', 'criar') as rh_criar,
         pg_temp.aba_tem(v.sst, 'RH', 'deletar') as rh_deletar
    from vinculos v
),
pdfs as (
  select f.empresa_id, count(*) as itens, count(distinct f.id) as funcionarios
    from public.funcionario f
    cross join lateral jsonb_array_elements(public.jsonb_to_array(f.documentos_rh_anexos)) d
   where f.deleted_at is null
     and (d.value ->> 'origem') = 'portal_funcionario'
   group by f.empresa_id
),
linhas as (
  select 0 as ordem,
         'resumo' as categoria,
         a.empresa,
         null::text as usuario_email,
         null::text as perfil,
         count(*) filter (where a.ativo is true) || ' vínculo(s) ativo(s): '
           || count(*) filter (where a.ativo is true and a.admin_ou_dono) || ' Admin/dono, '
           || count(*) filter (where a.ativo is true and not a.admin_ou_dono and a.funcionarios)
           || ' com Funcionários (sem ser Admin/dono), '
           || count(*) filter (where a.ativo is true and not a.admin_ou_dono and a.ead)
           || ' já com a aba Treinamentos EAD, '
           || coalesce(max(p.itens), 0) || ' PDF(s) no portal' as detalhe
    from abas a
    left join pdfs p on p.empresa_id = a.empresa_id
   group by a.empresa_id, a.empresa
  union all
  select 1, 'perderia a aba Treinamentos', a.empresa, a.usuario_email, a.perfil,
         case when a.funcionarios_editar
              then 'aba Treinamentos (editar curso, matricular, publicar...) e liberar tentativa, revogar '
                   || 'certificado e editar resposta de dúvida: tinha Funcionários → Editar'
              else 'aba Treinamentos: tinha só ver Funcionários' end
    from abas a
   where a.ativo is true and not a.admin_ou_dono and a.funcionarios and not a.ead
  union all
  select 2, 'perderia publicar/retirar PDF do portal', a.empresa, a.usuario_email, a.perfil,
         'precisa de RH → Criar (publicar) e RH → Deletar (retirar)'
           || case when a.rh_criar then '; já tem Criar' else '' end
           || case when a.rh_deletar then '; já tem Deletar' else '' end
    from abas a
   where a.ativo is true and not a.admin_ou_dono and a.funcionarios and not (a.rh_criar and a.rh_deletar)
  union all
  select 3, 'vínculo com ativo nulo (o banco vai recusar)', a.empresa, a.usuario_email, a.perfil,
         'a 0147 só aceita vínculo com ativo = true: confira o usuário em Configurações → Usuários'
    from abas a
   where a.ativo is null
  union all
  select 4, 'permissões gravadas como texto JSON', a.empresa, a.usuario_email, a.perfil,
         case when a.sst is null then 'sem Segurança do Trabalho (ou texto ilegível): o banco lê como sem permissão'
              else 'o banco lê o texto como o servidor já lê' end
    from abas a
   where a.formato = 'string' and a.ativo is not false and not a.admin_ou_dono
  union all
  select 5, 'PDFs publicados no portal', e.nome, null, null,
         p.itens || ' PDF(s) em ' || p.funcionarios || ' funcionário(s): continuam valendo'
    from pdfs p
    join public.empresa e on e.id = p.empresa_id
)
select categoria, empresa, usuario_email, perfil, detalhe
  from linhas
 order by ordem, empresa, usuario_email;
