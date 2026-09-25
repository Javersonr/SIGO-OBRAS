import React, { useEffect, useMemo, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Landmark, Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fmtIndice,
  fmtMoeda,
  inteiroOuNull,
  numeroOuNull,
  statusValidade,
  textoOuNull,
} from "./acervo-utils";
import { Selo } from "./AcervoUi";

const PORTES = ["ME", "EPP", "Demais"];

let seq = 0;
const chave = () => `k${++seq}`;
const lista = (v) => (Array.isArray(v) ? v : []);

/** Tira chaves vazias dos itens de jsonb (não grava "indice": null à toa). */
function compactar(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "_k" || v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}

function paraForm(p) {
  const v = (x) => x ?? "";
  return {
    razao_social_anterior: v(p?.razao_social_anterior),
    registro_crea_pj: v(p?.registro_crea_pj),
    porte: v(p?.porte),
    capital_social: v(p?.capital_social),
    capital_social_data: v(p?.capital_social_data),
    patrimonio_liquido: v(p?.patrimonio_liquido),
    pl_data_base: v(p?.pl_data_base),
    ccl: v(p?.ccl),
    liquidez_corrente: v(p?.liquidez_corrente),
    liquidez_geral: v(p?.liquidez_geral),
    solvencia_geral: v(p?.solvencia_geral),
    endividamento_geral: v(p?.endividamento_geral),
    exercicio_balanco: v(p?.exercicio_balanco),
    balanco_registro: v(p?.balanco_registro),
    observacoes: v(p?.observacoes),
    faturamento: lista(p?.faturamento).map((f) => ({
      ...f,
      _k: chave(),
      ano: v(f?.ano),
      receita_bruta: v(f?.receita_bruta),
    })),
    cadastros: lista(p?.cadastros).map((c) => ({
      ...c,
      _k: chave(),
      orgao: v(c?.orgao),
      codigo: v(c?.codigo),
      situacao: v(c?.situacao),
      validade: v(c?.validade),
      indice: v(c?.indice),
      ressalvas: v(c?.ressalvas),
      grupos: lista(c?.grupos).map((g) => ({
        ...g,
        _k: chave(),
        codigo: v(g?.codigo),
        descricao: v(g?.descricao),
        validade: v(g?.validade),
      })),
    })),
    certidoes: lista(p?.certidoes).map((c) => ({
      ...c,
      _k: chave(),
      tipo: v(c?.tipo),
      numero: v(c?.numero),
      emissao: v(c?.emissao),
      validade: v(c?.validade),
      observacao: v(c?.observacao),
    })),
    alertas: lista(p?.alertas).map((t) => ({
      _k: chave(),
      texto: typeof t === "string" ? t : JSON.stringify(t),
    })),
  };
}

function payload(f) {
  const t = (x) => (typeof x === "string" ? x.trim() : x);
  return {
    razao_social_anterior: textoOuNull(f.razao_social_anterior),
    registro_crea_pj: textoOuNull(f.registro_crea_pj),
    porte: textoOuNull(f.porte),
    capital_social: numeroOuNull(f.capital_social),
    capital_social_data: f.capital_social_data || null,
    patrimonio_liquido: numeroOuNull(f.patrimonio_liquido),
    pl_data_base: f.pl_data_base || null,
    ccl: numeroOuNull(f.ccl),
    liquidez_corrente: numeroOuNull(f.liquidez_corrente),
    liquidez_geral: numeroOuNull(f.liquidez_geral),
    solvencia_geral: numeroOuNull(f.solvencia_geral),
    endividamento_geral: numeroOuNull(f.endividamento_geral),
    exercicio_balanco: inteiroOuNull(f.exercicio_balanco),
    balanco_registro: textoOuNull(f.balanco_registro),
    observacoes: textoOuNull(f.observacoes),
    faturamento: f.faturamento
      .map((x) =>
        compactar({
          ...x,
          ano: inteiroOuNull(x.ano),
          receita_bruta: numeroOuNull(x.receita_bruta),
        })
      )
      .filter((x) => x.ano !== undefined || x.receita_bruta !== undefined),
    cadastros: f.cadastros
      .map(({ grupos, ...c }) => ({
        ...compactar({
          ...c,
          orgao: t(c.orgao),
          codigo: t(c.codigo),
          situacao: t(c.situacao),
          indice: t(c.indice),
          ressalvas: t(c.ressalvas),
        }),
        grupos: grupos
          .map((g) => compactar({ ...g, codigo: t(g.codigo), descricao: t(g.descricao) }))
          .filter((g) => g.codigo || g.descricao),
      }))
      .filter((c) => c.orgao || c.codigo || c.grupos.length),
    certidoes: f.certidoes
      .map((c) =>
        compactar({
          ...c,
          tipo: t(c.tipo),
          numero: t(c.numero),
          observacao: t(c.observacao),
        })
      )
      .filter((c) => c.tipo || c.numero),
    alertas: f.alertas.map((a) => String(a.texto || "").trim()).filter(Boolean),
  };
}

function diffCampos(novo, antigo) {
  const out = {};
  for (const k of Object.keys(novo)) {
    if (JSON.stringify(novo[k]) !== JSON.stringify(antigo[k])) out[k] = novo[k];
  }
  return out;
}

function ValidadeSelo({ iso }) {
  const s = statusValidade(iso);
  if (!s) return null;
  const cor = s.status === "vencida" ? "red" : s.status === "vence_logo" ? "amber" : "green";
  return <Selo cor={cor}>{s.texto}</Selo>;
}

function Bloco({ titulo, descricao, children, acao }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-800">{titulo}</h3>
            {descricao && <p className="text-xs text-slate-500">{descricao}</p>}
          </div>
          {acao}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function CampoForm({ label, children, className, dica }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-slate-600">{label}</Label>
      {children}
      {dica && <p className="text-[11px] text-slate-500">{dica}</p>}
    </div>
  );
}

const BotaoRemover = ({ onClick, title = "Remover" }) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="h-8 w-8 flex-shrink-0 text-slate-400 hover:text-red-600"
    title={title}
    onClick={onClick}
  >
    <Trash2 className="h-4 w-4" />
  </Button>
);

// Só leitura: o <fieldset disabled> trava os campos; sem o opacity-50 do
// disabled (dados do balanço precisam continuar legíveis).
const CLASSE_SO_LEITURA =
  "[&_button:disabled]:opacity-100 [&_input:disabled]:cursor-default [&_input:disabled]:opacity-100 [&_textarea:disabled]:cursor-default [&_textarea:disabled]:opacity-100";

/**
 * Aba Econômico-financeiro e registros: o acervo_perfil (1 por empresa).
 * podeEditar=false (padrão) → só leitura: campos travados, sem criar/salvar.
 */
export default function PerfilEconomico({ perfil, empresaId, onRecarregar, podeEditar = false }) {
  const [form, setForm] = useState(() => paraForm(perfil));
  const [salvando, setSalvando] = useState(false);
  const [criando, setCriando] = useState(false);

  // recarrega o formulário quando o registro muda no banco
  useEffect(() => {
    setForm(paraForm(perfil));
  }, [perfil]);

  const original = useMemo(() => payload(paraForm(perfil)), [perfil]);
  const atual = useMemo(() => payload(form), [form]);
  const mudancas = useMemo(() => diffCampos(atual, original), [atual, original]);
  const sujo = Object.keys(mudancas).length > 0;

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const setItem = (lista_, k, campo, valor) =>
    setForm((f) => ({
      ...f,
      [lista_]: f[lista_].map((x) => (x._k === k ? { ...x, [campo]: valor } : x)),
    }));
  const addItem = (lista_, item) =>
    setForm((f) => ({ ...f, [lista_]: [...f[lista_], { _k: chave(), ...item }] }));
  const delItem = (lista_, k) =>
    setForm((f) => ({ ...f, [lista_]: f[lista_].filter((x) => x._k !== k) }));
  const setGrupo = (cadK, gK, campo, valor) =>
    setForm((f) => ({
      ...f,
      cadastros: f.cadastros.map((c) =>
        c._k !== cadK
          ? c
          : { ...c, grupos: c.grupos.map((g) => (g._k === gK ? { ...g, [campo]: valor } : g)) }
      ),
    }));

  const criarPerfil = async () => {
    if (!podeEditar) return;
    setCriando(true);
    try {
      await sigo.entities.AcervoPerfil.create({ empresa_id: empresaId });
      toast.success("Perfil criado — preencha os dados");
      onRecarregar?.();
    } catch (e) {
      console.error("[Acervo] criar perfil:", e);
      toast.error("Erro ao criar o perfil" + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setCriando(false);
    }
  };

  const salvar = async () => {
    if (!podeEditar || !perfil?.id || !sujo) return;
    setSalvando(true);
    try {
      await sigo.entities.AcervoPerfil.update(perfil.id, mudancas);
      toast.success("Perfil salvo");
      onRecarregar?.();
    } catch (e) {
      console.error("[Acervo] salvar perfil:", e);
      toast.error("Erro ao salvar" + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setSalvando(false);
    }
  };

  if (!perfil) {
    return (
      <div className="rounded-xl bg-slate-50 py-12 text-center">
        <Landmark className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="font-medium text-slate-600">Perfil econômico-financeiro não cadastrado</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Capital social, patrimônio líquido, índices do balanço, faturamento, cadastros, certidões
          e alertas que a IA deve citar em toda análise.
        </p>
        {podeEditar && (
          <Button
            className="mt-4 bg-amber-500 hover:bg-amber-600"
            disabled={criando || !empresaId}
            onClick={criarPerfil}
          >
            {criando ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Criar perfil
          </Button>
        )}
      </div>
    );
  }

  const campoNumero = (campo, { step = "0.01", moeda = false, indice = false } = {}) => (
    <>
      <Input
        type="number"
        step={step}
        value={form[campo]}
        onChange={(e) => set(campo, e.target.value)}
      />
      {form[campo] !== "" && (moeda || indice) && (
        <p className="text-[11px] text-slate-500">
          {moeda ? fmtMoeda(numeroOuNull(form[campo])) : fmtIndice(numeroOuNull(form[campo]))}
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Qualificação econômico-financeira, registros e alertas usados pela IA.
        </p>
        {podeEditar && (
          <Button
            className="bg-amber-500 hover:bg-amber-600"
            disabled={!sujo || salvando}
            onClick={salvar}
          >
            {salvando ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Salvar perfil
          </Button>
        )}
      </div>

      <fieldset
        disabled={!podeEditar}
        className={cn("min-w-0 space-y-4", !podeEditar && CLASSE_SO_LEITURA)}
      >
        <Bloco
          titulo="Alertas"
          descricao="Pontos que a IA cita em TODA análise de edital desta empresa."
          acao={
            podeEditar && (
              <Button size="sm" variant="outline" onClick={() => addItem("alertas", { texto: "" })}>
                <Plus className="mr-1 h-4 w-4" /> Alerta
              </Button>
            )
          }
        >
          {form.alertas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum alerta.</p>
          ) : (
            <div className="space-y-2">
              {form.alertas.map((a) => (
                <div key={a._k} className="flex items-start gap-2">
                  <AlertTriangle className="mt-2.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <Textarea
                    rows={2}
                    className="border-amber-200 bg-amber-50/40"
                    value={a.texto}
                    onChange={(e) => setItem("alertas", a._k, "texto", e.target.value)}
                  />
                  {podeEditar && <BotaoRemover onClick={() => delItem("alertas", a._k)} />}
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Identificação e registro">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <CampoForm
              label="Razão social anterior"
              dica="CATs no nome antigo: juntar a alteração contratual"
            >
              <Input
                value={form.razao_social_anterior}
                onChange={(e) => set("razao_social_anterior", e.target.value)}
              />
            </CampoForm>
            <CampoForm label="Registro CREA (PJ)">
              <Input
                value={form.registro_crea_pj}
                onChange={(e) => set("registro_crea_pj", e.target.value)}
              />
            </CampoForm>
            <CampoForm label="Porte">
              <Select
                value={form.porte || "__"}
                onValueChange={(v) => set("porte", v === "__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">— não informado —</SelectItem>
                  {PORTES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                  {form.porte && !PORTES.includes(form.porte) && (
                    <SelectItem value={form.porte}>{form.porte}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </CampoForm>
          </div>
        </Bloco>

        <Bloco titulo="Capital, patrimônio e índices">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <CampoForm label="Capital social (R$)">
              {campoNumero("capital_social", { moeda: true })}
            </CampoForm>
            <CampoForm label="Data do capital social">
              <Input
                type="date"
                value={form.capital_social_data}
                onChange={(e) => set("capital_social_data", e.target.value)}
              />
            </CampoForm>
            <CampoForm label="Patrimônio líquido (R$)">
              {campoNumero("patrimonio_liquido", { moeda: true })}
            </CampoForm>
            <CampoForm label="Data-base do PL">
              <Input
                type="date"
                value={form.pl_data_base}
                onChange={(e) => set("pl_data_base", e.target.value)}
              />
            </CampoForm>
            <CampoForm label="Capital circulante líquido (R$)">
              {campoNumero("ccl", { moeda: true })}
            </CampoForm>
            <CampoForm label="Exercício do balanço">
              <Input
                type="number"
                step="1"
                value={form.exercicio_balanco}
                onChange={(e) => set("exercicio_balanco", e.target.value)}
              />
            </CampoForm>
            <CampoForm label="Registro do balanço (Junta)" className="col-span-2">
              <Input
                value={form.balanco_registro}
                onChange={(e) => set("balanco_registro", e.target.value)}
              />
            </CampoForm>
            <CampoForm label="Liquidez corrente (LC)">
              {campoNumero("liquidez_corrente", { step: "0.001", indice: true })}
            </CampoForm>
            <CampoForm label="Liquidez geral (LG)">
              {campoNumero("liquidez_geral", { step: "0.001", indice: true })}
            </CampoForm>
            <CampoForm label="Solvência geral (SG)">
              {campoNumero("solvencia_geral", { step: "0.001", indice: true })}
            </CampoForm>
            <CampoForm label="Endividamento geral">
              {campoNumero("endividamento_geral", { step: "0.001", indice: true })}
            </CampoForm>
          </div>
        </Bloco>

        <Bloco
          titulo="Faturamento"
          descricao="Receita bruta por exercício."
          acao={
            podeEditar && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => addItem("faturamento", { ano: "", receita_bruta: "" })}
              >
                <Plus className="mr-1 h-4 w-4" /> Exercício
              </Button>
            )
          }
        >
          {form.faturamento.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum exercício informado.</p>
          ) : (
            <div className="space-y-2">
              {form.faturamento.map((f) => (
                <div key={f._k} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="w-24"
                    type="number"
                    step="1"
                    placeholder="Ano"
                    value={f.ano}
                    onChange={(e) => setItem("faturamento", f._k, "ano", e.target.value)}
                  />
                  <Input
                    className="w-48"
                    type="number"
                    step="0.01"
                    placeholder="Receita bruta"
                    value={f.receita_bruta}
                    onChange={(e) => setItem("faturamento", f._k, "receita_bruta", e.target.value)}
                  />
                  <span className="text-sm tabular-nums text-slate-600">
                    {f.receita_bruta !== "" ? fmtMoeda(numeroOuNull(f.receita_bruta)) : ""}
                  </span>
                  {podeEditar && <BotaoRemover onClick={() => delItem("faturamento", f._k)} />}
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco
          titulo="Cadastros (concessionárias e órgãos)"
          descricao="CRC CEMIG e similares, com os grupos habilitados e as validades."
          acao={
            podeEditar && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  addItem("cadastros", {
                    orgao: "",
                    codigo: "",
                    situacao: "",
                    validade: "",
                    indice: "",
                    ressalvas: "",
                    grupos: [],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Cadastro
              </Button>
            )
          }
        >
          {form.cadastros.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum cadastro.</p>
          ) : (
            <div className="space-y-4">
              {form.cadastros.map((c) => (
                <div key={c._k} className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
                      <CampoForm label="Órgão / concessionária" className="col-span-2">
                        <Input
                          value={c.orgao}
                          onChange={(e) => setItem("cadastros", c._k, "orgao", e.target.value)}
                        />
                      </CampoForm>
                      <CampoForm label="Código / nº">
                        <Input
                          value={c.codigo}
                          onChange={(e) => setItem("cadastros", c._k, "codigo", e.target.value)}
                        />
                      </CampoForm>
                      <CampoForm label="Situação">
                        <Input
                          value={c.situacao}
                          onChange={(e) => setItem("cadastros", c._k, "situacao", e.target.value)}
                        />
                      </CampoForm>
                      <CampoForm label="Validade">
                        <Input
                          type="date"
                          value={c.validade}
                          onChange={(e) => setItem("cadastros", c._k, "validade", e.target.value)}
                        />
                        <ValidadeSelo iso={c.validade} />
                      </CampoForm>
                      <CampoForm
                        label="Índices / classificação"
                        className="col-span-2 md:col-span-3"
                      >
                        <Input
                          value={c.indice}
                          onChange={(e) => setItem("cadastros", c._k, "indice", e.target.value)}
                        />
                      </CampoForm>
                      <CampoForm label="Ressalvas" className="col-span-2 md:col-span-4">
                        <Textarea
                          rows={2}
                          value={c.ressalvas}
                          onChange={(e) => setItem("cadastros", c._k, "ressalvas", e.target.value)}
                        />
                      </CampoForm>
                    </div>
                    {podeEditar && (
                      <BotaoRemover
                        title="Remover cadastro"
                        onClick={() => delItem("cadastros", c._k)}
                      />
                    )}
                  </div>
                  <div className="space-y-2 rounded-md bg-slate-50 p-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Grupos ({c.grupos.length})
                    </p>
                    {c.grupos.map((g) => (
                      <div key={g._k} className="flex flex-wrap items-center gap-2">
                        <Input
                          className="h-8 w-24 text-sm"
                          placeholder="Código"
                          value={g.codigo}
                          onChange={(e) => setGrupo(c._k, g._k, "codigo", e.target.value)}
                        />
                        <Input
                          className="h-8 min-w-[12rem] flex-1 text-sm"
                          placeholder="Descrição"
                          value={g.descricao}
                          onChange={(e) => setGrupo(c._k, g._k, "descricao", e.target.value)}
                        />
                        <Input
                          className="h-8 w-40 text-sm"
                          type="date"
                          value={g.validade}
                          onChange={(e) => setGrupo(c._k, g._k, "validade", e.target.value)}
                        />
                        <ValidadeSelo iso={g.validade} />
                        {podeEditar && (
                          <BotaoRemover
                            title="Remover grupo"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                cadastros: f.cadastros.map((x) =>
                                  x._k === c._k
                                    ? { ...x, grupos: x.grupos.filter((y) => y._k !== g._k) }
                                    : x
                                ),
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                    {podeEditar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-amber-700"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            cadastros: f.cadastros.map((x) =>
                              x._k === c._k
                                ? {
                                    ...x,
                                    grupos: [
                                      ...x.grupos,
                                      { _k: chave(), codigo: "", descricao: "", validade: "" },
                                    ],
                                  }
                                : x
                            ),
                          }))
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Grupo
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco
          titulo="Certidões"
          descricao="Vencidas em vermelho; vencendo em até 30 dias em âmbar."
          acao={
            podeEditar && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  addItem("certidoes", {
                    tipo: "",
                    numero: "",
                    emissao: "",
                    validade: "",
                    observacao: "",
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Certidão
              </Button>
            )
          }
        >
          {form.certidoes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma certidão.</p>
          ) : (
            <div className="space-y-3">
              {form.certidoes.map((c) => {
                const s = statusValidade(c.validade);
                return (
                  <div
                    key={c._k}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border p-3",
                      s?.status === "vencida"
                        ? "border-red-200 bg-red-50/50"
                        : s?.status === "vence_logo"
                          ? "border-amber-200 bg-amber-50/50"
                          : "border-slate-200"
                    )}
                  >
                    <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
                      <CampoForm label="Tipo" className="col-span-2">
                        <Input
                          value={c.tipo}
                          onChange={(e) => setItem("certidoes", c._k, "tipo", e.target.value)}
                        />
                      </CampoForm>
                      <CampoForm label="Número">
                        <Input
                          value={c.numero}
                          onChange={(e) => setItem("certidoes", c._k, "numero", e.target.value)}
                        />
                      </CampoForm>
                      <CampoForm label="Emissão">
                        <Input
                          type="date"
                          value={c.emissao}
                          onChange={(e) => setItem("certidoes", c._k, "emissao", e.target.value)}
                        />
                      </CampoForm>
                      <CampoForm label="Validade">
                        <Input
                          type="date"
                          value={c.validade}
                          onChange={(e) => setItem("certidoes", c._k, "validade", e.target.value)}
                        />
                        <ValidadeSelo iso={c.validade} />
                      </CampoForm>
                      <CampoForm label="Observação" className="col-span-2 md:col-span-3">
                        <Textarea
                          rows={2}
                          value={c.observacao}
                          onChange={(e) => setItem("certidoes", c._k, "observacao", e.target.value)}
                        />
                      </CampoForm>
                    </div>
                    {podeEditar && (
                      <BotaoRemover
                        title="Remover certidão"
                        onClick={() => delItem("certidoes", c._k)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Bloco>

        <Bloco
          titulo="Observações"
          descricao="Contexto livre para a IA (dados da empresa, regras de ouro, divergências)."
        >
          <Textarea
            rows={10}
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
          />
        </Bloco>
      </fieldset>

      {podeEditar && sujo && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 shadow-lg">
          <span className="text-sm text-amber-800">Alterações não salvas</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={salvando}
            onClick={() => setForm(paraForm(perfil))}
          >
            <Undo2 className="mr-1 h-4 w-4" /> Descartar
          </Button>
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-600"
            disabled={salvando}
            onClick={salvar}
          >
            {salvando ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      )}
    </div>
  );
}
