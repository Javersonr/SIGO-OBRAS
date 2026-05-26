import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Download,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import * as XLSX from "xlsx";

export default function ImportarItensSolicitacao({ onImportar, onClose, materiais = [] }) {
  const [arquivo, setArquivo] = React.useState(null);
  const [preview, setPreview] = React.useState([]);
  const [erros, setErros] = React.useState([]);
  const [avisos, setAvisos] = React.useState([]);
  const [processando, setProcessando] = React.useState(false);

  const baixarModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Código *", "Descrição", "Quantidade *", "Unidade", "Observações"],
      ["MAT-001", "Cabo elétrico 2,5mm", "100", "M", ""],
      ["MAT-002", "Disjuntor 20A", "5", "UN", "Marca Schneider"],
      ["MAT-003", "Cimento CP-II 50kg", "20", "SC", ""],
    ]);

    ws["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 12 }, { wch: 30 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens");
    XLSX.writeFile(wb, "modelo_solicitacao_compra.xlsx");
  };

  const processarArquivo = (file) => {
    setProcessando(true);
    setErros([]);
    setAvisos([]);
    setPreview([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const dados = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Ignorar cabeçalho (linha 0)
        const linhas = dados.slice(1).filter((row) => row.some((c) => c !== undefined && c !== ""));

        const novosErros = [];
        const novosAvisos = [];
        const itens = [];

        linhas.forEach((row, i) => {
          const codigo = String(row[0] || "").trim();
          const descricaoLinha = String(row[1] || "").trim();
          const quantidadeRaw = row[2];
          const unidade =
            String(row[3] || "UN")
              .trim()
              .toUpperCase() || "UN";
          const observacoes = String(row[4] || "").trim();

          if (!codigo) {
            novosErros.push(`Linha ${i + 2}: Código obrigatório`);
            return;
          }

          const quantidade = parseFloat(String(quantidadeRaw).replace(",", "."));
          if (!quantidadeRaw || isNaN(quantidade) || quantidade <= 0) {
            novosErros.push(`Linha ${i + 2} (${codigo}): Quantidade inválida`);
            return;
          }

          // Buscar material pelo código
          const materialEncontrado = materiais.find(
            (m) => m.codigo && m.codigo.toLowerCase() === codigo.toLowerCase()
          );

          if (!materialEncontrado) {
            novosErros.push(`Linha ${i + 2}: Código "${codigo}" não encontrado no cadastro`);
            return;
          }

          // Verificar se a descrição bate (se foi informada)
          if (
            descricaoLinha &&
            materialEncontrado.nome.toLowerCase() !== descricaoLinha.toLowerCase()
          ) {
            novosAvisos.push(
              `Linha ${i + 2} (${codigo}): Descrição "${descricaoLinha}" difere do cadastro "${materialEncontrado.nome}" — usando descrição do cadastro`
            );
          }

          itens.push({
            descricao: materialEncontrado.nome,
            quantidade,
            unidade: unidade || materialEncontrado.unidade || "UN",
            observacoes,
            ultimo_preco: materialEncontrado.preco || null,
            material_id: materialEncontrado.tipo === "Material" ? materialEncontrado.id : null,
            material_codigo: materialEncontrado.codigo || codigo,
          });
        });

        setPreview(itens);
        setErros(novosErros);
        setAvisos(novosAvisos);
      } catch (err) {
        setErros(["Erro ao ler o arquivo. Verifique se é um arquivo Excel válido."]);
      } finally {
        setProcessando(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setArquivo(file);
    processarArquivo(file);
  };

  const handleImportar = () => {
    if (preview.length > 0) {
      onImportar(preview);
      onClose();
    }
  };

  return (
    <Sheet
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="h-full p-0 flex flex-col" data-fullscreen-modal>
        <div className="sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              Importar Itens
            </SheetTitle>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Baixar modelo */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <p className="text-sm font-medium text-slate-700">Modelo de importação</p>
              <p className="text-xs text-slate-500">Preencha com o código do material cadastrado</p>
            </div>
            <Button variant="outline" size="sm" onClick={baixarModelo} className="gap-2">
              <Download className="w-4 h-4" />
              Baixar modelo
            </Button>
          </div>

          {/* Upload */}
          <div>
            <Label className="text-sm font-medium text-slate-700 mb-2 block">
              Selecionar arquivo Excel
            </Label>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <Upload className="w-6 h-6 text-slate-400 mb-1" />
              <span className="text-sm text-slate-500">
                {arquivo ? arquivo.name : "Clique para selecionar (.xlsx, .xls)"}
              </span>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {/* Erros */}
          {erros.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
              <p className="text-xs font-semibold text-red-700 mb-1">
                Erros ({erros.length}) — linhas ignoradas:
              </p>
              {erros.map((e, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-xs text-red-700">{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Avisos */}
          {avisos.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg space-y-1">
              <p className="text-xs font-semibold text-yellow-800 mb-1">
                Avisos ({avisos.length}) — itens importados com ajuste:
              </p>
              {avisos.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <span className="text-xs text-yellow-800">{a}</span>
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-slate-700">
                  {preview.length} itens prontos para importar
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 text-slate-600 w-20">Código</th>
                      <th className="text-left p-2 text-slate-600">Descrição</th>
                      <th className="text-left p-2 text-slate-600 w-16">Qtd</th>
                      <th className="text-left p-2 text-slate-600 w-12">Un</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((item, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2 text-slate-500 font-mono">{item.material_codigo}</td>
                        <td className="p-2 text-slate-800">{item.descricao}</td>
                        <td className="p-2 text-slate-600">{item.quantidade}</td>
                        <td className="p-2 text-slate-600">{item.unidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border-t p-6 flex justify-end gap-3 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleImportar}
            disabled={preview.length === 0 || processando}
            className="bg-amber-500 hover:bg-amber-600 gap-2"
          >
            <Upload className="w-4 h-4" />
            Importar {preview.length > 0 ? `${preview.length} itens` : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
