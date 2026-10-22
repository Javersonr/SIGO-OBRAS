import React, { useEffect, useMemo, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import {
  EXEMPLO_DECLARACAO,
  mensagemDeErroAoSalvarModelo,
  modelosParaEditor,
  preencherModelo,
  validarModelo,
  VARIAVEIS_DECLARACAO,
} from "@/lib/declaracoes-modelos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Selo } from "./AcervoUi";

const SELO_DA_SITUACAO = {
  padrao: { cor: "slate", texto: "padrão" },
  editado: { cor: "amber", texto: "editado" },
  desativado: { cor: "red", texto: "desativado" },
  proprio: { cor: "slate", texto: "próprio" },
};

/** Os 160 primeiros caracteres do texto, em uma linha só. */
function resumoDoTexto(texto) {
  const t = String(texto ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 160 ? `${t.slice(0, 160)}…` : t;
}

const FORM_VAZIO = { titulo: "", texto: "", ativo: true };

/** As linhas vivas de modelo_declaracao da empresa. */
function lerLinhas(empresaId) {
  return sigo.entities.ModeloDeclaracao.filter({ empresa_id: empresaId });
}

/**
 * Cartão "Modelos de declaração" da aba Documentos e certidões: os seis modelos padrão do SIGO (que
 * valem para toda empresa sem gravar nada) e os modelos próprios. A linha em modelo_declaracao
 * (migração 0161) só nasce quando a empresa edita um padrão ou cria um modelo; "Restaurar o padrão"
 * apaga essa linha. O Claude usa estes modelos ao gerar as declarações da licitação.
 * podeEditar=false (padrão) → só leitura: sem criar, editar, restaurar nem excluir.
 * Se a leitura falha (a tabela só existe depois da 0161), o cartão não aparece.
 */
export default function ModelosDeclaracao({ empresaId, podeEditar = false }) {
  const [estado, setEstado] = useState("carregando"); // carregando | indisponivel | pronto
  const [linhas, setLinhas] = useState([]);
  // Janela de edição. `item` = o modelo da lista (null = modelo novo). Fechar só baixa `aberto`:
  // o conteúdo fica até o fim da animação de saída.
  const [edicao, setEdicao] = useState({ aberto: false, item: null, form: FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false); // restaurar ou excluir em andamento
  // Contador de pedidos de leitura (padrão do AcervoTecnico): só a resposta do pedido mais recente vale,
  // então uma resposta atrasada de outra empresa (carga ou recarga pós-gravação) é descartada.
  const pedido = useRef(0);

  useEffect(() => {
    if (!empresaId) return undefined;
    const meu = ++pedido.current;
    setEstado("carregando");
    lerLinhas(empresaId)
      .then((lista) => {
        if (meu !== pedido.current) return;
        setLinhas(Array.isArray(lista) ? lista : []);
        setEstado("pronto");
      })
      .catch((e) => {
        console.error("[Habilitação] modelos de declaração:", e);
        if (meu === pedido.current) setEstado("indisponivel");
      });
    return () => {
      pedido.current += 1; // troca de empresa ou desmontagem: invalida o que ainda está no ar
    };
  }, [empresaId]);

  const lista = useMemo(() => modelosParaEditor(linhas), [linhas]);

  if (estado !== "pronto") return null;

  const recarregar = async () => {
    const meu = ++pedido.current;
    try {
      const atual = await lerLinhas(empresaId);
      if (meu !== pedido.current) return;
      setLinhas(Array.isArray(atual) ? atual : []);
    } catch (e) {
      console.error("[Habilitação] recarregar modelos:", e);
      if (meu !== pedido.current) return;
      toast.error("Não foi possível atualizar a lista. Atualize a página do navegador.");
    }
  };

  const abrirEdicao = (item) =>
    setEdicao({
      aberto: true,
      item,
      form: item ? { titulo: item.titulo, texto: item.texto, ativo: item.ativo } : FORM_VAZIO,
    });
  const fecharEdicao = () => setEdicao((e) => ({ ...e, aberto: false }));
  const setCampo = (campo, valor) =>
    setEdicao((e) => ({ ...e, form: { ...e.form, [campo]: valor } }));
  const inserirVariavel = (nome) =>
    setEdicao((e) => ({ ...e, form: { ...e.form, texto: `${e.form.texto}{${nome}}` } }));

  const salvar = async () => {
    if (!podeEditar || salvando || !edicao.aberto) return;
    const { item, form } = edicao;
    // chaves dos OUTROS modelos próprios (a do padrão, ou a do próprio modelo editado, não conta)
    const chavesDosOutros = lista
      .filter((m) => !m.padrao && m.chave !== item?.chave)
      .map((m) => m.chave);
    const { ok, erros, dados } = validarModelo(
      { chave: item?.chave ?? "", ...form },
      chavesDosOutros
    );
    if (!ok) {
      toast.error(erros[0]);
      return;
    }
    setSalvando(true);
    try {
      if (item?.id) {
        await sigo.entities.ModeloDeclaracao.update(item.id, {
          titulo: dados.titulo,
          texto: dados.texto,
          ativo: dados.ativo,
        });
      } else if (item) {
        // padrão ainda sem linha: nasce com a chave e a ordem do próprio padrão
        await sigo.entities.ModeloDeclaracao.create({
          ...dados,
          empresa_id: empresaId,
          ordem: item.ordem,
        });
      } else {
        // modelo novo: a chave sai do título (validarModelo)
        await sigo.entities.ModeloDeclaracao.create({ ...dados, empresa_id: empresaId });
      }
      toast.success("Modelo salvo");
      fecharEdicao();
      await recarregar();
    } catch (e) {
      console.error("[Habilitação] salvar modelo:", e);
      toast.error(mensagemDeErroAoSalvarModelo(e));
    } finally {
      setSalvando(false);
    }
  };

  // Restaurar o padrão e excluir são a mesma coisa no banco: apagar (deleted_at) a linha do modelo
  const apagarLinha = async (item, { confirmacao, ok, erro }) => {
    if (!podeEditar || trabalhando || !item?.id) return;
    if (!window.confirm(confirmacao)) return;
    setTrabalhando(true);
    try {
      await sigo.entities.ModeloDeclaracao.delete(item.id);
      toast.success(ok);
      await recarregar();
    } catch (e) {
      console.error("[Habilitação] apagar modelo:", e);
      toast.error(erro + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setTrabalhando(false);
    }
  };

  const restaurarPadrao = (item) =>
    apagarLinha(item, {
      confirmacao: `Restaurar o modelo padrão "${item.titulo}"? As alterações da sua empresa neste modelo serão descartadas.`,
      ok: "Modelo padrão restaurado",
      erro: "Erro ao restaurar o padrão",
    });
  const excluir = (item) =>
    apagarLinha(item, {
      confirmacao: `Excluir o modelo "${item.titulo}"? As declarações já geradas não mudam.`,
      ok: "Modelo excluído",
      erro: "Erro ao excluir",
    });

  const previa = preencherModelo(edicao.form.texto, EXEMPLO_DECLARACAO);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-amber-600" /> Modelos de declaração
            </CardTitle>
            <CardDescription>
              O Claude usa estes modelos ao gerar as declarações da licitação. Quando o edital traz
              um modelo próprio, o texto do edital é usado no lugar.
            </CardDescription>
          </div>
          {podeEditar && (
            <Button
              className="bg-amber-500 hover:bg-amber-600"
              disabled={trabalhando}
              onClick={() => abrirEdicao(null)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Novo modelo
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {lista.map((m) => {
            const selo = SELO_DA_SITUACAO[m.situacao] || SELO_DA_SITUACAO.padrao;
            return (
              <li key={m.chave} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 break-words text-sm font-semibold text-slate-800">
                      <span>{m.titulo}</span>
                      <Selo cor={selo.cor}>{selo.texto}</Selo>
                    </p>
                    <p className="break-words text-xs text-slate-500">{resumoDoTexto(m.texto)}</p>
                  </div>
                  {podeEditar && (
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={trabalhando}
                        onClick={() => abrirEdicao(m)}
                      >
                        <Pencil className="mr-1.5 h-4 w-4" /> Editar
                      </Button>
                      {m.padrao && m.id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={trabalhando}
                          onClick={() => restaurarPadrao(m)}
                        >
                          <RotateCcw className="mr-1.5 h-4 w-4" /> Restaurar o padrão
                        </Button>
                      )}
                      {!m.padrao && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-slate-500 hover:text-red-600"
                          disabled={trabalhando}
                          onClick={() => excluir(m)}
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>

      <Dialog
        open={podeEditar && edicao.aberto}
        onOpenChange={(aberto) => {
          if (!aberto && !salvando) fecharEdicao();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edicao.item ? "Editar modelo" : "Novo modelo"}</DialogTitle>
            <DialogDescription>
              {edicao.item?.padrao
                ? "Modelo padrão do SIGO. Ao salvar, a sua empresa passa a usar esta versão; dá para voltar ao padrão depois."
                : "Modelo próprio da sua empresa."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="modelo-declaracao-titulo">Título</Label>
              <Input
                id="modelo-declaracao-titulo"
                value={edicao.form.titulo}
                disabled={salvando}
                onChange={(e) => setCampo("titulo", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="modelo-declaracao-texto">Texto</Label>
              <Textarea
                id="modelo-declaracao-texto"
                rows={14}
                value={edicao.form.texto}
                disabled={salvando}
                onChange={(e) => setCampo("texto", e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">Variáveis:</span>
                {VARIAVEIS_DECLARACAO.map((nome) => (
                  <Button
                    key={nome}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 font-mono text-xs"
                    title="Acrescenta a variável ao fim do texto"
                    disabled={salvando}
                    onClick={() => inserirVariavel(nome)}
                  >
                    {`{${nome}}`}
                  </Button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={edicao.form.ativo}
                disabled={salvando}
                onCheckedChange={(v) => setCampo("ativo", v === true)}
              />
              Ativo (o Claude só usa os modelos ativos)
            </label>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-slate-700">Prévia</p>
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {previa.texto || <span className="text-slate-400">O texto aparece aqui.</span>}
              </div>
              {previa.desconhecidas.length > 0 && (
                <p className="text-xs text-red-600">
                  Variável desconhecida: {previa.desconhecidas.map((n) => `{${n}}`).join(" ")}
                </p>
              )}
              <p className="text-xs text-slate-500">A prévia usa dados de exemplo.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={salvando} onClick={fecharEdicao}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600"
              disabled={salvando}
              onClick={salvar}
            >
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {salvando ? "Salvando..." : "Salvar modelo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
