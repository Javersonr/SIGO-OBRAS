import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Workflow, Plus, Save, Loader2, Trash2, ArrowUp, ArrowDown, Upload } from "lucide-react";

/**
 * Configurações → Processos / Fluxos (Fase 1 do motor de fluxos).
 *
 * Editor ESTRUTURADO: desenha os processos da empresa (etapas, quem executa,
 * quem aprova, checklist, opções de decisão) e salva no banco
 * (fluxo_template / fluxo_etapa_template). Ainda SEM motor de execução — é a
 * planta configurável que o motor (executa→aprova) vai ler depois.
 *
 * Substitui o docs/mapa-processos.html standalone: tem botão de importar o
 * JSON que o usuário já desenhou lá.
 */

const TIPOS = ["inicio", "etapa", "decisao", "fim"];
const PAPEIS_SUGERIDOS = [
  "Diretor",
  "Gestor",
  "Analista",
  "Responsável Técnico",
  "Engenharia",
  "Agente de licitações",
  "Orçamentista",
  "Compras",
  "Almoxarife",
  "Encarregado",
  "Supervisor de Obra",
  "Financeiro",
  "RH/SST",
];

const novaEtapa = (over = {}) => ({
  _key: Math.random().toString(36).slice(2),
  nome: "Nova etapa",
  tipo: "etapa",
  papel_responsavel: "",
  papel_aprovador: "",
  atividades: "",
  opcoes: [],
  ...over,
});

export default function FluxosTab({ empresaAtiva }) {
  const [templates, setTemplates] = useState([]);
  const [selId, setSelId] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingEtapas, setSavingEtapas] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const selecionado = templates.find((t) => t.id === selId) || null;

  const loadTemplates = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setLoading(true);
    try {
      const list = await sigo.entities.FluxoTemplate.filter(
        { empresa_id: empresaAtiva.id },
        { sort_by: "ordem" }
      );
      setTemplates(list || []);
      if (list?.length && !list.find((t) => t.id === selId)) setSelId(list[0].id);
    } catch (e) {
      console.error("Erro ao carregar fluxos:", e);
      alert("Erro ao carregar processos: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [empresaAtiva?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadEtapas = useCallback(async (templateId) => {
    if (!templateId) {
      setEtapas([]);
      return;
    }
    try {
      const list = await sigo.entities.FluxoEtapaTemplate.filter(
        { fluxo_template_id: templateId },
        { sort_by: "ordem" }
      );
      setEtapas(
        (list || []).map((e) => ({
          _key: e.id,
          nome: e.nome || "",
          tipo: e.tipo || "etapa",
          papel_responsavel: e.papel_responsavel || "",
          papel_aprovador: e.papel_aprovador || "",
          atividades: e.atividades || "",
          opcoes: Array.isArray(e.opcoes) ? e.opcoes : [],
        }))
      );
    } catch (e) {
      console.error("Erro ao carregar etapas:", e);
      alert("Erro ao carregar etapas: " + (e?.message || e));
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadEtapas(selId);
  }, [selId, loadEtapas]);

  // ---------- processos (templates) ----------
  const novoProcesso = async () => {
    const nome = (prompt("Nome do novo processo:", "Novo processo") || "").trim();
    if (!nome) return;
    try {
      const t = await sigo.entities.FluxoTemplate.create({
        empresa_id: empresaAtiva.id,
        nome,
        entidade_alvo: "oportunidade",
        status: "rascunho",
        ordem: templates.length,
      });
      await loadTemplates();
      setSelId(t.id);
    } catch (e) {
      alert("Erro ao criar processo: " + (e?.message || e));
    }
  };

  const renomearProcesso = async () => {
    if (!selecionado) return;
    const nome = (prompt("Renomear processo:", selecionado.nome) || "").trim();
    if (!nome) return;
    await sigo.entities.FluxoTemplate.update(selecionado.id, { nome });
    await loadTemplates();
  };

  const excluirProcesso = async () => {
    if (!selecionado) return;
    if (!confirm(`Excluir o processo "${selecionado.nome}" e todas as suas etapas?`)) return;
    const e = await sigo.entities.FluxoEtapaTemplate.filter({ fluxo_template_id: selecionado.id });
    await Promise.allSettled((e || []).map((x) => sigo.entities.FluxoEtapaTemplate.delete(x.id)));
    await sigo.entities.FluxoTemplate.delete(selecionado.id);
    setSelId(null);
    await loadTemplates();
  };

  const alternarStatus = async () => {
    if (!selecionado) return;
    const novo = selecionado.status === "ativo" ? "rascunho" : "ativo";
    await sigo.entities.FluxoTemplate.update(selecionado.id, { status: novo });
    await loadTemplates();
  };

  // ---------- etapas (estado local; salva em lote) ----------
  const updEtapa = (idx, campo, valor) =>
    setEtapas((arr) => arr.map((e, i) => (i === idx ? { ...e, [campo]: valor } : e)));

  const addEtapa = () => setEtapas((arr) => [...arr, novaEtapa()]);

  const removeEtapa = (idx) => setEtapas((arr) => arr.filter((_, i) => i !== idx));

  const moveEtapa = (idx, dir) =>
    setEtapas((arr) => {
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return arr;
      const cp = [...arr];
      [cp[idx], cp[j]] = [cp[j], cp[idx]];
      return cp;
    });

  const salvarEtapas = async () => {
    if (!selecionado) return;
    setSavingEtapas(true);
    try {
      // Substitui as etapas do template: apaga as atuais e recria na ordem.
      const atuais = await sigo.entities.FluxoEtapaTemplate.filter({
        fluxo_template_id: selecionado.id,
      });
      await Promise.allSettled(
        (atuais || []).map((x) => sigo.entities.FluxoEtapaTemplate.delete(x.id))
      );
      await Promise.all(
        etapas.map((e, i) =>
          sigo.entities.FluxoEtapaTemplate.create({
            empresa_id: empresaAtiva.id,
            fluxo_template_id: selecionado.id,
            ordem: i,
            nome: e.nome || `Etapa ${i + 1}`,
            tipo: e.tipo || "etapa",
            papel_responsavel: e.papel_responsavel || null,
            papel_aprovador: e.papel_aprovador || null,
            exige_aprovacao: !!e.papel_aprovador,
            atividades: e.atividades || null,
            opcoes: Array.isArray(e.opcoes) ? e.opcoes : [],
          })
        )
      );
      setSavedAt(new Date().toLocaleTimeString("pt-BR"));
    } catch (e) {
      alert("Erro ao salvar etapas: " + (e?.message || e));
    } finally {
      setSavingEtapas(false);
    }
  };

  // ---------- importar do mapa-processos.html (JSON) ----------
  const importarJSON = async () => {
    let obj;
    try {
      obj = JSON.parse(importText);
    } catch {
      alert("JSON inválido. Cole o conteúdo exportado do editor de mapa.");
      return;
    }
    const procs = obj?.processes;
    if (!procs || typeof procs !== "object") {
      alert("JSON não tem 'processes'. É o arquivo do mapa-processos?");
      return;
    }
    if (!confirm(`Importar ${Object.keys(procs).length} processo(s) como rascunho?`)) return;
    try {
      let ordemProc = templates.length;
      for (const [, p] of Object.entries(procs)) {
        const tpl = await sigo.entities.FluxoTemplate.create({
          empresa_id: empresaAtiva.id,
          nome: p.nome || "Processo importado",
          entidade_alvo: "oportunidade",
          status: "rascunho",
          ordem: ordemProc++,
          origem_json: p,
        });
        const steps = Array.isArray(p.steps) ? p.steps : [];
        await Promise.all(
          steps.map((s, i) => {
            const opcoes = (p.links || [])
              .filter((l) => l.from === s.id && l.label)
              .map((l) => l.label);
            const atividades =
              s.atividades || (Array.isArray(s.checklist) ? s.checklist.join("\n") : "") || "";
            return sigo.entities.FluxoEtapaTemplate.create({
              empresa_id: empresaAtiva.id,
              fluxo_template_id: tpl.id,
              ordem: i,
              nome: s.nome || `Etapa ${i + 1}`,
              tipo: TIPOS.includes(s.tipo) ? s.tipo : "etapa",
              papel_responsavel: s.responsavel || null,
              papel_aprovador: s.aprova || null,
              exige_aprovacao: !!s.aprova,
              atividades: atividades || null,
              opcoes,
            });
          })
        );
      }
      setShowImport(false);
      setImportText("");
      await loadTemplates();
      alert("Importado! Os processos entraram como rascunho.");
    } catch (e) {
      alert("Erro ao importar: " + (e?.message || e));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando processos…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Workflow className="w-4 h-4" /> Processos / Fluxos de trabalho
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Desenhe os processos da empresa: cada etapa com <b>quem executa</b> e (opcional){" "}
            <b>quem aprova</b>. Por enquanto é a planta (não executa nada ainda) — o motor de
            aprovação vai usar isso depois.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport((v) => !v)}>
            <Upload className="w-4 h-4 mr-1" /> Importar do mapa (JSON)
          </Button>
          <Button size="sm" onClick={novoProcesso}>
            <Plus className="w-4 h-4 mr-1" /> Novo processo
          </Button>
        </div>
      </div>

      {showImport && (
        <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-slate-50 space-y-2">
          <Label className="text-xs">Cole o JSON exportado do editor de mapa-processos</Label>
          <Textarea
            rows={5}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"processes": { ... }}'
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={importarJSON} disabled={!importText.trim()}>
              Importar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowImport(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-sm text-slate-500 border rounded-lg p-6 text-center">
          Nenhum processo ainda. Crie um <b>Novo processo</b> ou <b>Importe</b> o JSON do mapa.
        </div>
      ) : (
        <>
          {/* seletor de processos */}
          <div className="flex gap-2 flex-wrap">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelId(t.id)}
                className={
                  "px-3 py-1.5 rounded-full text-sm border " +
                  (t.id === selId
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")
                }
              >
                {t.nome}
                {t.status === "ativo" && <span className="ml-1 text-emerald-400">●</span>}
              </button>
            ))}
          </div>

          {selecionado && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{selecionado.nome}</span>
                  <Badge variant={selecionado.status === "ativo" ? "default" : "secondary"}>
                    {selecionado.status === "ativo"
                      ? "Ativo (v" + selecionado.versao + ")"
                      : "Rascunho"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={renomearProcesso}>
                    Renomear
                  </Button>
                  <Button variant="outline" size="sm" onClick={alternarStatus}>
                    {selecionado.status === "ativo" ? "Voltar a rascunho" : "Publicar (ativar)"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200"
                    onClick={excluirProcesso}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* etapas */}
              <div className="space-y-2">
                {etapas.map((e, i) => (
                  <div key={e._key} className="border rounded-md p-3 bg-slate-50 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-5">{i + 1}</span>
                      <Input
                        value={e.nome}
                        onChange={(ev) => updEtapa(i, "nome", ev.target.value)}
                        placeholder="Nome da etapa"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveEtapa(i, -1)}
                        title="subir"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveEtapa(i, 1)}
                        title="descer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={() => removeEtapa(i)}
                        title="remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-slate-500">Tipo</Label>
                        <Select value={e.tipo} onValueChange={(v) => updEtapa(i, "tipo", v)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIPOS.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Executa (responsável)</Label>
                        <Input
                          className="mt-1"
                          list="papeis-sugeridos"
                          value={e.papel_responsavel}
                          onChange={(ev) => updEtapa(i, "papel_responsavel", ev.target.value)}
                          placeholder="ex.: Analista"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Aprova (gate)</Label>
                        <Input
                          className="mt-1"
                          list="papeis-sugeridos"
                          value={e.papel_aprovador}
                          onChange={(ev) => updEtapa(i, "papel_aprovador", ev.target.value)}
                          placeholder="ex.: Gestor (vazio = sem aprovação)"
                        />
                      </div>
                    </div>

                    {e.tipo === "decisao" && (
                      <div>
                        <Label className="text-xs text-amber-700">
                          Opções da decisão (uma por linha — ex.: Aprovado / Reprovado)
                        </Label>
                        <Textarea
                          className="mt-1"
                          rows={2}
                          value={(e.opcoes || []).join("\n")}
                          onChange={(ev) =>
                            updEtapa(
                              i,
                              "opcoes",
                              ev.target.value
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean)
                            )
                          }
                          placeholder={"Aprovado\nReprovado"}
                        />
                      </div>
                    )}

                    <div>
                      <Label className="text-xs text-slate-500">
                        Checklist / atividades (uma por linha)
                      </Label>
                      <Textarea
                        className="mt-1"
                        rows={2}
                        value={e.atividades}
                        onChange={(ev) => updEtapa(i, "atividades", ev.target.value)}
                        placeholder={"Conferir documentos\nValidar valores"}
                      />
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={addEtapa}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar etapa
                  </Button>
                  <div className="flex items-center gap-2">
                    {savedAt && <span className="text-xs text-emerald-600">salvo {savedAt}</span>}
                    <Button size="sm" onClick={salvarEtapas} disabled={savingEtapas}>
                      {savingEtapas ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-1" />
                      )}
                      Salvar etapas
                    </Button>
                  </div>
                </div>
              </div>

              {/* prévia (somente leitura) */}
              {etapas.length > 0 && (
                <div className="mt-2 border-t pt-3">
                  <Label className="text-xs text-slate-500">Prévia do fluxo</Label>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                    {etapas.map((e, i) => (
                      <React.Fragment key={e._key}>
                        <span
                          className={
                            "px-2 py-1 rounded border " +
                            (e.tipo === "decisao"
                              ? "bg-amber-50 border-amber-300 text-amber-800"
                              : e.tipo === "inicio" || e.tipo === "fim"
                                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                                : "bg-white border-slate-300 text-slate-700")
                          }
                          title={
                            (e.papel_responsavel ? "👤 " + e.papel_responsavel : "") +
                            (e.papel_aprovador ? " · ✔ " + e.papel_aprovador : "")
                          }
                        >
                          {e.tipo === "decisao" ? "◇ " : ""}
                          {e.nome}
                          {e.papel_aprovador ? " ✔" : ""}
                        </span>
                        {i < etapas.length - 1 && <span className="text-slate-400">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <datalist id="papeis-sugeridos">
        {PAPEIS_SUGERIDOS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}
