import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { Printer, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function RelatorioFuncao({ empresaAtiva }) {
  const [funcionarios, setFuncionarios] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterFuncionario, setFilterFuncionario] = useState("all");

  useEffect(() => {
    loadData();
  }, [empresaAtiva?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [funcs, funcoesData] = await Promise.all([
        sigo.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Funcao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);
      setFuncionarios(
        funcs.sort((a, b) => (a.nome_completo || "").localeCompare(b.nome_completo || ""))
      );
      setFuncoes(funcoesData);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  // Montar lista: cada funcionário com os itens do modelo_ferramentas + modelo_epi da sua função
  const funcionariosComItens = React.useMemo(() => {
    return funcionarios
      .map((func) => {
        const funcao = funcoes.find((f) => f.id === func.funcao_id);
        if (!funcao) return null;

        const itens = (() => {
          try {
            return JSON.parse(funcao.modelo_ferramentas || "[]");
          } catch {
            return [];
          }
        })().map((f) => ({ ...f, tipo: "Ferramenta" }));
        if (itens.length === 0) return null;

        return {
          id: func.id,
          nome: func.nome_completo,
          funcao_nome: funcao.nome,
          funcao_id: func.funcao_id,
          data_admissao: func.data_admissao,
          numero_registro: func.numero_registro,
          cpf: func.cpf,
          itens,
          funcionarioCompleto: func,
        };
      })
      .filter(Boolean);
  }, [funcionarios, funcoes]);

  // Aplicar filtros
  const funcionariosFiltered = funcionariosComItens
    .filter((f) => filterFuncionario === "all" || f.id === filterFuncionario)
    .filter((f) => f.itens.length > 0);

  const stats = {
    totalFuncionarios: funcionariosFiltered.length,
    totalItens: funcionariosFiltered.reduce((sum, f) => sum + f.itens.length, 0),
  };

  const handleImprimirFicha = (funcionario) => {
    const funcaoObj = funcoes.find((f) => f.id === funcionario.funcao_id);
    const logoUrl = empresaAtiva?.logo_url || "";

    const itensFiltrados = [...funcionario.itens].sort((a, b) =>
      (a.ferramenta || a.descricao || "").localeCompare(b.ferramenta || b.descricao || "")
    );
    const linhasVazias = Math.max(0, 45 - itensFiltrados.length);

    const rowsHtml = itensFiltrados
      .map(
        (item) => `
      <tr style="height:20px">
        <td style="border:1px solid #000;padding:4px">__/__/____</td>
        <td style="border:1px solid #000;padding:4px">__/__/____</td>
        <td style="border:1px solid #000;padding:4px;text-align:center">${item.quantidade || 1}</td>
        <td style="border:1px solid #000;padding:4px;font-size:10px">${item.ferramenta || item.descricao || ""}</td>
        <td style="border:1px solid #000;padding:4px;font-size:10px">${item.numero_serie || ""}</td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
      </tr>
    `
      )
      .join("");

    const emptyRowsHtml = Array(linhasVazias)
      .fill(
        `
      <tr style="height:20px">
        <td style="border:1px solid #000;padding:4px">__/__/____</td>
        <td style="border:1px solid #000;padding:4px">__/__/____</td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
      </tr>
    `
      )
      .join("");

    const dataAdmissao = funcionario.data_admissao
      ? funcionario.data_admissao.split("-").reverse().join("/")
      : "";

    const printWindow = window.open("", "", "height=800,width=1200");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Ficha de Controle - ${funcionario.nome}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; margin-top: 0; margin-bottom: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { font-family: Arial, sans-serif; font-size: 12px; background: white; }
            img { display: block; max-width: 100%; }
            table { border-collapse: collapse; width: 100%; font-size: 11px; }
            table td, table th { border: 1px solid #000; padding: 6px; text-align: left; }
            table th { background-color: #e0e0e0; font-weight: bold; }
            h1 { font-size: 14px; font-weight: bold; text-align: center; margin: 10px 0; }
            .text-justify { text-align: justify; }
            @media print { body { margin: 0; padding: 10px; } }
          </style>
        </head>
        <body>
          <!-- Cabeçalho com logo -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:12px;border-bottom:3px solid #000;gap:20px">
            <div style="min-width:80px">
              ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:70px;max-width:200px;object-fit:contain" />` : ""}
            </div>
            <div style="text-align:center;flex:1">
              <h1 style="margin:0">FICHA DE CONTROLE DE ENTREGA DE FERRAMENTAS</h1>
            </div>
          </div>

          <!-- Dados do funcionário -->
          <div style="margin-bottom:8px;font-size:10px">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-bottom:4px">
              <div style="border-bottom:1px solid #000;padding-bottom:2px">
                <strong>NOME:</strong>
                <div style="margin-top:2px">${funcionario.nome}</div>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>Nº DE REGISTRO:</strong>
                <div style="margin-top:2px">${funcionario.numero_registro || funcionario.cpf || ""}</div>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>DATA DE ADMISSÃO:</strong>
                <div style="margin-top:2px">${dataAdmissao}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0">
              <div style="border-bottom:1px solid #000;padding-bottom:2px">
                <strong>FUNÇÃO: ${funcionario.funcao_nome}</strong>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>SEÇÃO: OPERACIONAL</strong>
              </div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px;padding-left:20px">
                <strong>DATA DE DEMISSÃO:</strong>
              </div>
            </div>
          </div>

          <!-- Texto de responsabilidade -->
          <div style="margin-bottom:12px;font-size:9px;background:#f9f9f9;padding:8px;border:1px solid #ccc">
            <p class="text-justify" style="margin-bottom:8px">
              Declaro sob minha inteira responsabilidade a guarda e conservação das ferramentas e os equipamentos de proteção coletiva (EPC's) constantes nesta ficha – controle. Assumo também a responsabilidade de devolver integralmente ou parcialmente, quando solicitado, ou por ocasião de eventual rescisão de contrato, na data do respectivo aviso de qualquer das partes.
              Também estou ciente que, na eventualidade de danificar ou extraviar o equipamento por ato doloso ou culposo, estarei sujeito ao desconto do valor em meu salário, conforme parágrafo único do art. 158 da CLT. Também me comprometo a utilizar de forma correta e de acordo com as instruções de treinamento referentes ao uso correto, a forma de guardar, conservação e higienização das Ferramentas e EPC's, recebidas na presente data, fornecidas por profissional Técnico de Segurança do Trabalho. Também estou ciente que a não utilização dos mesmos em minhas atividades profissionais, é ato faltoso e passível de punições legais e disciplinares de acordo com a Consolidação das Leis do Trabalho (CLT) – Capitulo V – Seção I – Art. 158º. c/c Norma Regulamentadora (NR) – NR – 1 e NR – 6, alínea 6.7, disciplinadas pela Portaria MTB. n° 3.214/78 e artigo 191, itens I e II da CLT e súmula n° 80 do TST. Além do referido treinamento, declaro ter recebido orientações sobre os danos da exposição aos riscos, comprometendo-me a requisitar a reposição dos EPC's e ferramentas, caso haja necessidade, ou com a periodicidade normal requerida. Por ser verdade e dou fé, assino a presente.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
              <div style="border-bottom:1px solid #000;padding-bottom:2px"><strong style="font-size:10px">LOCAL:</strong></div>
              <div style="border-bottom:1px solid #000;padding-bottom:2px"><strong style="font-size:10px">DATA DA EMISSÃO: __/__/____</strong></div>
            </div>
          </div>

          <!-- Tabela de itens -->
          <table style="font-size:11px;margin-bottom:20px">
            <thead>
              <tr style="background-color:#e0e0e0">
                <th style="border:1px solid #000;padding:6px;width:8%">RETIRADA</th>
                <th style="border:1px solid #000;padding:6px;width:8%">DEVOLUÇÃO</th>
                <th style="border:1px solid #000;padding:6px;width:5%">QUANT.</th>
                <th style="border:1px solid #000;padding:6px;width:30%">DESCRIÇÃO DO EQUIPAMENTO</th>
                <th style="border:1px solid #000;padding:6px;width:12%">Nº DE SÉRIE</th>
                <th style="border:1px solid #000;padding:6px;width:23%">ASSINATURA DO FUNCIONÁRIO</th>
                <th style="border:1px solid #000;padding:6px;width:20%">RESPONSÁVEL PELA ENTREGA</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              ${emptyRowsHtml}
            </tbody>
          </table>

          <!-- Assinaturas -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:16px">
            <div style="text-align:center">
              <div style="border-bottom:1px solid #000;height:40px;margin-bottom:4px"></div>
              <strong style="font-size:10px">Assinatura do Funcionário</strong>
            </div>
            <div style="text-align:center">
              <div style="border-bottom:1px solid #000;height:40px;margin-bottom:4px"></div>
              <strong style="font-size:10px">Responsável pela Entrega</strong>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();

    const images = printWindow.document.images;
    if (images.length === 0) {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 500);
    } else {
      let loaded = 0;
      Array.from(images).forEach((img) => {
        const done = () => {
          loaded++;
          if (loaded === images.length) {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
          }
        };
        if (img.complete) done();
        else {
          img.onload = done;
          img.onerror = done;
        }
      });
      setTimeout(() => {
        if (loaded < images.length) {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }
      }, 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho com Filtros */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Ferramentas por Função</h2>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap items-center">
          <Filter className="w-4 h-4 text-slate-500" />
          <Select value={filterFuncionario} onValueChange={setFilterFuncionario}>
            <SelectTrigger className="w-64 text-sm">
              <SelectValue placeholder="Todos os funcionários" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os funcionários</SelectItem>
              {funcionariosComItens.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome} ({f.itens.length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filterFuncionario !== "all" && (
            <Button
              onClick={() => setFilterFuncionario("all")}
              variant="ghost"
              size="sm"
              className="gap-1"
            >
              <X className="w-4 h-4" />
              Limpar
            </Button>
          )}
        </div>

        {/* Estatísticas */}
        {funcionariosFiltered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-1">Funcionários</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.totalFuncionarios}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-1">Total de Ferramentas</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.totalItens}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-slate-600">Carregando...</p>
        </div>
      ) : funcionariosFiltered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-8">
            <p className="text-slate-500">
              {funcionariosComItens.length === 0
                ? "Nenhum funcionário com função que possua modelo de ferramentas/EPIs cadastrado"
                : "Nenhum resultado com os filtros aplicados"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {funcionariosFiltered.map((funcionario) => (
            <Card key={funcionario.id} className="overflow-hidden">
              <div className="bg-slate-100 px-6 py-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-800">{funcionario.nome}</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Função: {funcionario.funcao_nome} • Total: {funcionario.itens.length} item(ns)
                </p>
              </div>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">
                          Descrição
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">
                          Nº Série
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...funcionario.itens]
                        .sort((a, b) =>
                          (a.ferramenta || a.descricao || "").localeCompare(
                            b.ferramenta || b.descricao || ""
                          )
                        )
                        .map((item, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                            <td className="px-4 py-3 text-sm text-slate-800">
                              {item.ferramenta || item.descricao || ""}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {item.numero_serie || "-"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-slate-200 flex justify-end">
                  <Button
                    onClick={() => handleImprimirFicha(funcionario)}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir Ficha TST
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
