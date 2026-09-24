import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, X, CheckCircle2, FileText, Eye } from "lucide-react";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { nomeDoArquivo } from "@/lib/anexo-ref";
import { safeParseJSON } from "@/lib/json-utils";
import { DadosRecebimentoConta } from "./DadosBancariosPagamento";
import { hojeLocalISO } from "./utils";

/**
 * Anexos da receita: transacao_financeira.anexos é TEXT com JSON
 * ([{ nome, url: "bucket/path", tipo }]). Aceita array, string JSON, JSON
 * codificado duas vezes (import legado) e itens que são só a URL/ref.
 */
export function anexosDaReceita(receita) {
  let lista = safeParseJSON(receita?.anexos, []);
  if (typeof lista === "string") lista = safeParseJSON(lista, []);
  if (!Array.isArray(lista)) return [];
  return lista
    .map((a) => (typeof a === "string" ? { url: a } : a))
    .filter((a) => a && typeof a === "object" && (a.url || a.file_url))
    .map((a) => ({ ...a, nome: a.nome || nomeDoArquivo(a.url || a.file_url) }));
}

export default function DetalheReceitaModal({
  open,
  onOpenChange,
  receita,
  podeEditar,
  onEditar,
  onBaixar,
  empresaAtiva,
}) {
  // data do recebimento escolhida pelo usuário (null = seletor fechado)
  const [dataRecebimento, setDataRecebimento] = useState(null);
  const [anexoAberto, setAnexoAberto] = useState(null);
  useEffect(() => {
    setDataRecebimento(null);
    setAnexoAberto(null);
  }, [receita?.id, open]);

  if (!receita) return null;
  const recebida = receita.status === "pago" || receita.status === "Pago";
  const venc = (receita.data_vencimento || "").toString().slice(0, 10);
  const anexos = anexosDaReceita(receita);

  const formatCurrency = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  const formatDate = (d) =>
    d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : "-";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-full overflow-y-auto p-0 flex flex-col"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 flex items-center justify-between">
          <SheetHeader className="flex-1">
            <SheetTitle>Detalhes da Receita</SheetTitle>
          </SheetHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Informações Principais */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Informações Gerais
            </h3>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-500">Descrição</Label>
                <p className="mt-1 text-slate-800 font-medium">{receita.descricao || "-"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">Valor Total</Label>
                  <p className="mt-1 text-lg font-bold text-green-600">
                    {formatCurrency(receita.valor)}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">Forma de Recebimento</Label>
                  <p className="mt-1 text-slate-800">
                    {receita.forma_pagamento ? (
                      <Badge variant="outline" className="capitalize">
                        {receita.forma_pagamento}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-500">Data Competência</Label>
                  <p className="mt-1 text-slate-800">{formatDate(receita.data)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Vencimento</Label>
                  <p className="mt-1 text-slate-800">{formatDate(receita.data_vencimento)}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Recebimento</Label>
                  <p className="mt-1 text-slate-800">{formatDate(receita.data_pagamento)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Relacionamentos */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">Relacionamentos</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-500">Cliente</Label>
                <p className="mt-1 text-slate-800">{receita.cliente_nome || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Categoria</Label>
                <p className="mt-1 text-slate-800">
                  {receita.categoria_nome ? (
                    <Badge variant="outline">{receita.categoria_nome}</Badge>
                  ) : (
                    "-"
                  )}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Conta</Label>
                <p className="mt-1 text-slate-800">{receita.conta_nome || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Centro de Custo</Label>
                <p className="mt-1 text-slate-800">
                  {receita.centro_custo_nome || receita.centro_custo || "-"}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Projeto</Label>
                <p className="mt-1 text-slate-800">{receita.projeto_nome || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Oportunidade</Label>
                <p className="mt-1 text-slate-800">{receita.oportunidade_nome || "-"}</p>
              </div>
            </div>

            <div className="mt-4">
              <DadosRecebimentoConta contaId={receita.conta_id} />
            </div>
          </div>

          {/* Anexos (recibo, NF, comprovante) */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">Anexos</h3>
            {anexos.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum anexo.</p>
            ) : (
              <div className="space-y-1">
                {anexos.map((anexo, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-700 truncate" title={anexo.nome}>
                        {anexo.nome}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Abrir anexo"
                      onClick={() =>
                        setAnexoAberto({
                          url: anexo.url || anexo.file_url,
                          nome: anexo.nome,
                          tipo: anexo.tipo,
                        })
                      }
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Informações do Sistema */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4">
              Informações do Sistema
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <Label className="text-slate-500">Criado em</Label>
                <p className="mt-1 text-slate-800">
                  {receita.created_date
                    ? new Date(receita.created_date).toLocaleString("pt-BR")
                    : "-"}
                </p>
              </div>
              <div>
                <Label className="text-slate-500">Criado por</Label>
                <p className="mt-1 text-slate-800">{receita.created_by || "-"}</p>
              </div>
              <div>
                <Label className="text-slate-500">Status</Label>
                <p className="mt-1">
                  <Badge
                    className={
                      receita.status === "pago" || receita.status === "Pago"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }
                  >
                    {receita.status === "pago" || receita.status === "Pago"
                      ? "Recebido"
                      : "Em aberto"}
                  </Badge>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t p-4 space-y-3">
          {onBaixar && recebida && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Desfazer o recebimento desta receita?")) {
                  onBaixar(receita, { pagar: false });
                }
              }}
              className="text-blue-600 w-full"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Desfazer Recebimento
            </Button>
          )}
          {onBaixar && !recebida && dataRecebimento === null && (
            <Button
              size="sm"
              onClick={() => setDataRecebimento(hojeLocalISO())}
              className="bg-green-600 hover:bg-green-700 w-full"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Registrar Recebimento
            </Button>
          )}
          {onBaixar && !recebida && dataRecebimento !== null && (
            <div className="rounded-lg border p-3 space-y-2">
              <Label>Data do recebimento *</Label>
              <Input
                type="date"
                value={dataRecebimento}
                onChange={(e) => setDataRecebimento(e.target.value)}
              />
              {venc && venc !== dataRecebimento && venc <= hojeLocalISO() && (
                <button
                  type="button"
                  onClick={() => setDataRecebimento(venc)}
                  className="text-xs text-sky-700 hover:underline"
                >
                  Usar a data do vencimento ({venc.split("-").reverse().join("/")})
                </button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setDataRecebimento(null)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  disabled={!dataRecebimento}
                  onClick={() => {
                    onBaixar(receita, { pagar: true, dataPagamento: dataRecebimento });
                    setDataRecebimento(null);
                  }}
                >
                  Confirmar recebimento
                </Button>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Fechar
            </Button>
            {podeEditar && onEditar && (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onEditar(receita);
                }}
                className="bg-amber-500 hover:bg-amber-600 flex-1"
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
          </div>
        </div>

        {/* janela flutuante (portal no body); aqui dentro ela some junto com a gaveta */}
        <AnexoViewer
          anexo={anexoAberto}
          open={!!anexoAberto}
          onOpenChange={(v) => !v && setAnexoAberto(null)}
        />
      </SheetContent>
    </Sheet>
  );
}
