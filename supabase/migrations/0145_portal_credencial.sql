-- ============================================================================
-- 0145 — Portal do Funcionário: um login (CPF e senha) em mais de uma empresa (T38)
--
-- Por quê: o acesso ao portal era uma linha de funcionario_portal_acesso por funcionário, com o usuário (o CPF)
-- ÚNICO no sistema inteiro (0103). Quem trabalha em duas empresas clientes só tinha acesso numa, e o RH da
-- segunda recebia 409 "o usuário <CPF> já está em uso", que confirmava o CPF em outro inquilino. Decisão D16 e
-- spec aprovado em 07/10/2026 (docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md): a pessoa tem
-- UMA senha, que abre o portal em cada empresa em que tem cadastro ativo; ela escolhe a empresa ao entrar; a
-- senha provisória é por empresa e vence em 7 dias.
--
-- O que esta migração faz:
--   1. portal_credencial (a PESSOA: usuário, senha, geração da senha, empresa de origem da senha, versão da
--      sessão, bloqueio, relógio do progresso). Sem empresa_id: é a identidade da pessoa na plataforma, como
--      auth.users (exceção declarada à regra 5 do AGENTS.md). Só o servidor lê e grava: RLS ligada, sem policy,
--      sem privilégio para anon e authenticated. O usuário é único em lower(usuario).
--   2. portal_credencial_evento: o registro do operador (eventos que, na trilha de uma empresa, contariam ao RH o
--      que a pessoa faz em outra). Só de inclusão, com o mesmo trigger da trilha (trilha_imutavel, 0135). Sem
--      chave estrangeira para a credencial e sem o CPF: o registro fica quando a credencial some.
--   3. funcionario_portal_acesso vira o VÍNCULO (um por cadastro de funcionário): credencial_id, provisória
--      pendente (hash, criação, vencimento), geracao_liberada e confirmado_em; índice único parcial "um vínculo
--      ATIVO por pessoa e empresa". usuario e senha_hash deixam de ser obrigatórios: o código novo não grava mais
--      nessas colunas. O ÍNDICE ÚNICO GLOBAL DO USUÁRIO FICA ATÉ A 0146: na janela entre esta migração e o deploy,
--      a versão antiga continua barrada por ele (o criar antigo recebe o 409 de hoje e o login antigo acha uma linha
--      por CPF). funcionario_portal_acesso também perde o privilégio de authenticated (nunca teve policy).
--   4. Trigger: credencial sem nenhum vínculo é apagada (exclusão física do vínculo, ou religação do caso 7). A
--      exclusão LÓGICA do funcionário não apaga nada (retenção é a D11).
--   5. Cópia dos acessos existentes (P7), um para um, por portal_credencial_copiar_acessos() (a 0146 repete):
--        - tipo 'cpf' quando o usuário (só dígitos, 11) é o CPF do cadastro; qualquer outro = 'manual';
--        - senha pessoal (senha_provisoria = false): a credencial recebe o hash, geração 1 e origem = a empresa do
--          acesso; o vínculo fica liberado na geração 1, confirmado no último acesso (ou agora);
--        - provisória pendente: credencial SEM senha (geração 0); o hash antigo vira a provisória do vínculo, SEM
--          vencimento (a já entregue continua valendo).
--      Grava em linhas reais: é a exceção aprovada (P7), em dado de acesso, não de negócio.
--   6. portal_credencial_redefinir_pelo_operador(): o procedimento do operador (§4.3 do spec, P11), que o suporte
--      do SIGO roda pelo tools/portal-credencial-redefinir.sql. SECURITY DEFINER, sem EXECUTE para ninguém da API.
--
-- ANTES de aplicar, o Javerson roda a conferência SÓ DE LEITURA e leva o resultado:
--   supabase db query --linked -f tools/portal-credencial-conferir.sql
-- Ela lista: acesso com usuário só de dígitos que não é o CPF do cadastro (vira 'manual'), CPF que coincide com
-- usuário de outro acesso (o 'manual' legado de 11 dígitos que o criar novo recusaria), CPF repetido entre
-- cadastros com acesso, CPF do cadastro com dígito verificador errado e hash de senha que não é bcrypt (o login
-- novo só aceita bcrypt). Se a lista não vier vazia, decida antes (pela tela) o que fazer com cada linha.
--
-- Produção, na ordem (o spec, §9.3):
--   1. esta migração:  supabase db query --linked -f supabase/migrations/0145_portal_credencial.sql
--   2. LOGO EM SEGUIDA, deploy de portal-funcionario e de funcionario-acesso (os dois com --no-verify-jwt);
--   3. push do front no mesmo dia (o primeiro acesso mudou de forma: etapa "ativar");
--   4. dias depois, conferido o uso: 0146.
-- Smoke (begin ... rollback): supabase db query --linked -f tools/smoke-portal-credencial.sql
--
-- Idempotente: create if not exists, constraints em blocos que ignoram duplicate_object, create or replace e a
-- cópia só pega linhas sem credencial_id.
-- ============================================================================

begin;

-- 1. A pessoa ------------------------------------------------------------------------------------------------
create table if not exists public.portal_credencial (
  id uuid primary key default gen_random_uuid(),
  -- o CPF (só dígitos) ou o usuário com letras, sempre minúsculo e sem espaço nas pontas
  usuario text not null,
  tipo text not null,
  -- nulo até a pessoa criar a senha (primeiro acesso)
  senha_hash text,
  -- sobe de 1 cada vez que a senha é CRIADA com uma provisória; a troca informando a atual não sobe
  senha_geracao integer not null default 0,
  -- a empresa cuja provisória criou a senha atual (o RH dela pode conhecê-la). Sem chave estrangeira de propósito:
  -- apagar a empresa não pode zerar a origem (zerar libera as outras empresas sem a troca do caso 2)
  senha_origem_empresa_id uuid,
  -- sobe para derrubar as sessões de TODAS as empresas (token: vc)
  sessao_versao integer not null default 1,
  tentativas integer not null default 0,
  bloqueado_ate timestamptz,
  -- relógio do progresso por PESSOA (T31, T35): duas empresas ao mesmo tempo não somam o dobro
  ultimo_sinal_em timestamptz,
  senha_alterada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $chk$ begin
  alter table public.portal_credencial
    add constraint portal_credencial_tipo_chk check (tipo in ('cpf', 'manual'));
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.portal_credencial
    add constraint portal_credencial_usuario_chk check (usuario <> '' and usuario = lower(btrim(usuario)));
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.portal_credencial
    add constraint portal_credencial_cpf_chk check (tipo <> 'cpf' or usuario ~ '^[0-9]{11}$');
exception when duplicate_object then null; end $chk$;

do $chk$ begin
  alter table public.portal_credencial
    add constraint portal_credencial_geracao_chk check (senha_geracao >= 0);
exception when duplicate_object then null; end $chk$;

create unique index if not exists portal_credencial_usuario_uidx
  on public.portal_credencial (lower(usuario));
select attach_updated_at_trigger('portal_credencial');
alter table public.portal_credencial enable row level security;
revoke all on public.portal_credencial from anon, authenticated;

comment on table public.portal_credencial is
  'T38: a pessoa no Portal do Funcionário (um login em todas as empresas). Só o servidor lê e grava.';

-- 2. O registro do operador ------------------------------------------------------------------------------------
create table if not exists public.portal_credencial_evento (
  id bigint generated always as identity primary key,
  -- sem chave estrangeira e sem o CPF: o registro fica quando a credencial é apagada
  credencial_id uuid not null,
  -- a empresa do vínculo que agiu (nulo quando nenhum agiu, como a senha errada no login)
  empresa_id uuid,
  evento text not null,
  detalhe jsonb,
  ip text,
  dispositivo text,
  created_at timestamptz not null default now()
);
create index if not exists portal_credencial_evento_credencial_idx
  on public.portal_credencial_evento (credencial_id, created_at);
create index if not exists portal_credencial_evento_evento_idx
  on public.portal_credencial_evento (evento, created_at);
alter table public.portal_credencial_evento enable row level security;
revoke all on public.portal_credencial_evento from anon, authenticated;

-- só de inclusão, como a trilha (0135: a mesma função e a mesma saída sigo.permitir_expurgo)
drop trigger if exists trilha_imutavel on public.portal_credencial_evento;
create trigger trilha_imutavel
  before update or delete on public.portal_credencial_evento
  for each row execute function public.trilha_imutavel();
drop trigger if exists trilha_imutavel_truncate on public.portal_credencial_evento;
create trigger trilha_imutavel_truncate
  before truncate on public.portal_credencial_evento
  for each statement execute function public.trilha_imutavel();

comment on table public.portal_credencial_evento is
  'T38: registro do operador (suporte do SIGO). Só de inclusão; nenhuma empresa lê.';

-- 3. O vínculo -------------------------------------------------------------------------------------------------
alter table public.funcionario_portal_acesso
  add column if not exists credencial_id uuid,
  add column if not exists provisoria_hash text,
  add column if not exists provisoria_criada_em timestamptz,
  add column if not exists provisoria_expira_em timestamptz,
  add column if not exists geracao_liberada integer,
  add column if not exists confirmado_em timestamptz;

do $fk$ begin
  alter table public.funcionario_portal_acesso
    add constraint funcionario_portal_acesso_credencial_fk
    foreign key (credencial_id) references public.portal_credencial (id) on delete restrict;
exception when duplicate_object then null; end $fk$;

create index if not exists funcionario_portal_acesso_credencial_idx
  on public.funcionario_portal_acesso (credencial_id);
-- um vínculo ATIVO por pessoa e empresa (a readmissão desativa o velho antes de criar o novo)
create unique index if not exists funcionario_portal_acesso_credencial_empresa_uidx
  on public.funcionario_portal_acesso (credencial_id, empresa_id)
  where ativo;

-- o código novo não grava mais usuário nem senha no vínculo (o índice único global do usuário fica até a 0146)
alter table public.funcionario_portal_acesso alter column usuario drop not null;
alter table public.funcionario_portal_acesso alter column senha_hash drop not null;
revoke all on public.funcionario_portal_acesso from anon, authenticated;

-- 4. Credencial sem vínculo é apagada --------------------------------------------------------------------------
-- LGPD (minimização): CPF e hash não ficam guardados sem motivo. Dispara na exclusão física do vínculo (inclusive
-- em cascata, pela exclusão física do funcionário) e quando o vínculo muda de credencial (religação do caso 7). A
-- única credencial sem vínculo que sobra é a de um "criar" cujo vínculo falhou ao gravar (as funções não apagam
-- linha alguma): sem senha, ela é reaproveitada pelo próximo "criar" do mesmo usuário.
create or replace function public.portal_credencial_sem_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.credencial_id is not distinct from old.credencial_id then
    return null;
  end if;
  if old.credencial_id is not null then
    delete from public.portal_credencial c
     where c.id = old.credencial_id
       and not exists (
         select 1 from public.funcionario_portal_acesso v where v.credencial_id = c.id
       );
  end if;
  return null;
end;
$$;

revoke all on function public.portal_credencial_sem_vinculo() from public, anon, authenticated;

drop trigger if exists portal_credencial_sem_vinculo on public.funcionario_portal_acesso;
create trigger portal_credencial_sem_vinculo
  after delete or update of credencial_id on public.funcionario_portal_acesso
  for each row execute function public.portal_credencial_sem_vinculo();

-- 5. A cópia dos acessos existentes ----------------------------------------------------------------------------
-- Uma função, para a 0146 repetir a MESMA cópia nas linhas que a versão antiga criou na janela do deploy. Lá pode
-- já existir credencial do mesmo CPF (criada pelo código novo em outra empresa): a linha é LIGADA a ela como
-- vínculo novo (sem liberação e sem confirmação; a provisória pendente continua valendo) e, se a pessoa já tem
-- vínculo ativo naquela empresa, fica desativada. Usuário com letras que colide com credencial existente, ou CPF
-- que colide com credencial de outro tipo, PARA a migração (nada é aplicado) e diz qual linha é.
create or replace function public.portal_credencial_copiar_acessos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_usuario text;
  v_tipo text;
  v_cred uuid;
  v_existente record;
  v_n integer := 0;
begin
  for r in
    select a.funcionario_id, a.empresa_id, a.usuario, a.senha_hash, a.senha_provisoria, a.tentativas,
           a.bloqueado_ate, a.ultimo_sinal_em, a.ultimo_acesso, a.created_at, a.updated_at,
           regexp_replace(coalesce(f.cpf, ''), '[^0-9]', '', 'g') as cpf_digitos
      from public.funcionario_portal_acesso a
      left join public.funcionario f on f.id = a.funcionario_id
     where a.credencial_id is null
     order by a.created_at, a.funcionario_id
       for update of a
  loop
    v_usuario := lower(btrim(coalesce(r.usuario, '')));
    if v_usuario = '' then
      raise exception 'Acesso do funcionário % sem usuário: corrija antes de aplicar', r.funcionario_id;
    end if;
    v_tipo := case
      when v_usuario ~ '^[0-9]{11}$' and v_usuario = r.cpf_digitos then 'cpf'
      else 'manual'
    end;

    select c.id, c.tipo into v_existente
      from public.portal_credencial c
     where lower(c.usuario) = v_usuario;

    if found then
      if v_tipo <> 'cpf' or v_existente.tipo <> 'cpf' then
        raise exception
          'O acesso do funcionário % tem o usuário de uma credencial que já existe (tipo %): resolva antes',
          r.funcionario_id, v_existente.tipo;
      end if;
      update public.funcionario_portal_acesso a
         set credencial_id = v_existente.id,
             provisoria_hash = case when r.senha_provisoria then r.senha_hash end,
             provisoria_criada_em = case when r.senha_provisoria then coalesce(r.updated_at, r.created_at) end,
             provisoria_expira_em = null,
             geracao_liberada = null,
             confirmado_em = null,
             ativo = a.ativo and not exists (
               select 1 from public.funcionario_portal_acesso o
                where o.credencial_id = v_existente.id
                  and o.empresa_id = r.empresa_id
                  and o.ativo
                  and o.funcionario_id <> r.funcionario_id
             )
       where a.funcionario_id = r.funcionario_id;
    else
      insert into public.portal_credencial (
        usuario, tipo, senha_hash, senha_geracao, senha_origem_empresa_id, tentativas, bloqueado_ate,
        ultimo_sinal_em
      ) values (
        v_usuario,
        v_tipo,
        case when r.senha_provisoria then null else r.senha_hash end,
        case when r.senha_provisoria then 0 else 1 end,
        case when r.senha_provisoria then null else r.empresa_id end,
        coalesce(r.tentativas, 0),
        r.bloqueado_ate,
        r.ultimo_sinal_em
      )
      returning id into v_cred;

      update public.funcionario_portal_acesso a
         set credencial_id = v_cred,
             provisoria_hash = case when r.senha_provisoria then r.senha_hash end,
             provisoria_criada_em = case when r.senha_provisoria then coalesce(r.updated_at, r.created_at) end,
             provisoria_expira_em = null,
             geracao_liberada = case when r.senha_provisoria then null else 1 end,
             confirmado_em = case when r.senha_provisoria then null else coalesce(r.ultimo_acesso, now()) end
       where a.funcionario_id = r.funcionario_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.portal_credencial_copiar_acessos() from public, anon, authenticated;

-- 6. O procedimento do operador (§4.3 do spec; P11) ------------------------------------------------------------
-- Para o CPF ocupado antes pela empresa errada, para quem esqueceu a senha e não entra mais em nenhuma empresa e
-- para o CPF digitado errado que ocupou a credencial de outra pessoa. Quem pede é o RH da empresa em que a pessoa
-- trabalha hoje; o operador (suporte do SIGO) confirma COM A PRÓPRIA PESSOA, por um canal que não passa pelo RH
-- que pediu, quem ela é e qual é a empresa dela (revisão 3, m2), e grava quem pediu e como confirmou. Numa
-- transação só:
--   1. as empresas que estavam liberadas (menos as ocupantes) recebem acesso_aguardando_provisoria na trilha;
--   2. a senha vira o bcrypt de um segredo aleatório que ninguém guarda (a credencial continua "com senha": não
--      existe a janela em que qualquer vínculo cria a primeira senha); zera a origem e o bloqueio; sobe a geração
--      e a versão da sessão (as sessões de todas as empresas caem);
--   3. todos os vínculos ficam sem liberação, sem confirmação e sem provisória pendente; só o da empresa conferida
--      fica confirmado (só a provisória NOVA dela cria a senha);
--   4. o vínculo de cada empresa ocupante é desativado (sessões caem) e a trilha dela recebe acesso_desativado
--      "por suporte do SIGO";
--   5. grava credencial_redefinida_pelo_operador no registro do operador.
-- Não muda nada (erro) se faltar quem pediu ou a confirmação, se a credencial não existe, se a empresa conferida
-- não tem vínculo ativo de cadastro ativo com ela ou se alguma ocupante não tem vínculo com ela.
create or replace function public.portal_credencial_redefinir_pelo_operador(
  p_usuario text,
  p_empresa_conferida uuid,
  p_ocupantes uuid[],
  p_pedido_por text,
  p_confirmado_com text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text;
  v_cred public.portal_credencial%rowtype;
  v_ocupantes uuid[] := coalesce(p_ocupantes, '{}'::uuid[]);
  v_ocupante uuid;
  v_travados integer := 0;
  v_zerados integer := 0;
  v_desativados integer := 0;
  r record;
begin
  if coalesce(btrim(p_pedido_por), '') = '' or coalesce(btrim(p_confirmado_com), '') = '' then
    raise exception
      'Informe quem pediu (p_pedido_por) e como a própria pessoa confirmou, fora do RH que pediu (p_confirmado_com)';
  end if;
  if p_empresa_conferida is null then
    raise exception 'Informe a empresa conferida';
  end if;
  if p_empresa_conferida = any (v_ocupantes) then
    raise exception 'A empresa conferida não pode estar entre as ocupantes';
  end if;

  -- o mesmo normalizarUsuario do portal: CPF com pontuação vira só dígitos; o resto, minúsculo e sem espaços
  v_usuario := btrim(coalesce(p_usuario, ''));
  v_usuario := case
    when v_usuario ~ '^[-0-9./[:space:]]+$' then regexp_replace(v_usuario, '[^0-9]', '', 'g')
    else lower(v_usuario)
  end;

  select * into v_cred from public.portal_credencial where lower(usuario) = v_usuario for update;
  if not found then
    raise exception 'Credencial não encontrada para o usuário informado: nada foi alterado';
  end if;

  if not exists (
    select 1
      from public.funcionario_portal_acesso v
      join public.funcionario f on f.id = v.funcionario_id and f.empresa_id = v.empresa_id
     where v.credencial_id = v_cred.id
       and v.empresa_id = p_empresa_conferida
       and v.ativo
       and coalesce(f.ativo, true)
       and f.deleted_at is null
  ) then
    raise exception
      'A empresa conferida não tem vínculo ativo, de cadastro ativo, com esta credencial: nada foi alterado';
  end if;

  foreach v_ocupante in array v_ocupantes loop
    if not exists (
      select 1 from public.funcionario_portal_acesso v
       where v.credencial_id = v_cred.id and v.empresa_id = v_ocupante
    ) then
      raise exception 'A empresa ocupante % não tem vínculo com esta credencial: nada foi alterado', v_ocupante;
    end if;
  end loop;

  -- 1. as que estavam liberadas (menos as ocupantes) passam a pedir provisória: avisa a trilha delas
  if v_cred.senha_hash is not null then
    for r in
      select v.funcionario_id, v.empresa_id
        from public.funcionario_portal_acesso v
       where v.credencial_id = v_cred.id
         and v.ativo
         and v.geracao_liberada = v_cred.senha_geracao
         and not (v.empresa_id = any (v_ocupantes))
    loop
      insert into public.treinamento_evento (empresa_id, funcionario_id, evento, detalhe)
      values (r.empresa_id, r.funcionario_id, 'acesso_aguardando_provisoria',
              jsonb_build_object('motivo', 'suporte'));
      v_travados := v_travados + 1;
    end loop;
  end if;

  -- 2. senha que ninguém conhece, origem e bloqueio zerados, todas as sessões derrubadas
  update public.portal_credencial
     set senha_hash = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)),
         senha_origem_empresa_id = null,
         tentativas = 0,
         bloqueado_ate = null,
         senha_geracao = senha_geracao + 1,
         sessao_versao = sessao_versao + 1,
         senha_alterada_em = now()
   where id = v_cred.id;

  -- 3. ninguém liberado nem confirmado, nenhuma provisória pendente; só a conferida fica confirmada
  update public.funcionario_portal_acesso
     set geracao_liberada = null,
         confirmado_em = null,
         provisoria_hash = null,
         provisoria_criada_em = null,
         provisoria_expira_em = null
   where credencial_id = v_cred.id;
  get diagnostics v_zerados = row_count;

  update public.funcionario_portal_acesso
     set confirmado_em = now()
   where credencial_id = v_cred.id
     and empresa_id = p_empresa_conferida
     and ativo;

  -- 4. as ocupantes perdem o vínculo (e as sessões); a trilha delas diz que foi o suporte
  for r in
    select v.funcionario_id, v.empresa_id
      from public.funcionario_portal_acesso v
     where v.credencial_id = v_cred.id
       and v.empresa_id = any (v_ocupantes)
       and v.ativo
  loop
    insert into public.treinamento_evento (empresa_id, funcionario_id, evento, detalhe)
    values (r.empresa_id, r.funcionario_id, 'acesso_desativado', jsonb_build_object('por', 'suporte do SIGO'));
  end loop;
  update public.funcionario_portal_acesso
     set ativo = false,
         sessao_versao = sessao_versao + 1
   where credencial_id = v_cred.id
     and empresa_id = any (v_ocupantes)
     and ativo;
  get diagnostics v_desativados = row_count;

  -- 5. o registro do operador (sem o CPF)
  insert into public.portal_credencial_evento (credencial_id, empresa_id, evento, detalhe)
  values (
    v_cred.id,
    p_empresa_conferida,
    'credencial_redefinida_pelo_operador',
    jsonb_build_object(
      'empresa_conferida', p_empresa_conferida,
      'ocupantes', to_jsonb(v_ocupantes),
      'pedido_por', btrim(p_pedido_por),
      'confirmado_com', btrim(p_confirmado_com)
    )
  );

  return jsonb_build_object(
    'credencial_id', v_cred.id,
    'vinculos_zerados', v_zerados,
    'empresas_avisadas', v_travados,
    'ocupantes_desativados', v_desativados
  );
end;
$$;

revoke all on function public.portal_credencial_redefinir_pelo_operador(text, uuid, uuid[], text, text)
  from public, anon, authenticated;

-- 7. A cópia ---------------------------------------------------------------------------------------------------
select public.portal_credencial_copiar_acessos();

commit;

select 'ok' as res;
