/**
 * portal-fornecedor-orcamento — o fornecedor anexa, no link da cotação, o orçamento que ele já
 * tem pronto (PDF ou foto) e a IA SUGERE valor unitário e prazo de cada item.
 *
 * Esta função NUNCA grava preço: ela guarda o arquivo e devolve sugestões. O preço só entra em
 * cotacao_resposta pela portal-fornecedor-resposta, quando o fornecedor confere e envia.
 *
 * Credencial = `token` único da participação (cotacao_fornecedor), como as irmãs
 * portal-fornecedor-cotacao/-resposta; empresa, cotação e participação saem SEMPRE do token.
 * Só anexa quem ainda pode responder: cotação viva, dentro do prazo, e participação "Enviada"
 * ou "Visualizada" (senão 409).
 *
 * Ações (body.action):
 *   - "situacao"        → { disponivel, anexo, limites }  (a página decide se mostra o botão)
 *   - "preparar_upload" { nome, tamanho } → { bucket, path, token, ref }
 *        Envio ASSINADO para um caminho gerado aqui, na pasta da participação dentro do bucket
 *        privado anexos-cotacao (o fornecedor é `anon`: a RLS do Storage barra o envio direto).
 *        Freio: 10 preparos por participação a cada 24 h.
 *   - "anexar"          { ref, nome } → { anexo, leitura }
 *        Baixa o arquivo (ref só da pasta desta participação), confere tamanho e tipo PELOS
 *        BYTES (inválido → apaga e 400), grava a referência "bucket/caminho" em
 *        cotacao_fornecedor.arquivos_anexados (um orçamento por participação: o novo substitui
 *        o anterior) e pede a leitura à IA.
 *        leitura.feita=true  → { sugestoes{[item_id]}, nao_encontrados[], fora_da_cotacao[],
 *                                avisos[], lidos, total }
 *        leitura.feita=false → { codigo, mensagem }: o arquivo ficou anexado e o fornecedor
 *                                preenche à mão (LIMITE, COTA_IA, IA_NAO_CONFIGURADA,
 *                                IA_INDISPONIVEL, SEM_ITENS).
 *        Freios da leitura: 5 por participação a cada 24 h e a cota diária da empresa
 *        (_shared/ia-cotas.ts, padrão 100). Consumo gravado em ia_uso (ação
 *        "cotacao_ler_orcamento", usuário "portal-fornecedor").
 *   - "remover"         → tira o orçamento anexado (banco e Storage)
 *
 * O arquivo e a resposta da IA são DADO não confiável: ver regras.ts.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { motivoCotacaoFechada, participacaoPorToken } from "../_shared/cotacao-portal.ts";
import { consumirTentativa, MSG_MUITAS_TENTATIVAS } from "../_shared/limite-tentativas.ts";
import { chamarIA } from "../_shared/ia.ts";
import { ACAO_ORCAMENTO_FORNECEDOR } from "../_shared/ia-cotas.ts";
import {
  novoMedidor,
  registrarUso,
  usuarioDoPortalFornecedor,
  verificarCotaOrcamentoFornecedor,
} from "../_shared/ia-uso.ts";
import {
  anexoDoPortal,
  anexoParaATela,
  BUCKET_ORCAMENTO,
  caminhoDaRef,
  caminhoDoOrcamento,
  conferirArquivoRecebido,
  erroArquivoDeclarado,
  EXTENSOES_ORCAMENTO,
  extensaoAceita,
  JANELA_LIMITE_SEG,
  lerOrcamento,
  MAX_ENVIOS_POR_PARTICIPACAO,
  MAX_LEITURAS_POR_PARTICIPACAO,
  MAX_MB_ORCAMENTO,
  MIME_DO_ORCAMENTO,
  MSG_JA_RESPONDIDA,
  nomeSeguro,
  ORIGEM_PORTAL,
  pastaDoOrcamento,
  STATUS_PODE_ANEXAR,
  trocarAnexoDoPortal,
  type AnexoOrcamento,
  type EscopoOrcamento,
  type ItemDaCotacao,
} from "./regras.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const MSG_INDISPONIVEL = "Serviço indisponível no momento. Tente de novo em alguns minutos.";
const SEM_LEITURA = "O arquivo foi anexado. Preencha os valores à mão.";

/** resposta de "o anexo ficou, a leitura não": nunca é erro HTTP */
const semLeitura = (codigo: string, motivo: string) => ({
  feita: false,
  codigo,
  mensagem: `${motivo} ${SEM_LEITURA}`,
});

/** apaga do Storage; falha vai só para o log (o arquivo órfão não derruba a ação) */
async function apagarDoStorage(supabase: Db, caminhos: string[]): Promise<void> {
  if (caminhos.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET_ORCAMENTO).remove(caminhos);
  if (error) console.warn("[portal-fornecedor-orcamento] remover do Storage:", error.message);
}

/**
 * Deixa na pasta da participação só o arquivo `manter` (null = nenhum): além dos anexos
 * substituídos (`apagar`), saem os envios preparados que nunca foram anexados.
 */
async function limparPasta(
  supabase: Db,
  escopo: EscopoOrcamento,
  manter: string | null,
  apagar: string[]
): Promise<void> {
  const pasta = pastaDoOrcamento(escopo);
  const caminhos = new Set(apagar);
  const { data, error } = await supabase.storage
    .from(BUCKET_ORCAMENTO)
    .list(pasta.replace(/\/$/, ""), { limit: 100 });
  if (error) console.warn("[portal-fornecedor-orcamento] listar a pasta:", error.message);
  for (const arquivo of data ?? []) {
    if (arquivo?.name) caminhos.add(`${pasta}${arquivo.name}`);
  }
  if (manter) caminhos.delete(manter);
  await apagarDoStorage(supabase, [...caminhos]);
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    // deno-lint-ignore no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const { token, action } = body ?? {};
    const supabase = createAdminClient();

    const achou = await participacaoPorToken(
      supabase,
      token,
      "id, cotacao_id, empresa_id, status, arquivos_anexados"
    );
    if ("erro" in achou) {
      return fail(achou.erro, achou.status, achou.codigo ? { codigo: achou.codigo } : undefined);
    }
    const cf = achou.cf;
    const escopo: EscopoOrcamento = {
      empresaId: cf.empresa_id,
      cotacaoId: cf.cotacao_id,
      participacaoId: cf.id,
    };

    const { data: cotacao } = await supabase
      .from("cotacao")
      .select("id, status, data_limite")
      .eq("id", escopo.cotacaoId)
      .eq("empresa_id", escopo.empresaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!cotacao) return fail("Cotação não encontrada", 404);

    const bloqueio = motivoCotacaoFechada(cotacao);
    const podeAnexar = bloqueio === null && STATUS_PODE_ANEXAR.includes(cf.status);
    const anexoAtual = anexoDoPortal(cf.arquivos_anexados, escopo);

    // --- Situação: a página decide se mostra o botão -----------------------
    if (action === "situacao") {
      return ok({
        disponivel: podeAnexar,
        anexo: anexoParaATela(anexoAtual),
        limites: { max_mb: MAX_MB_ORCAMENTO, tipos: [...EXTENSOES_ORCAMENTO] },
      });
    }

    if (action !== "preparar_upload" && action !== "anexar" && action !== "remover") {
      return fail("Ação não reconhecida", 400);
    }
    if (bloqueio) return fail(bloqueio, 409, { codigo: "COTACAO_ENCERRADA" });
    if (!podeAnexar) return fail(MSG_JA_RESPONDIDA, 409, { codigo: "JA_RESPONDIDA" });

    // --- Preparar o envio (URL de envio assinada) --------------------------
    if (action === "preparar_upload") {
      const erro = erroArquivoDeclarado(body.nome, body.tamanho);
      if (erro) return fail(erro, 400);

      // Freio: sem ele, um link vazado vira depósito no Storage
      const limite = await consumirTentativa(
        supabase,
        "portal-fornecedor-orcamento-envio",
        JANELA_LIMITE_SEG,
        [{ tipo: "conta", valor: escopo.participacaoId, max: MAX_ENVIOS_POR_PARTICIPACAO }],
        { falharFechado: true }
      );
      if (!limite.permitido) {
        return limite.indisponivel ? fail(MSG_INDISPONIVEL, 503) : fail(MSG_MUITAS_TENTATIVAS, 429);
      }

      // Envio preparado e nunca anexado não fica ocupando o Storage: a pasta guarda, no
      // máximo, o orçamento anexado e o envio em curso
      await limparPasta(
        supabase,
        escopo,
        anexoAtual ? caminhoDaRef(anexoAtual.ref, escopo) : null,
        []
      );

      const ext = extensaoAceita(body.nome)!;
      const caminho = caminhoDoOrcamento(escopo, crypto.randomUUID(), ext);
      const { data, error } = await supabase.storage
        .from(BUCKET_ORCAMENTO)
        .createSignedUploadUrl(caminho);
      if (error || !data?.token) {
        console.error("[portal-fornecedor-orcamento] preparar_upload:", error?.message);
        return fail("Não foi possível preparar o envio do arquivo", 500);
      }
      return ok({
        bucket: BUCKET_ORCAMENTO,
        path: caminho,
        token: data.token,
        ref: `${BUCKET_ORCAMENTO}/${caminho}`,
        content_type: MIME_DO_ORCAMENTO[ext],
      });
    }

    // --- Remover o orçamento anexado ---------------------------------------
    if (action === "remover") {
      const troca = trocarAnexoDoPortal(cf.arquivos_anexados, null, escopo);
      const { error } = await supabase
        .from("cotacao_fornecedor")
        .update({ arquivos_anexados: troca.lista })
        .eq("id", escopo.participacaoId);
      if (error) {
        console.error("[portal-fornecedor-orcamento] remover:", error.message);
        return fail("Não foi possível remover o arquivo", 500);
      }
      await limparPasta(supabase, escopo, null, troca.apagar);
      return ok({ anexo: null });
    }

    // --- Anexar e ler ------------------------------------------------------
    const caminho = caminhoDaRef(body.ref, escopo);
    if (!caminho) return fail("Arquivo inválido", 400);
    const ref = `${BUCKET_ORCAMENTO}/${caminho}`;

    const baixado = await supabase.storage.from(BUCKET_ORCAMENTO).download(caminho);
    if (baixado.error || !baixado.data) {
      return fail("Não encontramos o arquivo enviado. Envie de novo.", 400);
    }
    const bytes = new Uint8Array(await baixado.data.arrayBuffer());
    const conferido = conferirArquivoRecebido(bytes);
    if (!conferido.ok) {
      await apagarDoStorage(supabase, [caminho]);
      return fail(conferido.erro, 400);
    }

    const novo: AnexoOrcamento = {
      ref,
      nome: nomeSeguro(body.nome),
      tipo: MIME_DO_ORCAMENTO[conferido.tipo],
      tamanho: bytes.byteLength,
      enviado_em: new Date().toISOString(),
      origem: ORIGEM_PORTAL,
    };
    const troca = trocarAnexoDoPortal(cf.arquivos_anexados, novo, escopo);
    const gravado = await supabase
      .from("cotacao_fornecedor")
      .update({ arquivos_anexados: troca.lista })
      .eq("id", escopo.participacaoId);
    if (gravado.error) {
      console.error("[portal-fornecedor-orcamento] anexar:", gravado.error.message);
      await apagarDoStorage(supabase, [caminho]);
      return fail("Não foi possível guardar o arquivo", 500);
    }
    await limparPasta(supabase, escopo, caminho, troca.apagar);
    const anexo = anexoParaATela(novo);

    // Daqui em diante o anexo já está guardado: a leitura é um extra e nunca vira erro HTTP
    const itensRes = await supabase
      .from("cotacao_item")
      .select("id, descricao, material_codigo, quantidade, unidade, especificacoes")
      .eq("cotacao_id", escopo.cotacaoId)
      .eq("empresa_id", escopo.empresaId)
      .is("deleted_at", null)
      .order("descricao", { ascending: true })
      .order("id", { ascending: true });
    const itens = (itensRes.data ?? []) as ItemDaCotacao[];
    if (itensRes.error || itens.length === 0) {
      if (itensRes.error) {
        console.error("[portal-fornecedor-orcamento] itens:", itensRes.error.message);
      }
      return ok({
        anexo,
        leitura: semLeitura("SEM_ITENS", "Não foi possível carregar os itens da cotação."),
      });
    }

    const limite = await consumirTentativa(
      supabase,
      "portal-fornecedor-orcamento-leitura",
      JANELA_LIMITE_SEG,
      [{ tipo: "conta", valor: escopo.participacaoId, max: MAX_LEITURAS_POR_PARTICIPACAO }],
      { falharFechado: true }
    );
    if (!limite.permitido) {
      return ok({
        anexo,
        leitura: limite.indisponivel
          ? semLeitura("IA_INDISPONIVEL", "A leitura automática não está disponível agora.")
          : semLeitura(
              "LIMITE",
              `Você já usou as ${MAX_LEITURAS_POR_PARTICIPACAO} leituras automáticas desta cotação nas últimas 24 horas.`
            ),
      });
    }

    const estouro = await verificarCotaOrcamentoFornecedor(supabase, escopo.empresaId);
    if (estouro) {
      console.warn(
        `[portal-fornecedor-orcamento] cota diária da empresa atingida (${estouro.usadas} de ${estouro.cota})`
      );
      return ok({
        anexo,
        leitura: semLeitura("COTA_IA", "A leitura automática não está disponível hoje."),
      });
    }

    const medidor = novoMedidor();
    try {
      const r = await lerOrcamento(chamarIA, { ref, itens }, medidor);
      if (!r.ok) {
        console.warn("[portal-fornecedor-orcamento] leitura falhou:", r.erro);
        return ok({
          anexo,
          leitura:
            r.erro === "IA_NAO_CONFIGURADA"
              ? semLeitura("IA_NAO_CONFIGURADA", "A leitura automática não está disponível.")
              : semLeitura("IA_INDISPONIVEL", "Não foi possível ler o arquivo agora."),
        });
      }
      return ok({ anexo, leitura: { feita: true, ...r.leitura } });
    } catch (e) {
      console.error("[portal-fornecedor-orcamento] leitura:", (e as Error)?.message);
      return ok({
        anexo,
        leitura: semLeitura("IA_INDISPONIVEL", "Não foi possível ler o arquivo agora."),
      });
    } finally {
      // grava o consumo (sucesso, erro ou exceção); sem chamada à IA não grava nada
      await registrarUso(
        supabase,
        usuarioDoPortalFornecedor(escopo.empresaId),
        ACAO_ORCAMENTO_FORNECEDOR,
        medidor
      );
    }
  })
);
