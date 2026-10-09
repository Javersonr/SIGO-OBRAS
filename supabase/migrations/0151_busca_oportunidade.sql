-- ============================================================================
-- 0151_busca_oportunidade.sql — busca de oportunidades sem acento para o conector do Claude (08/10/2026)
--   (Plano 2 do conector, T8; spec docs/superpowers/specs/2026-09-25-conector-claude-editais-design.md §5)
--
-- Por quê: o Claude precisa achar a oportunidade de um edital antes de criar outra (duplicatas) e quando o
-- usuário pede "a de Joanópolis". As 4.140 oportunidades antigas têm o nº do edital só no nome ("PE 012/2026 -
-- ... Joanópolis/SP") e o banco não tem a extensão unaccent. O PostgREST não faz "cada palavra sem acento em
-- qualquer coluna" nem "012/2026 = 12.2026"; por isso a busca é uma RPC.
--
-- O que faz: public.conector_buscar_oportunidades(p_empresa_id, p_texto, p_numero, p_ano, p_limite) devolve as
-- oportunidades vivas (deleted_at is null) DA EMPRESA do parâmetro, das mais novas para as mais antigas:
--   - p_texto: cada palavra com 3 ou mais letras/dígitos de sem_acento(p_texto) tem de aparecer em
--     sem_acento(nome, descricao, orgao, cidade, licitacao_numero, licitacao_processo);
--   - p_numero + p_ano: o mesmo texto tem "<nº>/<ano>", com "/", "." ou "-", zeros à esquerda e espaços livres,
--     sem dígito colado antes do nº nem depois do ano ("012/2026" acha "12.2026" e não acha "112/2026");
--   - os dois juntos: as duas condições; nenhum dos dois: nenhuma linha;
--   - p_numero e p_ano andam juntos e só com dígitos (até 6 e 4); senão 22023;
--   - p_limite entre 1 e 50 (padrão 20).
-- O critério de "mesmo local" das duplicatas fica no TypeScript (_shared/edital/duplicatas.ts).
--
-- Só o servidor executa (o conector chama pela CamadaEmpresa, que injeta p_empresa_id da chave). Depende da 0149
-- (public.sem_acento). Idempotente (create or replace).
-- ============================================================================

create or replace function public.conector_buscar_oportunidades(
  p_empresa_id uuid,
  p_texto text default null,
  p_numero text default null,
  p_ano text default null,
  p_limite int default 20
)
returns table(
  id uuid,
  nome text,
  descricao text,
  licitacao_numero text,
  licitacao_processo text,
  orgao text,
  cidade text,
  estado text,
  status_nome text,
  licitacao_data date,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_palavras text[];
  v_padrao text;
begin
  if not public.chamador_eh_servidor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_empresa_id is null then
    raise exception 'p_empresa_id é obrigatório' using errcode = '22023';
  end if;
  if (p_numero is null) <> (p_ano is null) then
    raise exception 'Informe o número e o ano juntos' using errcode = '22023';
  end if;
  if p_numero is not null then
    if p_numero !~ '^\d{1,6}$' or p_ano !~ '^\d{4}$' then
      raise exception 'Número (até 6 dígitos) ou ano (4 dígitos) inválido' using errcode = '22023';
    end if;
    v_padrao := '(^|[^0-9])0*' || coalesce(nullif(ltrim(p_numero, '0'), ''), '0')
             || '\s*[/.-]\s*' || p_ano || '([^0-9]|$)';
  end if;

  select coalesce(array_agg(distinct w), '{}') into v_palavras
    from regexp_split_to_table(public.sem_acento(left(p_texto, 200)), '[^a-z0-9]+') as w
   where length(w) >= 3;

  if v_padrao is null and cardinality(v_palavras) = 0 then
    return; -- sem filtro, nada: a ferramenta exige texto ou nº/ano
  end if;

  return query
    select o.id, o.nome, o.descricao, o.licitacao_numero, o.licitacao_processo, o.orgao,
           o.cidade, o.estado, o.status_nome, o.licitacao_data, o.created_at
      from public.oportunidade o
      cross join lateral (
        select public.sem_acento(concat_ws(' ', o.nome, o.descricao, o.orgao, o.cidade,
                                           o.licitacao_numero, o.licitacao_processo)) as alvo
      ) t
     where o.empresa_id = p_empresa_id
       and o.deleted_at is null
       and (v_padrao is null or t.alvo ~ v_padrao)
       and not exists (select 1 from unnest(v_palavras) as p(palavra) where position(p.palavra in t.alvo) = 0)
     order by o.created_at desc, o.id
     limit least(greatest(coalesce(p_limite, 20), 1), 50);
end;
$$;

revoke all on function public.conector_buscar_oportunidades(uuid, text, text, text, int)
  from public, anon, authenticated;
grant execute on function public.conector_buscar_oportunidades(uuid, text, text, text, int) to service_role;

select 'ok' as res;
