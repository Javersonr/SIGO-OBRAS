import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function SelecionarProjetoeConta({
  empresaId,
  dados,
  comprovanteUrl,
  onConfirm,
  onBack,
  loading,
  usuarioEmail,
  verTodos,
  isAdmin,
}) {
  const [projetos, setProjetos] = useState([]);
  const [contas, setContas] = useState([]);
  const [projetoId, setProjetoId] = useState("");
  const [contaId, setContaId] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  // Usuário com acesso total: admin ou com permissão "Ver Todos"
  const podeVerTodos = isAdmin || verTodos;

  useEffect(() => {
    if (!empresaId) {
      setErro("ID da empresa não encontrado. Feche o modal e tente novamente.");
      return;
    }
    carregarDados();
  }, [empresaId]);

  const carregarDados = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [projsData, contasData, usuariosData] = await Promise.all([
        sigo.entities.Projeto.filter({ empresa_id: empresaId }),
        sigo.entities.ContaFinanceira.filter({ empresa_id: empresaId }),
        sigo.entities.UsuarioEmpresa.filter({ empresa_id: empresaId, ativo: true }),
      ]);

      let projsAtivos = (projsData || []).filter((p) => p.arquivado !== true);
      let contasAtivas = (contasData || []).filter((c) => c.ativo !== false);

      // Se NÃO pode ver todos: filtrar por responsável
      if (!podeVerTodos) {
        if (!usuarioEmail) {
          setErro("Email do usuário não disponível. Recarregue a página.");
          setProjetos([]);
          setContas([]);
          return;
        }

        const emailLower = usuarioEmail.toLowerCase().trim();

        projsAtivos = projsAtivos.filter((p) => {
          // 1. Campo: responsaveis_emails (JSON array de emails)
          if (p.responsaveis_emails) {
            try {
              const emails = JSON.parse(p.responsaveis_emails);
              if (
                Array.isArray(emails) &&
                emails.some((e) => String(e).toLowerCase().trim() === emailLower)
              ) {
                return true;
              }
            } catch (e) {
              console.warn("Erro ao parsear responsaveis_emails para projeto", p.id, e);
            }
          }

          // 2. Campo: responsavel_email (string único)
          if (
            p.responsavel_email &&
            String(p.responsavel_email).toLowerCase().trim() === emailLower
          ) {
            return true;
          }

          // 3. Campo: responsaveis_ids (JSON array de IDs de usuários)
          if (p.responsaveis_ids) {
            try {
              const ids = JSON.parse(p.responsaveis_ids);
              if (Array.isArray(ids)) {
                // Verificar se algum ID corresponde a um usuário com este email
                const matchingUsers = usuariosData.filter(
                  (u) => ids.includes(u.id) && u.usuario_email.toLowerCase().trim() === emailLower
                );
                if (matchingUsers.length > 0) {
                  return true;
                }
              }
            } catch (e) {
              console.warn("Erro ao parsear responsaveis_ids para projeto", p.id, e);
            }
          }

          return false;
        });

        // Filtrar contas: Fundo Fixo com responsável email
        contasAtivas = contasAtivas.filter(
          (c) =>
            c.tipo === "Fundo Fixo" &&
            c.responsavel_email &&
            c.responsavel_email.toLowerCase().trim() === emailLower
        );
      }

      setProjetos(projsAtivos);
      setContas(contasAtivas);
    } catch (err) {
      setErro("Erro ao carregar dados: " + err.message);
      setProjetos([]);
      setContas([]);
    } finally {
      setCarregando(false);
    }
  };

  const handleConfirm = () => {
    setErro(null);
    if (!contaId) {
      setErro("Selecione uma conta");
      return;
    }
    const projetoSelecionado = projetos.find((p) => p.id === projetoId);
    const contaSelecionada = contas.find((c) => c.id === contaId);
    onConfirm({
      projeto_id: projetoId,
      projeto_nome: projetoSelecionado?.nome,
      conta_financeira_id: contaId,
      conta_nome: contaSelecionada?.nome,
    });
  };

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          <span className="ml-2 text-slate-600">Carregando projetos e contas...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Selecionar Projeto e Conta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {erro && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <AlertDescription className="text-red-800">{erro}</AlertDescription>
          </Alert>
        )}

        {/* Resumo dos Dados */}
        {dados && (
          <div className="bg-slate-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Valor:</span>
              <span className="font-semibold">R$ {parseFloat(dados.valor || 0).toFixed(2)}</span>
            </div>
            {dados.fornecedor && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Fornecedor:</span>
                <span className="font-semibold">{dados.fornecedor}</span>
              </div>
            )}
          </div>
        )}

        {/* Seleção de Projeto */}
        <div>
          <Label className="text-sm font-medium mb-2 block">
            Projeto ({projetos.length} disponível{projetos.length !== 1 ? "is" : ""}
            {!podeVerTodos ? " — apenas seus projetos" : ""})
          </Label>
          <select
            value={projetoId}
            onChange={(e) => {
              setProjetoId(e.target.value);
              setErro(null);
            }}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">-- Selecione um projeto --</option>
            {projetos.map((projeto) => (
              <option key={projeto.id} value={projeto.id}>
                {projeto.nome}
              </option>
            ))}
          </select>
        </div>

        {/* Seleção de Conta */}
        <div>
          <Label className="text-sm font-medium mb-2 block">
            Conta * ({contas.length} disponível{contas.length !== 1 ? "is" : ""}
            {!podeVerTodos ? " — apenas seu Fundo Fixo" : ""})
          </Label>
          <select
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">-- Selecione uma conta --</option>
            {contas.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome} ({conta.tipo})
              </option>
            ))}
          </select>
        </div>

        {/* Aviso */}
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            O pré-lançamento será criado como pendente. Você precisará conciliá-lo antes de gerar a
            despesa final.
          </AlertDescription>
        </Alert>

        {/* Botões */}
        <div className="flex gap-2">
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={loading || carregando}
          >
            {loading ? "Criando..." : "Criar Pré-Lançamento"}
          </Button>
          <Button onClick={onBack} variant="outline" className="flex-1" disabled={loading}>
            Voltar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
