-- 0134 — Ciência de entrega (EPI, ferramenta, documento): confirmação só pelo servidor
--
-- A ciência é a assinatura eletrônica simples do funcionário (Lei 14.063/2020) e o registro de
-- entrega de EPI aceito pela NR-6 (item 6.7.2). Quem dá a ciência é o Portal do Funcionário, pela
-- Edge Function portal-funcionario (service role), que grava status "confirmada", a data e a
-- evidência (login pessoal, IP e dispositivo). Só que a policy "tenant_isolation" da tabela
-- (ALL, empresa_id = current_empresa_id(), 0101) deixava qualquer usuário da empresa gravar o
-- mesmo por /rest/v1: ciência "dada" sem o funcionário, com evidência inventada. É o mesmo buraco
-- que a 0130 fechou no andamento do treinamento.
--
-- O app (FichaFuncionarioSheet) só faz EntregaCiencia.create({empresa_id, funcionario_id, tipo,
-- descricao, criada_por}) e leitura. A confirmação é do portal-funcionario, que agora também só
-- confirma uma entrega pendente (UPDATE com status = 'pendente'): uma 2ª aba não sobrescreve a
-- evidência da 1ª.
--
-- Agora, fora do servidor/super admin:
--   - INSERT: a entrega nasce pendente, sem data de confirmação nem evidência, e com a data de
--     criação do servidor (sem entrega "antiga" para dar ar de anterioridade);
--   - UPDATE: só deleted_at (excluir = exclusão lógica do SDK) e updated_at; enquanto a entrega
--     está pendente, também tipo, descricao e itens (corrigir o que foi registrado). Confirmada,
--     a linha só pode ser excluída logicamente: a evidência fica no banco;
--   - sem DELETE nem TRUNCATE de verdade (apagaria a prova da entrega);
--   - anon não precisa de nada na tabela (o portal passa pela Edge Function).

begin;

revoke all on public.entrega_ciencia from anon;
revoke delete, truncate on public.entrega_ciencia from authenticated;

create or replace function public.entrega_ciencia_so_servidor()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() não é executável por authenticated (0110)
set search_path = public
as $$
declare
  -- o que a empresa pode mudar numa entrega existente (deleted_at = excluir)
  livres_sempre constant text[] := array['deleted_at', 'updated_at'];
  -- ... e, enquanto ninguém deu ciência, o que foi registrado na entrega
  livres_pendente constant text[] := array['tipo', 'descricao', 'itens'];
  livres text[] := livres_sempre;
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- a ciência nasce pendente: quem confirma é o portal-funcionario
    new.status := 'pendente';
    new.confirmada_em := null;
    new.evidencia := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'pendente' then
    livres := livres_sempre || livres_pendente;
  end if;

  if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    raise exception 'Acesso negado: a ciência da entrega só é confirmada pelo funcionário, no Portal do Funcionário'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.entrega_ciencia_so_servidor() from public, anon, authenticated;

drop trigger if exists entrega_ciencia_so_servidor on public.entrega_ciencia;
create trigger entrega_ciencia_so_servidor
  before insert or update on public.entrega_ciencia
  for each row execute function public.entrega_ciencia_so_servidor();

commit;
select 'ok' as res;
