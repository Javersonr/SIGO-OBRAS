-- liberar_sst / revogar_liberacao_sst (só Admin/Gestor, justificativa) e
-- fluxo_* (papel responsável, quem executa não aprova) são o único caminho de
-- escrita previsto nestas tabelas, mas a RLS delas só olha a empresa: qualquer
-- usuário logado podia inserir uma liberação SST para funcionário com ASO
-- vencido ou marcar uma etapa como "Aprovada" direto por /rest/v1, pulando as
-- regras das RPCs. O app só LÊ estas tabelas (as RPCs são SECURITY DEFINER e
-- gravam como dono), então tiramos a escrita direta. anon não precisa de nada.

revoke all on public.liberacao_sst from anon;
revoke all on public.fluxo_instancia from anon;
revoke all on public.fluxo_etapa_instancia from anon;
revoke all on public.fluxo_etapa_evento from anon;

revoke insert, update, delete, truncate on public.liberacao_sst from authenticated;
revoke insert, update, delete, truncate on public.fluxo_instancia from authenticated;
revoke insert, update, delete, truncate on public.fluxo_etapa_instancia from authenticated;
revoke insert, update, delete, truncate on public.fluxo_etapa_evento from authenticated;
