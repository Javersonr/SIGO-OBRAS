/**
 * Acesso do funcionário ao Portal (lado do RH): criar/redefinir login e avisar
 * pelo WhatsApp. A senha provisória só existe na resposta de criar/redefinir —
 * o servidor guarda apenas o hash, e o funcionário troca no primeiro acesso.
 */
import { sigo } from "@/api/sigoClient";
import { dispararWhatsApp } from "@/lib/whatsapp";

export const urlPortal = () => `${window.location.origin}/PortalFuncionario`;

async function chamar(acao, dados = {}) {
  const { data } = await sigo.functions.invoke("funcionarioAcesso", { acao, ...dados });
  if (data?.success === false) throw new Error(data.error || "Erro no acesso ao portal");
  return data;
}

export const acessoPortal = {
  status: (empresaId) => chamar("status", { empresa_id: empresaId }),
  criar: (funcionarioId, usuario) =>
    chamar("criar", { funcionario_id: funcionarioId, usuario: usuario || undefined }),
  redefinir: (funcionarioId) => chamar("redefinir", { funcionario_id: funcionarioId }),
  ativo: (funcionarioId, ativo) => chamar("ativo", { funcionario_id: funcionarioId, ativo }),
};

const primeiroNome = (nome) => (nome || "").trim().split(/\s+/)[0] || "";

export function textoCredenciais({ nome, usuario, senha }) {
  return (
    `🔐 Olá, ${primeiroNome(nome)}! Este é o seu acesso ao Portal do Funcionário:\n${urlPortal()}\n\n` +
    `Usuário: ${usuario}\nSenha provisória: ${senha}\n\n` +
    "No primeiro acesso você vai criar a sua senha pessoal. Não compartilhe sua senha com ninguém."
  );
}

/**
 * Manda um aviso com o link do portal. Se o funcionário ainda não tem acesso,
 * cria agora e junta usuário e senha provisória na mesma mensagem.
 * @returns {{ via: "evolution"|"wa.me"|null, texto: string, credenciais: object|null }}
 */
export async function avisarNoPortal(funcionario, aviso) {
  let credenciais = null;
  try {
    credenciais = await acessoPortal.criar(funcionario.id);
  } catch (e) {
    if (!/já tem acesso/i.test(e.message)) throw e;
  }
  const partes = [aviso, `Acesse: ${urlPortal()}`];
  partes.push(
    credenciais
      ? `Usuário: ${credenciais.usuario}\nSenha provisória: ${credenciais.senha_provisoria}\n` +
          "(no primeiro acesso você cria a sua senha pessoal)"
      : "Entre com o seu usuário (CPF) e a sua senha."
  );
  const texto = partes.join("\n\n");
  const via = funcionario.telefone ? await dispararWhatsApp(funcionario.telefone, texto) : null;
  return { via, texto, credenciais };
}

/** Rótulo e cor do status do acesso (lista de funcionários e ficha). */
export function statusAcesso(acesso) {
  if (!acesso) return { rotulo: "Sem acesso", classe: "text-slate-500 border-slate-200" };
  if (!acesso.ativo)
    return { rotulo: "Desativado", classe: "bg-slate-100 text-slate-600 border-slate-300" };
  if (acesso.bloqueado)
    return { rotulo: "Bloqueado", classe: "bg-red-100 text-red-700 border-red-200" };
  if (acesso.primeiro_acesso_pendente)
    return {
      rotulo: "Aguardando 1º acesso",
      classe: "bg-amber-100 text-amber-700 border-amber-200",
    };
  return { rotulo: "Ativo", classe: "bg-emerald-100 text-emerald-700 border-emerald-200" };
}
