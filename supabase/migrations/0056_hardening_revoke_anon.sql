-- ============================================================================
-- 0056_hardening_revoke_anon.sql — revoga EXECUTE do papel `anon` nas RPCs
-- SECURITY DEFINER de negócio (SEG 5.3).
--
-- Contexto: 0027/0028/0029/0030/0031/0033/0034 concederam execute `to anon,
-- authenticated` em funções de estoque/compras/financeiro/projeto/NFe/fiscal.
-- O `anon` (chave pública, sem login) não tem por que chamar operações de
-- negócio — os portais usam Edge Functions com service role, não essas RPCs.
-- Manter o grant a `anon` amplia a superfície de ataque desnecessariamente.
--
-- Esta migration é NÃO-DESTRUTIVA e REVERSÍVEL: só remove `anon`. O papel
-- `authenticated` (usuário logado) mantém o grant em todas — nada do app quebra.
-- Revoga por NOME (loop em pg_proc) para cobrir todas as sobrecargas sem
-- depender da assinatura exata.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'entrada_estoque_atomica',
          'saida_estoque_atomica',
          'baixar_reserva_atomica',
          'aprovar_solicitacao_compra',
          'rejeitar_solicitacao_compra',
          'gerar_pedido_direto',
          'sincronizar_projeto_com_oportunidade',
          'jsonb_arr_len',
          'jsonb_to_array',
          'upsert_nfe_recebida',
          'get_aliquota_vigente',
          'criar_transferencia_atomica'
        )
  loop
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end
$$;

-- View de NFe: também não deve ser legível por anon (a view tem
-- security_invoker desde a 0049, mas o grant a anon era resíduo).
revoke select on public.v_nfe_resumo_mensal from anon;

-- recarrega o cache do PostgREST para refletir as permissões na hora
notify pgrst, 'reload schema';
