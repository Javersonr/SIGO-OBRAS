import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { useEmpresa } from "@/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronRight,
  Truck,
  User,
  Eye,
  Edit,
  FileText,
} from "lucide-react";
import EditarLaudoModal from "@/components/ferramental/EditarLaudoModal";

export default function ConformidadeCaminhoes({ ferramentas: ferramentasProp }) {
  const { empresaAtiva } = useEmpresa();
  const [ferramentas, setFerramentas] = useState(ferramentasProp || []);
  const [caminhoes, setCaminhoes] = useState([]);
  const [campos, setCampos] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caminhaoExpandido, setCaminhaoExpandido] = useState(null);
  const [funcionarioExpandido, setFuncionarioExpandido] = useState(null);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState("caminhoes");
  const [editarLaudo, setEditarLaudo] = useState(null);
  const [vinculandoCaminhao, setVinculandoCaminhao] = useState(null);
  const [progressoVinculacao, setProgressoVinculacao] = useState(0);

  useEffect(() => {
    if (empresaAtiva?.id) loadDados();
  }, [empresaAtiva?.id]);

  const loadDados = async () => {
    setLoading(true);
    try {
      const [cams, camposDb, funcs, ferrs] = await Promise.all([
        sigo.entities.Caminhao.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.CaminhaoCampoObrigatorio.filter({
          empresa_id: empresaAtiva.id,
          ativo: true,
        }),
        sigo.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }),
        sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, ativo: true }, "", 1000),
      ]);
      setCaminhoes(cams.sort((a, b) => (a.placa || "").localeCompare(b.placa || "")));
      setCampos(camposDb);
      setFuncionarios(
        funcs.sort((a, b) => (a.nome_completo || "").localeCompare(b.nome_completo || ""))
      );
      setFerramentas(ferrs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getCamposDoC = (caminhaoId) => campos.filter((c) => c.caminhao_id === caminhaoId);

  const getFerramentasIds = (campo) => {
    return safeParseJSON(campo.ferramenta_ids, []);
  };

  const getFerramentasCaminhao = (caminhao) =>
    ferramentas.filter((f) => f.caminhao_id === caminhao.id || f.localizacao === caminhao.placa);

  const getFerramentasFuncionario = (funcionarioId) =>
    ferramentas.filter((f) => f.funcionario_id === funcionarioId);

  const getStatusCampo = (campo) => {
    const ids = getFerramentasIds(campo);
    if (ids.length === 0) return "vazio";
    if (ids.length >= campo.quantidade_obrigatoria) return "ok";
    return "parcial";
  };

  const getConformidadeCaminhao = (caminhaoId) => {
    const camposDoCaminhao = getCamposDoC(caminhaoId);
    if (camposDoCaminhao.length === 0) return { total: 0, ok: 0 };
    const ok = camposDoCaminhao.filter((c) => getStatusCampo(c) === "ok").length;
    return { total: camposDoCaminhao.length, ok };
  };

  const autoVincularFerramentes = async (caminhao) => {
    const camposDoCaminhao = getCamposDoC(caminhao.id);
    let ferramentasDoCaminhao = getFerramentasCaminhao(caminhao);

    if (camposDoCaminhao.length === 0 || ferramentasDoCaminhao.length === 0) {
      return;
    }

    setVinculandoCaminhao(caminhao.id);
    setProgressoVinculacao(0);

    try {
      const total = camposDoCaminhao.length;
      const ferramentasUsadas = new Set();

      // Vincular ferramentas aos campos por similaridade de descrição
      for (let i = 0; i < camposDoCaminhao.length; i++) {
        const campo = camposDoCaminhao[i];
        const nomeCampo = campo.nome_campo.toLowerCase();

        // Filtrar ferramentas que ainda não foram usadas
        const ferramentasDisponiveis = ferramentasDoCaminhao.filter(
          (f) => !ferramentasUsadas.has(f.id)
        );

        // Buscar ferramentas que correspondem ao campo
        const ferramentasParaCampo = ferramentasDisponiveis.filter((f) => {
          const descricaoLower = f.descricao?.toLowerCase() || "";
          const palavrasChave = nomeCampo.split(" ");
          return palavrasChave.some((p) => descricaoLower.includes(p));
        });

        // Se não encontrou por nome, pegar as primeiras disponíveis
        const ferrsAVincular =
          ferramentasParaCampo.length > 0 ? ferramentasParaCampo : ferramentasDisponiveis;

        if (ferrsAVincular.length > 0) {
          const ids = ferrsAVincular.slice(0, campo.quantidade_obrigatoria).map((f) => {
            ferramentasUsadas.add(f.id);
            return f.id;
          });
          await sigo.entities.CaminhaoCampoObrigatorio.update(campo.id, {
            ferramenta_ids: JSON.stringify(ids),
          });
        }

        setProgressoVinculacao(Math.round(((i + 1) / total) * 100));
      }

      loadDados();
    } catch (error) {
      console.error("Erro ao auto-vincular ferramentas:", error);
    } finally {
      setVinculandoCaminhao(null);
      setProgressoVinculacao(0);
    }
  };

  const statusColor = {
    vazio: "border-slate-200 bg-slate-50",
    parcial: "border-amber-200 bg-amber-50",
    ok: "border-green-200 bg-green-50",
  };

  const badgeColor = {
    vazio: "bg-slate-100 text-slate-600",
    parcial: "bg-amber-100 text-amber-700",
    ok: "bg-green-100 text-green-700",
  };

  const caminhoesFiltrados = caminhoes.filter(
    (c) =>
      !busca ||
      c.placa?.toLowerCase().includes(busca.toLowerCase()) ||
      c.modelo?.toLowerCase().includes(busca.toLowerCase()) ||
      c.motorista_padrao_nome?.toLowerCase().includes(busca.toLowerCase())
  );

  const funcionariosFiltrados = funcionarios
    .filter(
      (f) =>
        !busca ||
        f.nome_completo?.toLowerCase().includes(busca.toLowerCase()) ||
        f.funcao_nome?.toLowerCase().includes(busca.toLowerCase())
    )
    .filter((f) => getFerramentasFuncionario(f.id).length > 0);

  const AcoesFerramenta = ({ f }) => (
    <td className="px-2 py-1.5 whitespace-nowrap">
      <div className="flex items-center gap-1">
        {f.laudo_url && (
          <a
            href={f.laudo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
            title="Visualizar Laudo"
          >
            <Eye className="w-3.5 h-3.5" />
          </a>
        )}
        <button
          onClick={() => setEditarLaudo(f)}
          className="p-1 text-slate-500 hover:bg-slate-100 rounded"
          title="Editar Nº Série / Laudo"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        {f.numero_laudo && (
          <span title="Tem laudo">
            <FileText className="w-3.5 h-3.5 text-orange-500" />
          </span>
        )}
      </div>
    </td>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Rastreabilidade</h2>
            <p className="text-sm text-slate-500">
              Visualize as ferramentas vinculadas a caminhões e funcionários.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadDados}>
            Atualizar
          </Button>
        </div>

        {/* Abas */}
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => {
              setAba("caminhoes");
              setBusca("");
            }}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${aba === "caminhoes" ? "border-slate-800 text-slate-800" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            🚛 Caminhões ({caminhoes.length})
          </button>
          <button
            onClick={() => {
              setAba("funcionarios");
              setBusca("");
            }}
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${aba === "funcionarios" ? "border-slate-800 text-slate-800" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            👤 Funcionários (
            {funcionarios.filter((f) => getFerramentasFuncionario(f.id).length > 0).length})
          </button>
        </div>

        {/* Busca */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={aba === "caminhoes" ? "Buscar caminhão..." : "Buscar funcionário..."}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* ABA CAMINHÕES */}
        {aba === "caminhoes" &&
          (caminhoesFiltrados.length === 0 ? (
            <Card className="p-10 text-center text-slate-400">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum caminhão cadastrado</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {caminhoesFiltrados.map((caminhao) => {
                const { total, ok } = getConformidadeCaminhao(caminhao.id);
                const camposDoCaminhao = getCamposDoC(caminhao.id);
                const isExpanded = caminhaoExpandido === caminhao.id;
                const ferramentasDoCaminhao = getFerramentasCaminhao(caminhao).sort((a, b) =>
                  (a.descricao || "").localeCompare(b.descricao || "")
                );
                const conformeTotal = total > 0 && ok === total;

                return (
                  <Card
                    key={caminhao.id}
                    className={`overflow-hidden transition-all ${conformeTotal ? "border-green-300" : total === 0 ? "border-slate-200" : ok === 0 ? "border-slate-200" : "border-amber-300"}`}
                  >
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
                      onClick={() => setCaminhaoExpandido(isExpanded ? null : caminhao.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🚛</span>
                        <div>
                          <p className="font-bold font-mono text-slate-800">{caminhao.placa}</p>
                          <p className="text-sm text-slate-500">
                            {[caminhao.marca, caminhao.modelo].filter(Boolean).join(" ")}
                            {caminhao.motorista_padrao_nome &&
                              ` · ${caminhao.motorista_padrao_nome}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {total > 0 ? (
                          <Badge
                            className={
                              conformeTotal
                                ? "bg-green-100 text-green-700"
                                : ok === 0
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-amber-100 text-amber-700"
                            }
                          >
                            {ok}/{total} campos ok
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500">
                            Sem campos obrigatórios
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {ferramentasDoCaminhao.length} ferr.
                        </Badge>
                        {ok < total && ferramentasDoCaminhao.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-6 py-1"
                            disabled={vinculandoCaminhao === caminhao.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              autoVincularFerramentes(caminhao);
                            }}
                          >
                            {vinculandoCaminhao === caminhao.id
                              ? `${progressoVinculacao}%`
                              : "🤖 Auto-vincular"}
                          </Button>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 px-4 pb-4 pt-3 space-y-4">
                        {/* Ferramentas vinculadas por campo */}
                        {camposDoCaminhao.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                              Campos Obrigatórios
                            </p>
                            {[...camposDoCaminhao]
                              .sort((a, b) => a.nome_campo.localeCompare(b.nome_campo))
                              .map((campo) => {
                                const status = getStatusCampo(campo);
                                const idsVinculados = getFerramentasIds(campo);
                                const ferrsVinculadas = ferramentas.filter((f) =>
                                  idsVinculados.includes(f.id)
                                );

                                return (
                                  <div
                                    key={campo.id}
                                    className={`rounded-lg border p-3 ${statusColor[status]}`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        {status === "ok" ? (
                                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                                        ) : status === "parcial" ? (
                                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                        ) : (
                                          <Circle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                        )}
                                        <p className="text-sm font-semibold">{campo.nome_campo}</p>
                                      </div>
                                      <Badge className={`text-xs ${badgeColor[status]}`}>
                                        {idsVinculados.length}/{campo.quantidade_obrigatoria}
                                        {status === "ok" ? " ✓" : " pendente"}
                                      </Badge>
                                    </div>

                                    {ferrsVinculadas.length > 0 ? (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead className="bg-white/60">
                                            <tr className="border-b border-slate-200">
                                              <th className="text-left px-2 py-1 font-semibold text-slate-600">
                                                Sub-Código
                                              </th>
                                              <th className="text-left px-2 py-1 font-semibold text-slate-600">
                                                Descrição
                                              </th>
                                              <th className="text-left px-2 py-1 font-semibold text-slate-600">
                                                Status
                                              </th>
                                              <th className="text-left px-2 py-1 font-semibold text-slate-600">
                                                Nº Série
                                              </th>
                                              <th className="text-left px-2 py-1 font-semibold text-slate-600">
                                                Nº Laudo
                                              </th>
                                              <th className="text-left px-2 py-1 font-semibold text-slate-600">
                                                Venc. Laudo
                                              </th>
                                              <th className="text-left px-2 py-1 font-semibold text-slate-600">
                                                CA
                                              </th>
                                              <th className="text-left px-2 py-1 font-semibold text-slate-600">
                                                Ações
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {ferrsVinculadas.map((f) => (
                                              <tr
                                                key={f.id}
                                                className="border-b border-slate-100 hover:bg-white/80"
                                              >
                                                <td className="px-2 py-1.5 font-mono text-blue-600 font-semibold">
                                                  {f.codigo}
                                                </td>
                                                <td className="px-2 py-1.5 text-slate-700">
                                                  {f.descricao}
                                                </td>
                                                <td className="px-2 py-1.5">
                                                  <span
                                                    className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                                      f.status === "Disponível"
                                                        ? "bg-green-100 text-green-700"
                                                        : f.status === "Em Uso"
                                                          ? "bg-blue-100 text-blue-700"
                                                          : f.status === "Em Manutenção"
                                                            ? "bg-orange-100 text-orange-700"
                                                            : "bg-slate-100 text-slate-600"
                                                    }`}
                                                  >
                                                    {f.status || "-"}
                                                  </span>
                                                </td>
                                                <td className="px-2 py-1.5 font-mono text-slate-600">
                                                  {f.numero_serie || "-"}
                                                </td>
                                                <td className="px-2 py-1.5 font-mono text-slate-600">
                                                  {f.numero_laudo || "-"}
                                                </td>
                                                <td className="px-2 py-1.5 text-slate-600">
                                                  {f.data_vencimento_laudo
                                                    ? new Date(
                                                        f.data_vencimento_laudo
                                                      ).toLocaleDateString("pt-BR")
                                                    : "-"}
                                                </td>
                                                <td className="px-2 py-1.5 text-slate-600">
                                                  {f.ca || "-"}
                                                </td>
                                                <AcoesFerramenta f={f} />
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-slate-400 italic mt-1">
                                        ⚠️ Nenhuma ferramenta vinculada
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}

                        {/* Resumo de Ferramentas Vinculadas vs Disponíveis */}
                        {ferramentasDoCaminhao.length > 0 && (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                            <p className="text-xs font-semibold text-blue-900 mb-2">
                              📦 Ferramentas Neste Caminhão ({ferramentasDoCaminhao.length})
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {ferramentasDoCaminhao.map((f) => {
                                const vinculada = camposDoCaminhao.some((campo) => {
                                  const ids = getFerramentasIds(campo);
                                  return ids.includes(f.id);
                                });
                                return (
                                  <span
                                    key={f.id}
                                    className={`text-xs px-2 py-1 rounded border ${vinculada ? "bg-green-100 border-green-200 text-green-700" : "bg-white border-blue-200 text-slate-600"}`}
                                  >
                                    {vinculada ? "✓" : "○"} {f.codigo}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Todas as ferramentas do caminhão */}
                        {ferramentasDoCaminhao.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                              Todas as Ferramentas do Caminhão ({ferramentasDoCaminhao.length})
                            </p>
                            <div className="overflow-x-auto rounded border border-slate-200">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-100">
                                  <tr>
                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                      Sub-Código
                                    </th>
                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                      Descrição
                                    </th>
                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                      Status
                                    </th>
                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                      Nº Série
                                    </th>
                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                      Nº Laudo
                                    </th>
                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                      Venc. Laudo
                                    </th>
                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                      CA
                                    </th>
                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                      Ações
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ferramentasDoCaminhao.map((f) => (
                                    <tr
                                      key={f.id}
                                      className="border-b border-slate-100 hover:bg-slate-50"
                                    >
                                      <td className="px-2 py-1.5 font-mono text-blue-600 font-semibold">
                                        {f.codigo}
                                      </td>
                                      <td className="px-2 py-1.5 text-slate-700">{f.descricao}</td>
                                      <td className="px-2 py-1.5">
                                        <span
                                          className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                            f.status === "Disponível"
                                              ? "bg-green-100 text-green-700"
                                              : f.status === "Em Uso"
                                                ? "bg-blue-100 text-blue-700"
                                                : f.status === "Em Manutenção"
                                                  ? "bg-orange-100 text-orange-700"
                                                  : "bg-slate-100 text-slate-600"
                                          }`}
                                        >
                                          {f.status || "-"}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 font-mono text-slate-600">
                                        {f.numero_serie || "-"}
                                      </td>
                                      <td className="px-2 py-1.5 font-mono text-slate-600">
                                        {f.numero_laudo || "-"}
                                      </td>
                                      <td className="px-2 py-1.5 text-slate-600">
                                        {f.data_vencimento_laudo
                                          ? new Date(f.data_vencimento_laudo).toLocaleDateString(
                                              "pt-BR"
                                            )
                                          : "-"}
                                      </td>
                                      <td className="px-2 py-1.5 text-slate-600">{f.ca || "-"}</td>
                                      <AcoesFerramenta f={f} />
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {camposDoCaminhao.length === 0 && ferramentasDoCaminhao.length === 0 && (
                          <p className="text-sm text-slate-400 text-center py-4">
                            Nenhuma ferramenta ou campo obrigatório configurado para este caminhão.
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ))}

        {/* ABA FUNCIONÁRIOS */}
        {aba === "funcionarios" &&
          (funcionariosFiltrados.length === 0 ? (
            <Card className="p-10 text-center text-slate-400">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum funcionário com ferramentas vinculadas</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {funcionariosFiltrados.map((func) => {
                const ferramentasDoFuncionario = getFerramentasFuncionario(func.id).sort((a, b) =>
                  (a.descricao || "").localeCompare(b.descricao || "")
                );
                const isExpanded = funcionarioExpandido === func.id;

                return (
                  <Card key={func.id} className="overflow-hidden border-blue-200">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
                      onClick={() => setFuncionarioExpandido(isExpanded ? null : func.id)}
                    >
                      <div className="flex items-center gap-3">
                        <User className="w-8 h-8 text-blue-400 bg-blue-50 rounded-full p-1.5" />
                        <div>
                          <p className="font-bold text-slate-800">{func.nome_completo}</p>
                          <p className="text-sm text-slate-500">
                            {func.funcao_nome || "Sem função"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-100 text-blue-700">
                          {ferramentasDoFuncionario.length} ferramenta(s)
                        </Badge>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 px-4 pb-4 pt-3">
                        <div className="overflow-x-auto rounded border border-slate-200">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                  Sub-Código
                                </th>
                                <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                  Descrição
                                </th>
                                <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                  Status
                                </th>
                                <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                  Nº Série
                                </th>
                                <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                  Nº Laudo
                                </th>
                                <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                  Venc. Laudo
                                </th>
                                <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                  CA
                                </th>
                                <th className="text-left px-2 py-1.5 font-semibold text-slate-600">
                                  Ações
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {ferramentasDoFuncionario.map((f) => (
                                <tr
                                  key={f.id}
                                  className="border-b border-slate-100 hover:bg-slate-50"
                                >
                                  <td className="px-2 py-1.5 font-mono text-blue-600 font-semibold">
                                    {f.codigo}
                                  </td>
                                  <td className="px-2 py-1.5 text-slate-700">{f.descricao}</td>
                                  <td className="px-2 py-1.5">
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                        f.status === "Disponível"
                                          ? "bg-green-100 text-green-700"
                                          : f.status === "Em Uso"
                                            ? "bg-blue-100 text-blue-700"
                                            : f.status === "Em Manutenção"
                                              ? "bg-orange-100 text-orange-700"
                                              : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {f.status || "-"}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-slate-600">
                                    {f.numero_serie || "-"}
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-slate-600">
                                    {f.numero_laudo || "-"}
                                  </td>
                                  <td className="px-2 py-1.5 text-slate-600">
                                    {f.data_vencimento_laudo
                                      ? new Date(f.data_vencimento_laudo).toLocaleDateString(
                                          "pt-BR"
                                        )
                                      : "-"}
                                  </td>
                                  <td className="px-2 py-1.5 text-slate-600">{f.ca || "-"}</td>
                                  <AcoesFerramenta f={f} />
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ))}
      </div>

      <EditarLaudoModal
        open={!!editarLaudo}
        onClose={() => setEditarLaudo(null)}
        ferramenta={editarLaudo}
        onSaved={loadDados}
      />
    </>
  );
}
