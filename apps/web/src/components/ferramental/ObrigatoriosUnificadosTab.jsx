import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { safeParseJSON } from "@/lib/json-utils";
import { Search, Truck, HardHat, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * Tab unificada que mostra TODAS as ferramentas obrigatórias,
 * sejam por função (modelo_ferramentas / modelo_epi) ou por caminhão (CaminhaoCampoObrigatorio).
 */
export default function ObrigatoriosUnificadosTab({
  ferramentas,
  camposObrigatorios,
  funcoes = [],
}) {
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos"); // 'todos' | 'funcao' | 'caminhao'
  const [filtroFuncao, setFiltroFuncao] = useState("todos");
  const [filtroCaminhao, setFiltroCaminhao] = useState("todos");

  // Monta mapa unificado: descricao -> { funcoes: [], caminhoes: [], ferramentasIds: [] }
  const mapaUnificado = useMemo(() => {
    const mapa = {};

    const ensure = (desc) => {
      const k = (desc || "").toLowerCase().trim();
      if (!k) return null;
      if (!mapa[k]) mapa[k] = { descricao: desc, funcoes: [], caminhoes: [], ferramentaIds: [] };
      return k;
    };

    // Caminhões: CaminhaoCampoObrigatorio
    for (const campo of camposObrigatorios || []) {
      const ids = safeParseJSON(campo.ferramenta_ids, []);
      for (const fid of ids) {
        const ferr = (ferramentas || []).find((f) => f.id === fid);
        if (!ferr) continue;
        const k = ensure(ferr.descricao);
        if (!k) continue;
        const placa = campo.caminhao_placa || campo.caminhao_id;
        if (placa && !mapa[k].caminhoes.includes(placa)) {
          mapa[k].caminhoes.push(placa);
        }
        if (!mapa[k].ferramentaIds.includes(fid)) {
          mapa[k].ferramentaIds.push(fid);
        }
      }
    }

    // Funções: modelo_ferramentas e modelo_epi
    for (const funcao of funcoes || []) {
      let modeloFerr = [];
      modeloFerr = safeParseJSON(funcao.modelo_ferramentas, []);
      let modeloEpi = safeParseJSON(funcao.modelo_epi, []);

      for (const item of [...modeloFerr, ...modeloEpi]) {
        const desc = item.ferramenta || item.item || item.descricao || "";
        if (!desc) continue;
        const k = ensure(desc);
        if (!k) continue;
        if (!mapa[k].funcoes.includes(funcao.nome)) {
          mapa[k].funcoes.push(funcao.nome);
        }
      }
    }

    return mapa;
  }, [ferramentas, camposObrigatorios, funcoes]);

  // Lista única de caminhões e funções para os filtros
  const todasPlacas = useMemo(() => {
    const placas = new Set();
    (camposObrigatorios || []).forEach((c) => {
      if (c.caminhao_placa) placas.add(c.caminhao_placa);
    });
    return [...placas].sort();
  }, [camposObrigatorios]);

  const todasFuncoes = useMemo(() => {
    return (funcoes || [])
      .map((f) => f.nome)
      .filter(Boolean)
      .sort();
  }, [funcoes]);

  const linhas = useMemo(() => {
    return Object.values(mapaUnificado)
      .filter((item) => item.funcoes.length > 0 || item.caminhoes.length > 0)
      .sort((a, b) => a.descricao.localeCompare(b.descricao));
  }, [mapaUnificado]);

  const filtradas = useMemo(() => {
    return linhas.filter((l) => {
      // Filtro de texto
      if (search.trim()) {
        const s = search.toLowerCase();
        const matchText =
          l.descricao.toLowerCase().includes(s) ||
          l.funcoes.some((f) => f.toLowerCase().includes(s)) ||
          l.caminhoes.some((c) => c.toLowerCase().includes(s));
        if (!matchText) return false;
      }
      // Filtro de tipo
      if (filtroTipo === "funcao" && l.funcoes.length === 0) return false;
      if (filtroTipo === "caminhao" && l.caminhoes.length === 0) return false;
      // Filtro de função específica
      if (filtroFuncao !== "todos" && !l.funcoes.includes(filtroFuncao)) return false;
      // Filtro de caminhão específico
      if (filtroCaminhao !== "todos" && !l.caminhoes.includes(filtroCaminhao)) return false;
      return true;
    });
  }, [linhas, search, filtroTipo, filtroFuncao, filtroCaminhao]);

  // Verifica se a ferramenta existe no estoque
  const temNoEstoque = (descricao) => {
    return (ferramentas || []).some(
      (f) => f.descricao?.toLowerCase().trim() === descricao.toLowerCase().trim()
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Ferramentas Obrigatórias Unificadas
          </h2>
          <p className="text-sm text-slate-500">
            {filtradas.length} de {linhas.length} ferramenta(s) obrigatória(s)
          </p>
        </div>
        <div className="flex gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-1">
            <Truck className="w-4 h-4 text-blue-500" />
            {todasPlacas.length} caminhões
          </span>
          <span className="flex items-center gap-1">
            <HardHat className="w-4 h-4 text-purple-500" />
            {todasFuncoes.length} funções
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por ferramenta, função ou caminhão..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={filtroTipo}
          onValueChange={(v) => {
            setFiltroTipo(v);
            setFiltroFuncao("todos");
            setFiltroCaminhao("todos");
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="funcao">🪖 Por Função</SelectItem>
            <SelectItem value="caminhao">🚛 Por Caminhão</SelectItem>
          </SelectContent>
        </Select>
        {(filtroTipo === "todos" || filtroTipo === "funcao") && todasFuncoes.length > 0 && (
          <Select value={filtroFuncao} onValueChange={setFiltroFuncao}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as funções</SelectItem>
              {todasFuncoes.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(filtroTipo === "todos" || filtroTipo === "caminhao") && todasPlacas.length > 0 && (
          <Select value={filtroCaminhao} onValueChange={setFiltroCaminhao}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por caminhão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os caminhões</SelectItem>
              {todasPlacas.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {linhas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">Nenhuma ferramenta obrigatória configurada</p>
          <p className="text-sm mt-1">
            Configure ferramentas obrigatórias nas Funções e nos Caminhões
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold">Ferramenta</TableHead>
                <TableHead className="text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <HardHat className="w-3.5 h-3.5 text-purple-500" />
                    Funções
                  </span>
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-500" />
                    Caminhões
                  </span>
                </TableHead>
                <TableHead className="text-xs font-semibold text-center">No Estoque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((item, idx) => {
                const existe = temNoEstoque(item.descricao);
                return (
                  <TableRow key={idx} className={!existe ? "bg-red-50" : ""}>
                    <TableCell className="font-medium text-sm">
                      <div>{item.descricao}</div>
                    </TableCell>
                    <TableCell>
                      {item.funcoes.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {item.funcoes.map((f) => (
                            <Badge
                              key={f}
                              className="bg-purple-100 text-purple-700 border-purple-200 text-xs font-normal"
                            >
                              {f}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.caminhoes.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {item.caminhoes.map((c) => (
                            <Badge
                              key={c}
                              className="bg-blue-100 text-blue-700 border-blue-200 text-xs font-normal"
                            >
                              {c}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {existe ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-xs text-red-600 font-medium">
                          <AlertCircle className="w-4 h-4" />
                          Faltando
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {filtradas.length === 0 && search && (
        <p className="text-center text-slate-400 text-sm py-8">Nenhum resultado para "{search}"</p>
      )}
    </div>
  );
}
