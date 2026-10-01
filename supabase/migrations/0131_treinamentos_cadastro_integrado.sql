-- 0131 — vincule as exigências das funções e os cursos EAD ao cadastro central.
-- Não altere certificados, datas de realização, anexos ou matrículas existentes.
-- Vínculos legados só são inferidos quando código, nome e dados pedagógicos
-- coincidem com exatamente um modelo da mesma empresa. Divergências exigem revisão.

begin;

alter table public.treinamento
  add column if not exists modelo_treinamento_id uuid references public.treinamento(id);
alter table public.treinamento_curso
  add column if not exists modelo_treinamento_id uuid references public.treinamento(id);
create index if not exists treinamento_modelo_idx on public.treinamento(modelo_treinamento_id);
create index if not exists treinamento_curso_modelo_idx on public.treinamento_curso(modelo_treinamento_id);

-- A origem nunca é uma cópia de função ou um modelo de outra empresa.
create or replace function public.validar_modelo_de_treinamento()
returns trigger language plpgsql set search_path = public as $$
declare modelo public.treinamento%rowtype;
begin
  if new.modelo_treinamento_id is null then return new; end if;
  select * into modelo from public.treinamento
    where id = new.modelo_treinamento_id and empresa_id = new.empresa_id
      and funcao_id is null and modelo_treinamento_id is null and deleted_at is null;
  if not found then
    raise exception 'Selecione um treinamento do cadastro central da mesma empresa' using errcode = '42501';
  end if;
  if tg_table_name = 'treinamento' and new.id = modelo.id then
    raise exception 'Um treinamento não pode ser seu próprio modelo';
  end if;
  new.nome := modelo.nome;
  new.codigo := modelo.codigo;
  new.validade_meses := modelo.validade_meses;
  new.conteudo_programatico := modelo.conteudo_programatico;
  if tg_table_name = 'treinamento' then
    new.carga_horaria := modelo.carga_horaria;
    new.instrutor_nome := modelo.instrutor_nome;
    new.instrutor_cpf := modelo.instrutor_cpf;
    new.instrutor_assinatura_url := modelo.instrutor_assinatura_url;
    new.responsavel_tecnico_nome := modelo.responsavel_tecnico_nome;
    new.responsavel_tecnico_criacao := modelo.responsavel_tecnico_criacao;
    new.responsavel_tecnico_assinatura_url := modelo.responsavel_tecnico_assinatura_url;
    new.engenheiro_responsavel_nome := modelo.engenheiro_responsavel_nome;
    new.engenheiro_responsavel_crea := modelo.engenheiro_responsavel_crea;
    new.engenheiro_responsavel_assinatura_url := modelo.engenheiro_responsavel_assinatura_url;
    if modelo.ativo is false then new.ativo := false; end if;
  else
    new.carga_horaria_horas := modelo.carga_horaria;
    -- Pessoas do EAD têm qualificação e registro próprios: o vínculo preserva
    -- esses campos. Só a identidade pedagógica vem do cadastro central.
    if modelo.ativo is false then new.ativo := false; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validar_modelo_de_treinamento() from public, anon, authenticated;

drop trigger if exists referencias_da_empresa_modelo on public.treinamento;
create trigger referencias_da_empresa_modelo before insert or update on public.treinamento
  for each row execute function public.exigir_referencias_da_empresa('modelo_treinamento_id:treinamento');
drop trigger if exists referencias_da_empresa_modelo on public.treinamento_curso;
create trigger referencias_da_empresa_modelo before insert or update on public.treinamento_curso
  for each row execute function public.exigir_referencias_da_empresa('modelo_treinamento_id:treinamento');
drop trigger if exists sincronizar_modelo on public.treinamento;
create trigger sincronizar_modelo before insert or update on public.treinamento
  for each row execute function public.validar_modelo_de_treinamento();
drop trigger if exists sincronizar_modelo on public.treinamento_curso;
create trigger sincronizar_modelo before insert or update on public.treinamento_curso
  for each row execute function public.validar_modelo_de_treinamento();

create or replace function public.propagar_modelo_de_treinamento()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.funcao_id is not null or new.modelo_treinamento_id is not null then return new; end if;
  -- Executa com as permissões do chamador, respeitando RLS. As cópias são
  -- sincronizadas pelo trigger anterior, dentro da mesma transação.
  update public.treinamento set modelo_treinamento_id = new.id
    where modelo_treinamento_id = new.id and empresa_id = new.empresa_id and deleted_at is null;
  update public.treinamento_curso set modelo_treinamento_id = new.id
    where modelo_treinamento_id = new.id and empresa_id = new.empresa_id and deleted_at is null;
  return new;
end;
$$;
revoke all on function public.propagar_modelo_de_treinamento() from public, anon, authenticated;
drop trigger if exists propagar_modelo on public.treinamento;
create trigger propagar_modelo after update of nome, codigo, carga_horaria, validade_meses,
  conteudo_programatico, instrutor_nome, instrutor_cpf, instrutor_assinatura_url,
  responsavel_tecnico_nome, responsavel_tecnico_criacao, responsavel_tecnico_assinatura_url,
  engenheiro_responsavel_nome, engenheiro_responsavel_crea, engenheiro_responsavel_assinatura_url,
  ativo on public.treinamento
  for each row execute function public.propagar_modelo_de_treinamento();

-- Evite apagar a origem pedagógica enquanto houver cópias ou cursos em uso.
create or replace function public.proteger_modelo_de_treinamento()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.deleted_at is not null or new.funcao_id is not null or new.modelo_treinamento_id is not null
      or new.empresa_id is distinct from old.empresa_id)
    and exists (
      select 1 from public.treinamento where modelo_treinamento_id = old.id and empresa_id = old.empresa_id
      union all
      select 1 from public.treinamento_curso where modelo_treinamento_id = old.id and empresa_id = old.empresa_id
    ) then
    raise exception 'Este modelo possui funções ou cursos vinculados. Desative-o ou revise os vínculos antes de excluir';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_modelo_de_treinamento() from public, anon, authenticated;
drop trigger if exists proteger_modelo on public.treinamento;
create trigger proteger_modelo before update of deleted_at, funcao_id, modelo_treinamento_id, empresa_id on public.treinamento
  for each row execute function public.proteger_modelo_de_treinamento();

with candidatos as (
  select t.id, min(m.id::text)::uuid as modelo_id
  from public.treinamento t join public.treinamento m
    on m.empresa_id = t.empresa_id and m.id <> t.id
    and m.funcao_id is null and m.modelo_treinamento_id is null
    and m.deleted_at is null and m.ativo is not false
    and nullif(lower(btrim(m.codigo)), '') = nullif(lower(btrim(t.codigo)), '')
    and lower(btrim(m.nome)) = lower(btrim(t.nome))
    and m.carga_horaria is not distinct from t.carga_horaria
    and m.validade_meses is not distinct from t.validade_meses
    and coalesce(m.conteudo_programatico, '') = coalesce(t.conteudo_programatico, '')
  where t.funcao_id is not null and t.modelo_treinamento_id is null and t.deleted_at is null
  group by t.id having count(*) = 1
)
update public.treinamento t set modelo_treinamento_id = c.modelo_id from candidatos c where t.id = c.id;

with candidatos as (
  select t.id, min(m.id::text)::uuid as modelo_id
  from public.treinamento_curso t join public.treinamento m
    on m.empresa_id = t.empresa_id and m.funcao_id is null and m.modelo_treinamento_id is null
    and m.deleted_at is null and m.ativo is not false
    and nullif(lower(btrim(m.codigo)), '') = nullif(lower(btrim(t.codigo)), '')
    and lower(btrim(m.nome)) = lower(btrim(t.nome))
    and m.carga_horaria is not distinct from t.carga_horaria_horas
    and m.validade_meses is not distinct from t.validade_meses
    and coalesce(m.conteudo_programatico, '') = coalesce(t.conteudo_programatico, '')
  where t.modelo_treinamento_id is null and t.deleted_at is null
  group by t.id having count(*) = 1
)
update public.treinamento_curso t set modelo_treinamento_id = c.modelo_id from candidatos c where t.id = c.id;

commit;
select 'ok' as res;
