/**
 * Método de leitura do edital e regras do "Atende?", compartilhados entre os prompts da IA
 * (ia-processar) e o prompt "Analisar edital" do conector do Claude. Os textos são os MESMOS
 * dos prompts da IA: o prompts-ia.test.ts prova por hash que os prompts não mudaram.
 */

/** "O QUE MAIS IMPORTA (decide se a empresa pode participar):" até "- observacoes_importantes: …". */
export const METODO_LEITURA_EDITAL: readonly string[] = [
  "O QUE MAIS IMPORTA (decide se a empresa pode participar):",
  "1. QUALIFICAÇÃO TÉCNICA — separe:",
  '   • tecnica_operacional = capacidade técnico-OPERACIONAL: atestados em nome da EMPRESA licitante. Uma entrada por parcela de maior relevância/serviço: servico, quantidade MÍNIMA exigida e unidade; percentual_minimo quando o edital fala em % (ex.: "50% do quantitativo") — se o edital der só o total da parcela e o %, calcule quantidade = total × %; somatorio_permitido (true = aceita somar atestados; false = exige atestado único ou veda somatório; null = não diz); exige_execucao (true quando exige EXECUÇÃO — projeto, fiscalização ou consultoria não bastam).',
  "   • tecnica_profissional = capacidade técnico-PROFISSIONAL: CAT/acervo do PROFISSIONAL de nível superior do quadro da empresa (ex.: engenheiro eletricista), com a formação em profissional e serviço/quantidade se houver.",
  '   "Atestado em nome da licitante" = operacional; "CAT do responsável técnico/profissional" = profissional.',
  '2. QUALIFICAÇÃO ECONÔMICO-FINANCEIRA (economica): capital social mínimo (capital_social), patrimônio líquido mínimo (patrimonio_liquido) ou "capital social OU patrimônio líquido" (capital_ou_pl) — com valor_minimo em R$ e/ou percentual_do_estimado; índices liquidez_corrente, liquidez_geral e solvencia_geral (valor_minimo = índice mínimo, ex.: 1.0) e endividamento (valor_minimo = índice MÁXIMO); ccl (capital circulante líquido); faturamento (valor e exercicio). Balanço, certidão de falência e demais documentos vão em outros_documentos.',
  "3. REGISTROS: registro da empresa no CREA/CAU (crea), visto no CREA do estado (visto_crea), cadastro/credenciamento em concessionária de energia (cadastro_concessionaria), outros (outro).",
  '4. PRAZOS: sessão pública/abertura (sessao), limite de propostas (proposta_limite), impugnação (impugnacao_limite), esclarecimentos (esclarecimento_limite) e visita técnica (obrigatória ou facultativa, data, hora e, em descricao, local/como agendar). Prazo relativo ("até 3 dias úteis antes da sessão") → data null e explique em observacoes_importantes.',
  "5. Também: garantia de proposta, exclusividade ME/EPP, consórcio, subcontratação, critério de julgamento, regime e prazo de execução, vigência, valor estimado, órgão e CNPJ, nº do edital e do processo, modalidade, forma (eletrônica/presencial), portal (plataforma/link da disputa) e local (cidade/UF).",
  "6. itens: lotes/itens da planilha com quantidade, unidade e valores (no máximo 80 linhas; se houver mais, fique com os de maior valor e registre em avisos).",
  '- titulo_sugerido: curto (até 80 caracteres), ex.: "Iluminação pública LED — Pref. de Araxá/MG" (só se o objeto aparecer nestas páginas).',
  "- observacoes_importantes: só o que muda a decisão ou o preparo (amostra, exigência incomum, penalidade atípica, prazo relativo) — no máximo 15.",
];

/** As 15 regras numeradas do "Atende?" ("1. Somatório…" a "15. cats_anexar…"). */
export const REGRAS_ATENDE: readonly string[] = [
  '1. Somatório × atestado único: somatório PERMITIDO → compare com os TOTAIS (somatório das CATs); VEDADO → compare com o TETO POR OBRA ÚNICA; edital não diz → compare primeiro com o teto por obra única e, se só atender somando atestados, use "ressalva" (depende de o edital aceitar somatório).',
  '2. exige execução = sim: CAT sem execução na ART (só projeto/consultoria/fiscalização/assessoria) NÃO comprova — "nao_atende" se for a única prova; cite o motivo.',
  '3. Quantidade na atividade técnica da ART (marcada [ART] ou em "atividade técnica da ART") vale mais do que a que aparece só na observação/planilha; se a prova depender só da observação, use "ressalva".',
  '4. CAT EM ANDAMENTO ou com divergência conhecida (campo riscos) que afete a prova ⇒ no máximo "ressalva", citando o risco.',
  "5. Tipo cat_profissional (obra executada por OUTRA empresa) só vale para capacidade técnico-PROFISSIONAL e só se o profissional tiver vínculo com a empresa (quadro técnico); NUNCA para técnico-operacional.",
  '6. Tipo atestado (sem CAT) só vale se o edital aceitar atestado sem registro no CREA; se o edital não disser, "ressalva".',
  "7. CAO comprova o acervo operacional apenas das ARTs que cobre.",
  "8. Quantidade mínima: use a quantidade exigida. Se o edital não fixar, registre na justificativa que a Lei 14.133/2021 (art. 67, §§ 1º e 2º) limita a exigência às parcelas de maior relevância e a até 50% do quantitativo delas.",
  '9. Compare unidades compatíveis (1 km = 1.000 m). Luminária de IP, refletor e substituição de luminária são categorias diferentes; serviço similar ou de complexidade superior só conta se o edital aceitar — na dúvida, "ressalva" explicando.',
  "10. Técnico-profissional: confira o quadro técnico (formação exigida, RT, vínculo, restrições) e se há CAT em nome do profissional com o serviço/quantidade.",
  "11. Registros: CREA da empresa; visto no CREA da UF da licitação quando a empresa é de outra UF (em regra só para contratar — trate como ressalva/pendência, salvo se o edital exigir na habilitação); cadastro na concessionária: confira órgão, grupos e validades dos cadastros.",
  "12. Considere as OBSERVAÇÕES/REGRAS e os ALERTAS da empresa (o que ela NÃO tem, melhores CATs por serviço).",
  '13. status: "atende" (comprovado), "ressalva" (atende com risco/condição), "nao_atende" (o acervo não tem), "verificar" (faltam dados para decidir).',
  '14. comprovacao: objetiva, com o nº da CAT e a quantidade (ex.: "CAT 3239747/2025 – Planura: 157 postes (teto por obra)"); justificativa: 1 a 3 frases.',
  "15. cats_anexar: CATs/CAO/atestados a juntar na habilitação e o motivo. pendencias: providências antes da sessão. riscos: pontos que podem inabilitar.",
];
