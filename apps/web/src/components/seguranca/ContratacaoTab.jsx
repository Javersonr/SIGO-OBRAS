import React, { useEffect, useMemo, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { CHECKLIST_CONTRATACAO, statusChecklist, itemPorNome } from "@/lib/documentos-contratacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  Bot,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  UserPlus,
  Stethoscope,
  Send,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Esteira de Contratação (Sub-projeto B da spec RH & Segurança).
 * Fluxo: documentos → conferência (IA preenche) → autorização de exames →
 * exames → validação PCMSO (IA) → contabilidade (manual) → registrado.
 */

const ETAPAS = [
  { id: "documentos", nome: "Documentos" },
  { id: "conferencia", nome: "Conferência" },
  { id: "autorizacao_exames", nome: "Autorização de Exames" },
  { id: "exames", nome: "Exames" },
  { id: "validacao_pcmso", nome: "Validação PCMSO" },
  { id: "contabilidade", nome: "Contabilidade" },
  { id: "registrado", nome: "Registrado" },
];

// Campos do "Formulário para Registro" (modelo oficial da contabilidade).
// [campo, rótulo, tipo?, opções?] — com opções vira <Select> (enums do banco).
const ESTADOS_CIVIS = ["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável", "Outros"];
const RACAS = ["Indígena", "Branca", "Negra", "Amarela", "Parda", "Outros"];
const INSTRUCOES = [
  "Analfabeto",
  "Fundamental até 5º Incompleto",
  "Fundamental 5º Completo",
  "Fundamental 6º ao 9º",
  "Fundamental Completo",
  "Ensino Médio Incompleto",
  "Ensino Médio Completo",
  "Superior Incompleto",
  "Superior Completo",
  "Pós-Graduação",
  "Mestrado",
  "Doutorado",
];
const CAMPOS_FORM = [
  ["nome_completo", "Colaborador(a) — nome completo"],
  ["nome_mae", "Mãe"],
  ["nome_pai", "Pai"],
  ["cpf", "CPF"],
  ["rg", "RG"],
  ["rg_data_expedicao", "RG — data de expedição", "date"],
  ["rg_uf", "RG — UF"],
  ["data_nascimento", "Data de nascimento", "date"],
  ["naturalidade", "Naturalidade"],
  ["telefone", "Telefone"],
  ["email", "E-mail"],
  ["cep", "CEP"],
  ["endereco", "Endereço"],
  ["bairro", "Bairro"],
  ["cidade", "Cidade"],
  ["estado", "UF"],
  ["pis_nis", "PIS"],
  ["ctps_numero", "CTPS nº/série"],
  ["titulo_eleitor", "Título de eleitor"],
  ["titulo_eleitor_zona", "Zona"],
  ["titulo_eleitor_secao", "Seção"],
  ["reservista", "Reservista"],
  ["estado_civil", "Estado civil", "select", ESTADOS_CIVIS],
  ["raca_cor", "Raça/Cor", "select", RACAS],
  ["grau_instrucao", "Grau de instrução", "select", INSTRUCOES],
  ["banco_codigo", "Banco (código)"],
  ["banco_tipo_conta", "Tipo de conta", "select", ["Conta Corrente", "Conta Poupança"]],
  ["banco_agencia", "Agência"],
  ["banco_conta", "Número da conta"],
  ["data_admissao", "Data de admissão", "date"],
  ["horario_trabalho", "Horário de trabalho"],
];

const refDoAnexo = (a) => a?.ref || null;

export default function ContratacaoTab({ empresaAtiva, user }) {
  const [contratacoes, setContratacoes] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [empresa, setEmpresa] = useState(empresaAtiva);
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState(null); // contratação aberta no painel
  const [ocupado, setOcupado] = useState(""); // ação em andamento ("ia", "upload", ...)

  const recarregar = async () => {
    setCarregando(true);
    try {
      const [lista, fns, usrs, emp] = await Promise.all([
        sigo.entities.Contratacao.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Funcao.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.UsuarioEmpresa.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Empresa.get(empresaAtiva.id),
      ]);
      setContratacoes(lista.filter((c) => c.etapa !== "cancelado"));
      setFuncoes(fns.filter((f) => f.ativo !== false));
      setUsuarios(usrs);
      setEmpresa(emp || empresaAtiva);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar contratações");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (empresaAtiva?.id) recarregar();
  }, [empresaAtiva?.id]);

  const porEtapa = useMemo(() => {
    const m = Object.fromEntries(ETAPAS.map((e) => [e.id, []]));
    for (const c of contratacoes) (m[c.etapa] || m.documentos).push(c);
    return m;
  }, [contratacoes]);

  const salvar = async (id, patch) => {
    await sigo.entities.Contratacao.update(id, patch);
    setContratacoes((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setSel((s) => (s && s.id === id ? { ...s, ...patch } : s));
  };

  const novaContratacao = async () => {
    const nova = await sigo.entities.Contratacao.create({
      empresa_id: empresaAtiva.id,
      etapa: "documentos",
      anexos: [],
      exames_anexos: [],
    });
    setContratacoes((prev) => [nova, ...prev]);
    setSel(nova);
  };

  // ------------------------------------------------------------------ upload
  const subirArquivos = async (files, campo) => {
    if (!files?.length || !sel) return;
    setOcupado("upload");
    try {
      const novos = [];
      for (const file of files) {
        const res = await sigo.integrations.Core.UploadFile({ file, bucket: "contratacao" });
        novos.push({
          ref: `${res.bucket}/${res.path}`,
          nome: file.name,
          item: null,
          por_ia: false,
        });
      }
      const lista = [...(sel[campo] || []), ...novos];
      await salvar(sel.id, { [campo]: lista });
      toast.success(`${novos.length} arquivo(s) anexado(s)`);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao anexar: " + (e?.message || e));
    } finally {
      setOcupado("");
    }
  };

  const removerAnexo = async (campo, idx) => {
    const lista = [...(sel[campo] || [])];
    lista.splice(idx, 1);
    await salvar(sel.id, { [campo]: lista });
  };

  // ------------------------------------------------------------------ IA
  const lerComIA = async () => {
    if (!sel?.anexos?.length) {
      toast.error("Anexe os documentos pessoais primeiro");
      return;
    }
    setOcupado("ia");
    try {
      const { data } = await sigo.functions.invoke("iaProcessar", {
        acao: "extrair_documentos",
        file_refs: sel.anexos.map(refDoAnexo),
        checklist: CHECKLIST_CONTRATACAO.map((c) => c.nome),
      });
      if (data?.success === false) throw new Error(data.error);
      const r = data.resultado || {};
      const campos = r.campos || {};
      const patch = { extracao_ia: r };
      for (const [k] of CAMPOS_FORM) {
        if (campos[k] && !sel[k]) patch[k] = campos[k];
      }
      if (Array.isArray(r.dependentes) && r.dependentes.length && !(sel.dependentes || []).length) {
        patch.dependentes = r.dependentes;
      }
      // classifica anexos pelo nome do arquivo
      const porArquivo = new Map(
        (r.classificacao || []).map((c) => [
          String(c.arquivo || "").toLowerCase(),
          c.item_checklist,
        ])
      );
      patch.anexos = (sel.anexos || []).map((a) => {
        if (a.item) return a;
        const item = itemPorNome(porArquivo.get(String(a.nome || "").toLowerCase()));
        return item ? { ...a, item, por_ia: true } : a;
      });
      if (sel.etapa === "documentos") patch.etapa = "conferencia";
      await salvar(sel.id, patch);
      toast.success("✅ Documentos lidos — confira os dados preenchidos");
      if (r.observacoes) toast.info("IA: " + r.observacoes);
    } catch (e) {
      console.error(e);
      toast.error("IA: " + (e?.message || e));
    } finally {
      setOcupado("");
    }
  };

  const validarExames = async () => {
    if (!empresa?.pcmso_ref) {
      toast.error("Anexe o PCMSO da empresa primeiro (topo do painel)");
      return;
    }
    if (!sel?.exames_anexos?.length) {
      toast.error("Anexe os exames devolvidos pela clínica");
      return;
    }
    setOcupado("ia");
    try {
      const { data } = await sigo.functions.invoke("iaProcessar", {
        acao: "validar_exames_pcmso",
        pcmso_ref: empresa.pcmso_ref,
        exames_refs: sel.exames_anexos.map(refDoAnexo),
        funcao: sel.funcao_nome,
      });
      if (data?.success === false) throw new Error(data.error);
      const parecer = data.resultado;
      const patch = { validacao_ia: parecer };
      if (parecer?.aprovado) {
        patch.exames_validados_em = new Date().toISOString();
        patch.etapa = "contabilidade";
        toast.success("✅ Exames aprovados pela validação PCMSO");
      } else {
        patch.etapa = "validacao_pcmso";
        toast.error(`Pendências nos exames: ${parecer?.pendencias?.length ?? 0}`);
      }
      await salvar(sel.id, patch);
    } catch (e) {
      console.error(e);
      toast.error("IA: " + (e?.message || e));
    } finally {
      setOcupado("");
    }
  };

  // ------------------------------------------------------------------ PDFs
  const gerarAutorizacao = async () => {
    if (!sel?.nome_completo || !sel?.cpf || !sel?.funcao_nome) {
      toast.error("Preencha nome, CPF e função antes de gerar a autorização");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(14);
    doc.text(empresa?.razao_social || empresa?.nome || "", W / 2, 22, { align: "center" });
    doc.setFontSize(10);
    doc.text(`CNPJ: ${empresa?.cnpj || "-"}`, W / 2, 29, { align: "center" });
    doc.setFontSize(13);
    doc.text("AUTORIZAÇÃO PARA EXAME MÉDICO ADMISSIONAL", W / 2, 48, { align: "center" });
    doc.setFontSize(11);
    const corpo =
      `Autorizamos o(a) Sr.(a) ${sel.nome_completo}, CPF ${sel.cpf}, ` +
      `a realizar os exames médicos admissionais exigidos pelo PCMSO desta empresa ` +
      `para a função de ${sel.funcao_nome}.`;
    doc.text(doc.splitTextToSize(corpo, W - 40), 20, 62);
    doc.text(
      `Responsável pelo encaminhamento: ${sel.responsavel_exame_nome || "________________________"}`,
      20,
      95
    );
    const hoje = new Date().toLocaleDateString("pt-BR");
    doc.text(`Data: ${hoje}`, 20, 108);
    doc.line(20, 140, 110, 140);
    doc.text("Assinatura do responsável pela empresa", 20, 146);
    doc.save(`Autorizacao_Exames_${(sel.nome_completo || "").replace(/\s+/g, "_")}.pdf`);
    await salvar(sel.id, {
      autorizacao_emitida_em: new Date().toISOString(),
      etapa: "exames",
    });
    toast.success("Autorização gerada — encaminhe o candidato para os exames");
  };

  const gerarDossie = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = 20;
    const linha = (t, salto = 7) => {
      doc.text(doc.splitTextToSize(t, W - 30), 15, y);
      y += salto;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    };
    const fmtD = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "-");
    const titulo = (t) => {
      doc.setFont("helvetica", "bold");
      linha(t, 8);
      doc.setFont("helvetica", "normal");
    };
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    linha("FORMULÁRIO PARA REGISTRO", 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    linha(`${empresa?.razao_social || empresa?.nome || ""} — CNPJ ${empresa?.cnpj || "-"}`, 9);
    linha(
      `Data de Admissão: ${fmtD(sel.data_admissao)}    Salário: ${sel.salario ? "R$ " + Number(sel.salario).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "-"}    Horário: ${sel.horario_trabalho || "-"}`
    );
    linha(`Função: ${sel.funcao_nome || "-"}`, 9);
    titulo("Dados do empregado");
    linha(`Colaborador(a): ${sel.nome_completo || "-"}`);
    linha(`Mãe: ${sel.nome_mae || "-"}`);
    linha(`Pai: ${sel.nome_pai || "-"}`);
    linha(
      `Endereço: ${sel.endereco || "-"}   Bairro: ${sel.bairro || "-"}   CEP: ${sel.cep || "-"}`
    );
    linha(`Cidade/UF: ${sel.cidade || "-"}/${sel.estado || "-"}`);
    linha(`Telefone: ${sel.telefone || "-"}   E-mail: ${sel.email || "-"}`, 9);
    titulo("Documentos");
    linha(
      `RG: ${sel.rg || "-"}   Expedição: ${fmtD(sel.rg_data_expedicao)}   UF: ${sel.rg_uf || "-"}`
    );
    linha(`CPF: ${sel.cpf || "-"}   PIS: ${sel.pis_nis || "-"}   CTPS: ${sel.ctps_numero || "-"}`);
    linha(`Nascimento: ${fmtD(sel.data_nascimento)}   Naturalidade: ${sel.naturalidade || "-"}`);
    linha(
      `Título de Eleitor: ${sel.titulo_eleitor || "-"}   Zona: ${sel.titulo_eleitor_zona || "-"}   Seção: ${sel.titulo_eleitor_secao || "-"}`
    );
    linha(`Reservista: ${sel.reservista || "-"}`);
    linha(`Estado Civil: ${sel.estado_civil || "-"}   Raça/Cor: ${sel.raca_cor || "-"}`);
    linha(`Grau de instrução: ${sel.grau_instrucao || "-"}`, 9);
    titulo("Informações Bancárias (portabilidade da conta salário)");
    linha(
      `Banco: ${sel.banco_codigo || "-"}   Tipo: ${sel.banco_tipo_conta || "-"}   Agência: ${sel.banco_agencia || "-"}   Conta: ${sel.banco_conta || "-"}`,
      9
    );
    const deps = sel.dependentes || [];
    titulo(`Dependentes (cônjuge e filhos < 21 anos): ${deps.length ? "Sim" : "Não"}`);
    for (const d of deps) {
      linha(
        `  ${d.nome_completo || "-"} — Nascimento: ${fmtD(d.data_nascimento)} — CPF: ${d.cpf || "-"}`,
        6
      );
    }
    doc.addPage();
    y = 20;
    const st = statusChecklist(sel.anexos);
    titulo("CHECKLIST DE DOCUMENTOS");
    for (const item of st.itens) {
      linha(`  ${item.anexado ? "[X]" : "[ ]"} ${item.nome}${item.obrigatorio ? " *" : ""}`, 6);
    }
    if (st.obrigatoriosFaltando.length) {
      linha(`PENDÊNCIAS OBRIGATÓRIAS: ${st.obrigatoriosFaltando.join("; ")}`, 8);
    }
    linha(`Exames anexados: ${sel.exames_anexos?.length ?? 0}`, 7);
    if (sel.validacao_ia) {
      linha(
        `Parecer PCMSO (IA): ${sel.validacao_ia.aprovado ? "APROVADO" : "COM PENDÊNCIAS"} — ${sel.validacao_ia.resumo || ""}`,
        8
      );
      for (const p of sel.validacao_ia.pendencias || []) linha(`  • ${p.exame}: ${p.motivo}`, 6);
    }
    linha(`Anexos (${sel.anexos?.length ?? 0}):`, 6);
    for (const a of sel.anexos || []) linha(`  - ${a.nome} (${a.item || "sem item"})`, 5);
    doc.save(
      `Formulario_Registro_${(sel.nome_completo || "contratacao").replace(/\s+/g, "_")}.pdf`
    );
  };

  // ------------------------------------------------------------------ registro
  const marcarRegistrado = async () => {
    const st = statusChecklist(sel.anexos);
    if (!st.completoObrigatorio) {
      toast.error("Documentos obrigatórios faltando: " + st.obrigatoriosFaltando.join(", "));
      return;
    }
    if (!confirm(`Confirmar registro de ${sel.nome_completo}? Isso cria o funcionário no sistema.`))
      return;
    setOcupado("registro");
    try {
      const funcionario = await sigo.entities.Funcionario.create({
        empresa_id: empresaAtiva.id,
        nome_completo: sel.nome_completo,
        nome_mae: sel.nome_mae || null,
        nome_pai: sel.nome_pai || null,
        cpf: sel.cpf,
        rg: sel.rg || null,
        rg_data_expedicao: sel.rg_data_expedicao || null,
        rg_uf: sel.rg_uf || null,
        data_nascimento: sel.data_nascimento || null,
        naturalidade: sel.naturalidade || null,
        telefone: sel.telefone || null,
        email: sel.email || null,
        cep: sel.cep || null,
        endereco: sel.endereco || null,
        bairro: sel.bairro || null,
        cidade: sel.cidade || null,
        estado: sel.estado || null,
        pis: sel.pis_nis || null,
        titulo_eleitor: sel.titulo_eleitor || null,
        titulo_eleitor_zona: sel.titulo_eleitor_zona || null,
        titulo_eleitor_secao: sel.titulo_eleitor_secao || null,
        reservista: sel.reservista || null,
        estado_civil: sel.estado_civil || null,
        raca_cor: sel.raca_cor || null,
        grau_instrucao: sel.grau_instrucao || null,
        banco_codigo: sel.banco_codigo || null,
        banco_tipo_conta: sel.banco_tipo_conta || null,
        banco_agencia: sel.banco_agencia || null,
        banco_conta: sel.banco_conta || null,
        dependentes: sel.dependentes || [],
        funcao_id: sel.funcao_id || null,
        funcao_nome: sel.funcao_nome || null,
        salario: sel.salario || null,
        data_admissao: sel.data_admissao || new Date().toISOString().slice(0, 10),
        documentos_pessoais: (sel.anexos || []).map((a) => ({
          nome: a.nome,
          url: a.ref,
          item: a.item,
        })),
        ativo: true,
      });
      await salvar(sel.id, {
        etapa: "registrado",
        registrado_em: new Date().toISOString(),
        funcionario_id: funcionario.id,
      });
      toast.success("🎉 Funcionário registrado e criado no sistema!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao registrar: " + (e?.message || e));
    } finally {
      setOcupado("");
    }
  };

  const subirPcmso = async (file) => {
    if (!file) return;
    setOcupado("upload");
    try {
      const res = await sigo.integrations.Core.UploadFile({ file, bucket: "contratacao" });
      const ref = `${res.bucket}/${res.path}`;
      await sigo.entities.Empresa.update(empresaAtiva.id, { pcmso_ref: ref });
      setEmpresa((e) => ({ ...e, pcmso_ref: ref }));
      toast.success("PCMSO da empresa anexado");
    } catch (e) {
      toast.error("Erro ao anexar PCMSO: " + (e?.message || e));
    } finally {
      setOcupado("");
    }
  };

  // ------------------------------------------------------------------ UI
  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando contratações...
      </div>
    );
  }

  const st = sel ? statusChecklist(sel.anexos) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Stethoscope className="w-4 h-4 text-slate-500" />
          {empresa?.pcmso_ref ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
              PCMSO da empresa anexado ✓
            </Badge>
          ) : (
            <label className="cursor-pointer">
              <Badge variant="outline" className="text-amber-700 border-amber-300">
                ⚠ Anexar PCMSO da empresa (PDF) — necessário pra validação dos exames
              </Badge>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => subirPcmso(e.target.files?.[0])}
              />
            </label>
          )}
        </div>
        <Button onClick={novaContratacao} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-1" /> Nova Contratação
        </Button>
      </div>

      {/* Kanban de etapas */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ETAPAS.map((et) => (
          <div key={et.id} className="min-w-56 w-56 shrink-0">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              {et.nome} ({porEtapa[et.id]?.length ?? 0})
            </p>
            <div className="space-y-2">
              {(porEtapa[et.id] || []).map((c) => {
                const stc = statusChecklist(c.anexos);
                return (
                  <Card
                    key={c.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSel(c)}
                  >
                    <CardContent className="p-3 space-y-1">
                      <p className="font-medium text-sm text-slate-800">
                        {c.nome_completo || "(sem nome — anexar documentos)"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {c.funcao_nome || "função a definir"}
                      </p>
                      {!stc.completoObrigatorio && c.etapa !== "registrado" && (
                        <Badge
                          variant="outline"
                          className="text-red-600 border-red-200 text-[10px]"
                        >
                          {stc.obrigatoriosFaltando.length} doc(s) obrigatório(s) faltando
                        </Badge>
                      )}
                      {c.validacao_ia && !c.validacao_ia.aprovado && (
                        <Badge
                          variant="outline"
                          className="text-amber-700 border-amber-300 text-[10px]"
                        >
                          exames com pendência
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Painel da contratação */}
      <Sheet open={!!sel} onOpenChange={(v) => !v && setSel(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {sel && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {sel.nome_completo || "Nova contratação"}{" "}
                  <Badge variant="outline" className="ml-2">
                    {ETAPAS.find((e) => e.id === sel.etapa)?.nome}
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-6 py-4">
                {/* pendências sempre visíveis pra quem anexou */}
                {st && (st.obrigatoriosFaltando.length > 0 || st.desejaveisFaltando.length > 0) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-1">
                    {st.obrigatoriosFaltando.length > 0 && (
                      <p className="text-red-700">
                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                        <b>Obrigatórios faltando (travam o registro):</b>{" "}
                        {st.obrigatoriosFaltando.join(", ")}
                      </p>
                    )}
                    {st.desejaveisFaltando.length > 0 && (
                      <p className="text-amber-700">
                        Desejáveis pendentes: {st.desejaveisFaltando.join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {/* 1. Documentos */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Documentos pessoais
                    </h3>
                    <div className="flex gap-2">
                      <label>
                        <Button variant="outline" size="sm" asChild disabled={!!ocupado}>
                          <span className="cursor-pointer">
                            <Upload className="w-4 h-4 mr-1" /> Anexar
                          </span>
                        </Button>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.png,.jpg,.jpeg"
                          className="hidden"
                          onChange={(e) => subirArquivos([...(e.target.files || [])], "anexos")}
                        />
                      </label>
                      <Button
                        size="sm"
                        onClick={lerComIA}
                        disabled={!!ocupado || !sel.anexos?.length}
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        {ocupado === "ia" ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Bot className="w-4 h-4 mr-1" />
                        )}
                        Ler com IA
                      </Button>
                    </div>
                  </div>
                  {(sel.anexos || []).map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm bg-slate-50 rounded p-2"
                    >
                      <span className="flex-1 truncate">{a.nome}</span>
                      <Select
                        value={a.item || "none"}
                        onValueChange={async (v) => {
                          const anexos = [...sel.anexos];
                          anexos[i] = { ...a, item: v === "none" ? null : v, por_ia: false };
                          await salvar(sel.id, { anexos });
                        }}
                      >
                        <SelectTrigger className="w-56 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— classificar —</SelectItem>
                          {CHECKLIST_CONTRATACAO.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                              {c.obrigatorio ? " *" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={() => removerAnexo("anexos", i)} title="Remover">
                        <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </section>

                {/* 2. Dados do candidato (Formulário para Registro) */}
                <section className="space-y-2">
                  <h3 className="font-semibold text-slate-800">
                    Formulário para Registro — dados do colaborador
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {CAMPOS_FORM.map(([campo, rotulo, tipo, opcoes]) => (
                      <div
                        key={campo}
                        className={
                          ["nome_completo", "nome_mae", "nome_pai", "endereco"].includes(campo)
                            ? "col-span-2"
                            : ""
                        }
                      >
                        <Label className="text-xs">{rotulo}</Label>
                        {tipo === "select" ? (
                          <Select
                            value={sel[campo] || ""}
                            onValueChange={(v) => salvar(sel.id, { [campo]: v || null })}
                          >
                            <SelectTrigger className="mt-0.5 h-9">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {opcoes.map((o) => (
                                <SelectItem key={o} value={o}>
                                  {o}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={tipo || "text"}
                            value={sel[campo] || ""}
                            onChange={(e) => setSel({ ...sel, [campo]: e.target.value })}
                            onBlur={(e) => salvar(sel.id, { [campo]: e.target.value || null })}
                            className="mt-0.5 h-9"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Dependentes (cônjuge + filhos < 21) */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">
                        Dependentes (cônjuge e filhos menores de 21 anos)
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          salvar(sel.id, {
                            dependentes: [
                              ...(sel.dependentes || []),
                              { nome_completo: "", data_nascimento: "", cpf: "" },
                            ],
                          })
                        }
                      >
                        <Plus className="w-3 h-3 mr-1" /> Adicionar
                      </Button>
                    </div>
                    {(sel.dependentes || []).map((d, i) => (
                      <div key={i} className="grid grid-cols-[1fr_150px_150px_28px] gap-2 mt-1">
                        {["nome_completo", "data_nascimento", "cpf"].map((c) => (
                          <Input
                            key={c}
                            type={c === "data_nascimento" ? "date" : "text"}
                            placeholder={
                              c === "nome_completo" ? "Nome completo" : c === "cpf" ? "CPF" : ""
                            }
                            value={d[c] || ""}
                            onChange={(e) => {
                              const deps = [...sel.dependentes];
                              deps[i] = { ...d, [c]: e.target.value };
                              setSel({ ...sel, dependentes: deps });
                            }}
                            onBlur={() => salvar(sel.id, { dependentes: sel.dependentes })}
                            className="h-8 text-xs"
                          />
                        ))}
                        <button
                          onClick={() => {
                            const deps = (sel.dependentes || []).filter((_, x) => x !== i);
                            salvar(sel.id, { dependentes: deps });
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 3. Vaga */}
                <section className="space-y-2">
                  <h3 className="font-semibold text-slate-800">Função, salário e responsável</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Função</Label>
                      <Select
                        value={sel.funcao_id || ""}
                        onValueChange={async (v) => {
                          const f = funcoes.find((x) => x.id === v);
                          await salvar(sel.id, { funcao_id: v, funcao_nome: f?.nome || null });
                        }}
                      >
                        <SelectTrigger className="mt-0.5 h-9">
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {funcoes.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Salário (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={sel.salario || ""}
                        onChange={(e) => setSel({ ...sel, salario: e.target.value })}
                        onBlur={(e) => salvar(sel.id, { salario: e.target.value || null })}
                        className="mt-0.5 h-9"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Responsável por encaminhar ao exame</Label>
                      <Select
                        value={sel.responsavel_exame_email || ""}
                        onValueChange={async (v) => {
                          const u = usuarios.find((x) => x.usuario_email === v);
                          await salvar(sel.id, {
                            responsavel_exame_email: v,
                            responsavel_exame_nome: u?.nome_completo || v,
                          });
                        }}
                      >
                        <SelectTrigger className="mt-0.5 h-9">
                          <SelectValue placeholder="Selecionar usuário" />
                        </SelectTrigger>
                        <SelectContent>
                          {usuarios.map((u) => (
                            <SelectItem key={u.id} value={u.usuario_email}>
                              {u.nome_completo || u.usuario_email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={gerarAutorizacao} disabled={!!ocupado} variant="outline">
                    <FileText className="w-4 h-4 mr-1" /> Gerar Autorização de Exames (PDF)
                  </Button>
                </section>

                {/* 4. Exames */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4" /> Exames da clínica
                    </h3>
                    <div className="flex gap-2">
                      <label>
                        <Button variant="outline" size="sm" asChild disabled={!!ocupado}>
                          <span className="cursor-pointer">
                            <Upload className="w-4 h-4 mr-1" /> Anexar exames
                          </span>
                        </Button>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.png,.jpg,.jpeg"
                          className="hidden"
                          onChange={(e) =>
                            subirArquivos([...(e.target.files || [])], "exames_anexos")
                          }
                        />
                      </label>
                      <Button
                        size="sm"
                        onClick={validarExames}
                        disabled={!!ocupado || !sel.exames_anexos?.length}
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        {ocupado === "ia" ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Bot className="w-4 h-4 mr-1" />
                        )}
                        Validar com IA (PCMSO)
                      </Button>
                    </div>
                  </div>
                  {(sel.exames_anexos || []).map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm bg-slate-50 rounded p-2"
                    >
                      <span className="flex-1 truncate">{a.nome}</span>
                      <button onClick={() => removerAnexo("exames_anexos", i)} title="Remover">
                        <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                  {sel.validacao_ia && (
                    <div
                      className={`rounded-lg border p-3 text-sm ${
                        sel.validacao_ia.aprovado
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-red-50 border-red-200 text-red-700"
                      }`}
                    >
                      <p className="font-medium">
                        {sel.validacao_ia.aprovado
                          ? "✅ Aprovado na validação PCMSO"
                          : "❌ Pendências na validação PCMSO"}
                      </p>
                      <p>{sel.validacao_ia.resumo}</p>
                      {(sel.validacao_ia.pendencias || []).map((p, i) => (
                        <p key={i}>
                          • {p.exame}: {p.motivo}
                        </p>
                      ))}
                    </div>
                  )}
                </section>

                {/* 5. Contabilidade / registro */}
                <section className="space-y-2 border-t pt-4">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <UserPlus className="w-4 h-4" /> Registro
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={gerarDossie}>
                      <FileText className="w-4 h-4 mr-1" /> Formulário de Registro (PDF)
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!!sel.enviado_contabilidade_em}
                      onClick={() =>
                        salvar(sel.id, { enviado_contabilidade_em: new Date().toISOString() })
                      }
                    >
                      <Send className="w-4 h-4 mr-1" />
                      {sel.enviado_contabilidade_em
                        ? "Enviado à contabilidade ✓"
                        : "Marcar enviado à contabilidade"}
                    </Button>
                    <Button
                      onClick={marcarRegistrado}
                      disabled={!!ocupado || sel.etapa === "registrado" || !st?.completoObrigatorio}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      title={
                        !st?.completoObrigatorio
                          ? "Documentos obrigatórios pendentes"
                          : "Cria o funcionário no sistema"
                      }
                    >
                      {ocupado === "registro" ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                      )}
                      {sel.etapa === "registrado" ? "Registrado ✓" : "Confirmar registro"}
                    </Button>
                  </div>
                  {sel.etapa !== "registrado" && (
                    <button
                      className="text-xs text-slate-400 hover:text-red-500"
                      onClick={async () => {
                        if (confirm("Cancelar esta contratação?")) {
                          await salvar(sel.id, { etapa: "cancelado" });
                          setContratacoes((prev) => prev.filter((c) => c.id !== sel.id));
                          setSel(null);
                        }
                      }}
                    >
                      Cancelar contratação
                    </button>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
