import { useState, useEffect, useCallback } from "react";
import { useEmpresa } from "../Layout";
import { supabase } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Loader2,
  RefreshCw,
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";

const fmtBRL = (v) =>
  (parseFloat(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Painel do GRUPO (só Admin Holding / super admin): consolida caixa, mês e
 * pendências de todas as empresas. Backend: RPC consolidado_grupo (0059) —
 * o guard de acesso é validado também no banco, não só aqui.
 */
export default function GrupoConsolidado() {
  const { perfil, user } = useEmpresa();
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const podeVer = perfil === "Admin Holding" || user?.is_super_admin === true;

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.rpc("consolidado_grupo");
      if (error) throw error;
      setLinhas(Array.isArray(data) ? data : []);
    } catch (err) {
      setErro(err?.message || "Erro ao carregar o consolidado");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (podeVer) carregar();
  }, [podeVer, carregar]);

  if (!podeVer) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        Acesso restrito ao painel do grupo (perfil Admin Holding).
      </div>
    );
  }

  const tot = linhas.reduce(
    (a, l) => ({
      saldo: a.saldo + (parseFloat(l.saldo_caixa) || 0),
      receita: a.receita + (parseFloat(l.receita_mes) || 0),
      despesa: a.despesa + (parseFloat(l.despesa_mes) || 0),
      receber: a.receber + (parseFloat(l.a_receber) || 0),
      pagar: a.pagar + (parseFloat(l.a_pagar) || 0),
      atrasado: a.atrasado + (parseFloat(l.a_pagar_atrasado) || 0),
    }),
    { saldo: 0, receita: 0, despesa: 0, receber: 0, pagar: 0, atrasado: 0 }
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Grupo — Consolidado
          </h1>
          <p className="text-sm text-slate-500">
            {linhas.length} empresas • mês corrente • visível só para Admin Holding
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {erro && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {erro}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
      ) : (
        <>
          {/* Totais do grupo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" /> Caixa do grupo
              </p>
              <p
                className={`text-lg font-bold ${tot.saldo >= 0 ? "text-slate-800" : "text-red-700"}`}
              >
                {fmtBRL(tot.saldo)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-green-600" /> Recebido no mês
              </p>
              <p className="text-lg font-bold text-green-700">{fmtBRL(tot.receita)}</p>
              <p className="text-[11px] text-slate-400">A receber: {fmtBRL(tot.receber)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-red-600" /> Pago no mês
              </p>
              <p className="text-lg font-bold text-red-700">{fmtBRL(tot.despesa)}</p>
              <p className="text-[11px] text-slate-400">A pagar: {fmtBRL(tot.pagar)}</p>
            </div>
            <div
              className={`border rounded-xl p-4 ${tot.atrasado > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}
            >
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Atrasado (a pagar)
              </p>
              <p
                className={`text-lg font-bold ${tot.atrasado > 0 ? "text-amber-700" : "text-slate-800"}`}
              >
                {fmtBRL(tot.atrasado)}
              </p>
            </div>
          </div>

          {/* Por empresa */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    Empresa
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Caixa
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Recebido mês
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Pago mês
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    A receber
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    A pagar
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    Atrasado
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.empresa_id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-3 py-2 font-medium text-slate-800">{l.empresa_nome}</td>
                    <td
                      className={`px-3 py-2 text-right ${parseFloat(l.saldo_caixa) < 0 ? "text-red-700 font-medium" : ""}`}
                    >
                      {fmtBRL(l.saldo_caixa)}
                    </td>
                    <td className="px-3 py-2 text-right text-green-700">{fmtBRL(l.receita_mes)}</td>
                    <td className="px-3 py-2 text-right text-red-700">{fmtBRL(l.despesa_mes)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(l.a_receber)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(l.a_pagar)}</td>
                    <td
                      className={`px-3 py-2 text-right ${parseFloat(l.a_pagar_atrasado) > 0 ? "text-amber-700 font-medium" : "text-slate-400"}`}
                    >
                      {fmtBRL(l.a_pagar_atrasado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
