import React, { useEffect, useMemo, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertTriangle, HardHat, Loader2, Pencil, Plus, Trash2, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtData, semAcento, textoOuNull, TIPOS_DOC } from "./acervo-utils";
import { Campo, Selo } from "./AcervoUi";

const VAZIO = {
  nome: "",
  registro: "",
  titulos: "",
  atribuicoes: "",
  restricoes: "",
  vinculo_desde: "",
  responsavel_tecnico: true,
  ativo: true,
  observacoes: "",
};

const paraForm = (p) =>
  p
    ? {
        nome: p.nome || "",
        registro: p.registro || "",
        titulos: p.titulos || "",
        atribuicoes: p.atribuicoes || "",
        restricoes: p.restricoes || "",
        vinculo_desde: p.vinculo_desde || "",
        responsavel_tecnico: p.responsavel_tecnico !== false,
        ativo: p.ativo !== false,
        observacoes: p.observacoes || "",
      }
    : { ...VAZIO };

function ProfissionalSheet({ open, onOpenChange, profissional, empresaId, onSalvo }) {
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) setForm(paraForm(profissional));
  }, [open, profissional]);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const salvar = async () => {
    if (!textoOuNull(form.nome)) {
      toast.error("Informe o nome do profissional");
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        registro: textoOuNull(form.registro),
        titulos: textoOuNull(form.titulos),
        atribuicoes: textoOuNull(form.atribuicoes),
        restricoes: textoOuNull(form.restricoes),
        vinculo_desde: form.vinculo_desde || null,
        responsavel_tecnico: !!form.responsavel_tecnico,
        ativo: !!form.ativo,
        observacoes: textoOuNull(form.observacoes),
      };
      if (profissional?.id) {
        await sigo.entities.AcervoProfissional.update(profissional.id, payload);
      } else {
        await sigo.entities.AcervoProfissional.create({ ...payload, empresa_id: empresaId });
      }
      toast.success(profissional?.id ? "Profissional atualizado" : "Profissional cadastrado");
      onSalvo?.();
      onOpenChange(false);
    } catch (e) {
      console.error("[Acervo] salvar profissional:", e);
      toast.error("Erro ao salvar" + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <SheetContent className="flex flex-col gap-0 p-0">
        <SheetHeader className="flex-shrink-0 border-b px-6 py-4">
          <SheetTitle>
            {profissional?.id ? `Editar ${profissional.nome}` : "Novo profissional"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-slate-600">Nome *</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Registro (CREA / RNP)</Label>
              <Input
                value={form.registro}
                placeholder="CREA-MG 000.000/D · RNP 0000000000"
                onChange={(e) => set("registro", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Vínculo desde</Label>
              <Input
                type="date"
                value={form.vinculo_desde}
                onChange={(e) => set("vinculo_desde", e.target.value)}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-slate-600">Títulos</Label>
              <Input
                value={form.titulos}
                placeholder="Engenheiro Eletricista; Engenheiro de Segurança do Trabalho"
                onChange={(e) => set("titulos", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Atribuições</Label>
              <Textarea
                rows={4}
                value={form.atribuicoes}
                placeholder="arts. 8º e 9º da Res. CONFEA 218/73…"
                onChange={(e) => set("atribuicoes", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Restrições</Label>
              <Textarea
                rows={4}
                className="border-amber-300 focus-visible:ring-amber-400"
                value={form.restricoes}
                onChange={(e) => set("restricoes", e.target.value)}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-slate-600">Observações</Label>
              <Textarea
                rows={4}
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={form.responsavel_tecnico}
                onCheckedChange={(v) => set("responsavel_tecnico", v === true)}
              />
              Responsável técnico da empresa
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox checked={form.ativo} onCheckedChange={(v) => set("ativo", v === true)} />
              Ativo no quadro técnico
            </label>
          </div>
        </div>
        <div className="flex flex-shrink-0 justify-end gap-3 border-t px-6 py-4">
          <Button variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-600" disabled={salvando} onClick={salvar}>
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Aba Quadro técnico: capacidade técnico-profissional (RTs).
 * podeEditar=false (padrão) → só leitura: sem criar/editar/excluir.
 */
export default function QuadroTecnico({
  profissionais,
  atestados,
  empresaId,
  onRecarregar,
  podeEditar = false,
}) {
  const [editando, setEditando] = useState(null); // profissional | {} (novo) | null

  // documentos vinculados a cada profissional (pelo id ou pelo nome da CAT)
  const docsPorProf = useMemo(() => {
    const m = new Map();
    for (const p of profissionais) {
      const nome = semAcento(p.nome).trim();
      const docs = atestados.filter(
        (a) =>
          a.profissional_id === p.id || (nome && semAcento(a.profissional_nome).trim() === nome)
      );
      const porTipo = {};
      for (const a of docs) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
      m.set(p.id, { total: docs.length, porTipo });
    }
    return m;
  }, [profissionais, atestados]);

  const excluir = async (p) => {
    if (!podeEditar) return;
    if (!window.confirm(`Excluir ${p.nome} do quadro técnico?`)) return;
    try {
      await sigo.entities.AcervoProfissional.delete(p.id);
      toast.success("Profissional excluído");
      onRecarregar?.();
    } catch (e) {
      console.error("[Acervo] excluir profissional:", e);
      toast.error("Erro ao excluir" + (e?.message ? `: ${e.message}` : ""));
    }
  };

  const ordenados = [...profissionais].sort(
    (a, b) =>
      Number(b.ativo !== false) - Number(a.ativo !== false) ||
      String(a.nome).localeCompare(String(b.nome), "pt-BR")
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {profissionais.length} profissional(is) — base da capacidade técnico-profissional.
        </p>
        {podeEditar && (
          <Button className="bg-amber-500 hover:bg-amber-600" onClick={() => setEditando({})}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo profissional
          </Button>
        )}
      </div>

      {ordenados.length === 0 ? (
        <div className="rounded-xl bg-slate-50 py-12 text-center">
          <HardHat className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-500">Nenhum profissional no quadro técnico</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ordenados.map((p) => {
            const docs = docsPorProf.get(p.id) || { total: 0, porTipo: {} };
            const inativo = p.ativo === false;
            return (
              <Card key={p.id} className={cn(inativo && "opacity-70")}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100">
                      <HardHat className="h-4 w-4 text-slate-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-800">{p.nome}</span>
                        {p.responsavel_tecnico !== false && <Selo cor="green">RT</Selo>}
                        {inativo && (
                          <Selo icon={UserX} cor="slate">
                            inativo
                          </Selo>
                        )}
                      </div>
                      {p.registro && <p className="text-xs text-slate-500">{p.registro}</p>}
                    </div>
                    {podeEditar && (
                      <div className="flex flex-shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar"
                          onClick={() => setEditando(p)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-600"
                          title="Excluir"
                          onClick={() => excluir(p)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <Campo label="Títulos" className="col-span-2">
                      {p.titulos}
                    </Campo>
                    <Campo label="Atribuições" className="col-span-2">
                      {p.atribuicoes}
                    </Campo>
                    <Campo label="Vínculo desde">
                      {p.vinculo_desde ? fmtData(p.vinculo_desde) : null}
                    </Campo>
                    <Campo label="Documentos no acervo" sempre>
                      {docs.total
                        ? `${docs.total} (${TIPOS_DOC.filter((t) => docs.porTipo[t.id])
                            .map((t) => `${docs.porTipo[t.id]} ${t.label}`)
                            .join(", ")})`
                        : "nenhum"}
                    </Campo>
                  </dl>
                  {p.restricoes && (
                    <p className="flex gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span className="whitespace-pre-line">{p.restricoes}</span>
                    </p>
                  )}
                  {p.observacoes && (
                    <p className="whitespace-pre-line text-xs text-slate-500">{p.observacoes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ProfissionalSheet
        open={podeEditar && !!editando}
        onOpenChange={(v) => !v && setEditando(null)}
        profissional={editando?.id ? editando : null}
        empresaId={empresaId}
        onSalvo={onRecarregar}
      />
    </div>
  );
}
