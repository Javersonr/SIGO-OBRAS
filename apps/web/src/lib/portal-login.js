/**
 * Login do Portal do Funcionário com UM login (CPF e senha) em mais de uma empresa (T38) — o lado da tela. Função pura,
 * sem DOM e sem `@/api/sigoClient`: qual tela mostrar para cada resposta do servidor (`portal-funcionario`, ações
 * `login` e `ativar`), o que mandar na ativação e os textos. Quem decide é o servidor; aqui só se mostra.
 * Spec: docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md (§5.1 e §8).
 */
import { podeTrocarSenha } from "./portal-senha";

/** Os textos do §8 do spec. Nenhum diz nome de empresa nem quantas são (defesa 3, R4). */
export const TEXTOS_DO_LOGIN = {
  escolherEmpresa: "Em qual empresa você quer entrar?",
  jaUsoOutraEmpresa: "Já uso o portal em outra empresa",
  crieSuaSenha: "Crie sua senha pessoal",
  avisoSenhaNova:
    "A senha nova vale em todas as empresas. Se você já usa o portal em outra empresa, o RH dela vai precisar te " +
    "passar uma senha provisória nova.",
  digiteASenhaQueUsa: "Digite a senha que você já usa",
  trocaObrigatoria:
    "Por segurança, escolha uma senha nova, que só você conhece. A que você usa hoje foi criada com uma senha " +
    "provisória, e quem gerou essa provisória pode saber qual é.",
  dicaOutraEmpresa:
    "Trabalha em outra empresa e ela não aparece? Peça ao RH dela a senha provisória.",
  avisoTrocaDeSenha: "A senha nova vale em todas as empresas em que você usa o portal.",
  trocarDeEmpresa: "Trocar de empresa",
  voltarParaCriar: "Ainda não tenho senha: quero criar",
};

const ERRO_INESPERADO = {
  tela: "erro",
  mensagem: "O portal respondeu de um jeito inesperado. Tente entrar de novo.",
};

/** O que o aparelho guarda da sessão: o token e os nomes do cabeçalho. O CPF fica só na memória da página. */
export function sessaoDaResposta(resposta) {
  return {
    token: resposta.token,
    nome: typeof resposta.nome === "string" ? resposta.nome : "",
    empresa_nome: typeof resposta.empresa_nome === "string" ? resposta.empresa_nome : "",
  };
}

/** A lista "Em qual empresa você quer entrar?": só id (o cadastro), nome e logo de cada empresa. */
function empresasDaResposta(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((e) => e && typeof e.id === "string" && e.id)
    .map((e) => ({
      id: e.id,
      nome: typeof e.nome === "string" ? e.nome : "",
      logo_url: typeof e.logo_url === "string" && e.logo_url ? e.logo_url : null,
    }));
}

/**
 * A tela depois do `login`: o painel (uma empresa liberada), a escolha da empresa (duas ou mais) ou a ativação (entrou
 * com a senha provisória: a MESMA tela para todos, tenha a pessoa senha ou não).
 * @returns {{ tela: "painel", sessao: object } | { tela: "escolher", tokenEscolha: string, empresas: object[] }
 *   | { tela: "ativar", tokenAtivacao: string, empresaNome: string } | { tela: "erro", mensagem: string }}
 */
export function passoDoLogin(resposta) {
  if (resposta?.etapa === "escolher_empresa") {
    const empresas = empresasDaResposta(resposta.empresas);
    if (!resposta.token_escolha || empresas.length === 0) return ERRO_INESPERADO;
    return { tela: "escolher", tokenEscolha: resposta.token_escolha, empresas };
  }
  if (resposta?.etapa === "senha_provisoria") {
    if (!resposta.token_ativacao) return ERRO_INESPERADO;
    return {
      tela: "ativar",
      tokenAtivacao: resposta.token_ativacao,
      empresaNome: typeof resposta.empresa?.nome === "string" ? resposta.empresa.nome : "",
    };
  }
  if (resposta?.token) return { tela: "painel", sessao: sessaoDaResposta(resposta) };
  return ERRO_INESPERADO;
}

/** A tela depois do `ativar`: a troca obrigatória (a senha atual nasceu da provisória de outra empresa) ou o painel. */
export function passoDaAtivacao(resposta) {
  if (resposta?.etapa === "nova_senha_obrigatoria") return { tela: "troca_obrigatoria" };
  if (resposta?.token) return { tela: "painel", sessao: sessaoDaResposta(resposta) };
  return ERRO_INESPERADO;
}

/**
 * O que a ativação manda ao servidor em cada modo da tela: `criar` (a primeira senha, ou senha nova de quem esqueceu),
 * `ja_uso` (a senha que já usa em outra empresa) e `troca` (a senha atual, já digitada, e a nova).
 */
export function pedidoDaAtivacao({ modo, atual, nova }) {
  if (modo === "ja_uso") return { senha_atual: atual };
  if (modo === "troca") return { senha_atual: atual, nova_senha: nova };
  return { nova_senha: nova };
}

/** Habilita o botão da ativação: as regras da senha nova (as do servidor) e a confirmação; ou só a senha atual. */
export function podeEnviarAtivacao({ modo, atual = "", nova = "", confirma = "", usuario = "" }) {
  if (modo === "ja_uso") return !!atual;
  if (modo === "troca")
    return podeTrocarSenha({ atual, nova, confirma, obrigatoria: false, usuario });
  return podeTrocarSenha({ atual: "", nova, confirma, obrigatoria: true, usuario });
}

/**
 * Como a tela reage ao erro da ativação. `RESET_NEGADO` (a provisória não pode criar senha nova porque a pessoa já
 * tem senha): fica na tela, mostra o texto do servidor (igual para todos) e destaca o "Já uso o portal em outra
 * empresa". `ATIVACAO` (o token venceu ou a provisória mudou): volta ao login com o aviso. O resto fica na tela.
 */
export function reacaoAoErroDaAtivacao(erro) {
  const mensagem = erro?.message || "Não foi possível concluir agora. Tente de novo.";
  if (erro?.codigo === "ATIVACAO" || erro?.codigo === "SESSAO") {
    return { voltarAoLogin: true, destacarJaUso: false, mensagem };
  }
  return { voltarAoLogin: false, destacarJaUso: erro?.codigo === "RESET_NEGADO", mensagem };
}
