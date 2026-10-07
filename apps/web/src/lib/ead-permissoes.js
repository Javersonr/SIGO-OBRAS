/**
 * Permissões do Portal de Treinamento (EAD) na tela do RH — T33, spec
 * docs/superpowers/specs/2026-10-06-permissoes-ead-design.md (§3 e §8).
 *
 * A aba "Treinamentos EAD" do módulo "Segurança do Trabalho" (ESTRUTURA_PERMISSOES) tem 7 funções. A tela só
 * ESPELHA: esconde ou desliga o que a pessoa não pode usar. Quem protege é o banco (função tem_permissao e os
 * triggers da migração 0147) e o servidor (funcionario-acesso). Testes: ead-permissoes.test.js.
 */

export const MODULO_SST = "Segurança do Trabalho";
export const ABA_EAD = "Treinamentos EAD";

/** As funções da aba, na ordem do editor de permissões. */
export const FUNCOES_EAD = [
  "visualizar",
  "editar",
  "publicar",
  "matricular",
  "liberar_tentativa",
  "revogar_certificado",
  "responder_duvidas",
];

/** Ninguém pode nada (a tela antes de o vínculo carregar). */
export const NENHUMA_PERMISSAO_EAD = Object.freeze({
  visualizar: false,
  editar: false,
  publicar: false,
  matricular: false,
  liberarTentativa: false,
  revogarCertificado: false,
  responderDuvidas: false,
  criarAcessoPortal: false,
});

/**
 * O que a pessoa pode na aba Treinamentos, a partir do `temPermissao(modulo, aba, funcao)` do Layout (Admin, dono e
 * super admin passam em tudo lá). `visualizar` = ver a aba = ter QUALQUER função dela (quem só edita vê o que edita).
 * `criarAcessoPortal` não é da aba nova: criar o acesso ao Portal do Funcionário continua em Segurança do Trabalho →
 * Funcionários → Editar (P3 = C1); quem só matricula avisa só quem já tem acesso.
 */
export function permissoesEad(temPermissao) {
  if (typeof temPermissao !== "function") return { ...NENHUMA_PERMISSAO_EAD };
  const tem = (aba, funcao = null) => {
    try {
      return temPermissao(MODULO_SST, aba, funcao) === true;
    } catch {
      return false;
    }
  };
  return {
    visualizar: tem(ABA_EAD),
    editar: tem(ABA_EAD, "editar"),
    publicar: tem(ABA_EAD, "publicar"),
    matricular: tem(ABA_EAD, "matricular"),
    liberarTentativa: tem(ABA_EAD, "liberar_tentativa"),
    revogarCertificado: tem(ABA_EAD, "revogar_certificado"),
    responderDuvidas: tem(ABA_EAD, "responder_duvidas"),
    criarAcessoPortal: tem("Funcionários", "editar"),
  };
}

/** O botão "Salvar curso": curso novo só com Editar; curso existente com Editar ou Publicar. */
export function podeSalvarCurso(pode, { novo }) {
  if (!pode) return false;
  return novo ? !!pode.editar : !!(pode.editar || pode.publicar);
}

/**
 * O que o "Salvar curso" grava, conforme a permissão (o banco exige Editar para mudar o curso e Publicar para mudar a
 * chave "Publicado"; sem isto, quem só tem uma delas levaria o erro do banco ao salvar):
 *   - Editar e Publicar: tudo;
 *   - só Editar: tudo menos `ativo` num curso existente (fica como está no banco); curso novo nasce rascunho;
 *   - só Publicar: só `{ ativo }` de um curso existente; curso novo, nada;
 *   - nenhuma das duas: nada (`null`).
 * Não muda o objeto recebido.
 */
export function dadosDoCursoParaGravar(dados, pode, { novo }) {
  const editar = !!pode?.editar;
  const publicar = !!pode?.publicar;
  if (editar && publicar) return { ...dados };
  if (editar) {
    if (novo) return { ...dados, ativo: false };
    const semAtivo = { ...dados };
    delete semAtivo.ativo;
    return semAtivo;
  }
  if (publicar && !novo) return { ativo: dados?.ativo !== false };
  return null;
}

/** A dica da chave "Publicado" para quem não pode publicar (a chave fica visível e desligada). */
export function dicaDoPublicado(pode) {
  return pode?.publicar ? null : "Publicar exige a permissão Treinamentos EAD → Publicar";
}
