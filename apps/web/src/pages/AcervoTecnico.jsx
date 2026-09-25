import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../Layout";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Award, Eye, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { usePermission } from "@/components/PermissionGate";
import ResumoAcervo from "@/components/acervo/ResumoAcervo";
import DocumentosAcervo from "@/components/acervo/DocumentosAcervo";
import QuadroTecnico from "@/components/acervo/QuadroTecnico";
import PerfilEconomico from "@/components/acervo/PerfilEconomico";

/**
 * Acervo técnico da EMPRESA LOGADA (tabelas acervo_* da 0109, RLS por empresa):
 * é a base que a IA usa no "Atende?" dos editais. Acesso pelo menu Ações de
 * Oportunidades (createPageUrl("AcervoTecnico")).
 *
 * Permissões (módulo Oportunidades, aba Lista — Admin sempre pode):
 *   ver    → qualquer permissão da aba (a mesma do item no menu de Oportunidades);
 *   editar → função "editar": criar/editar/excluir documentos e profissionais,
 *            enviar PDF, criar/salvar o perfil. Sem ela a página é só leitura.
 */

// abas ficam montadas (forceMount) para não perder filtros nem edição não salva
const CLASSE_ABA = "mt-4 data-[state=inactive]:hidden";

export default function AcervoTecnico() {
  const { empresaAtiva } = useEmpresa();
  const { can } = usePermission();
  const podeVer = can("Oportunidades", "Lista");
  const podeEditar = podeVer && can("Oportunidades", "Lista", "editar");
  const empresaId = empresaAtiva?.id;
  const nomeEmpresa = empresaAtiva?.nome || empresaAtiva?.nome_fantasia || "";

  const [aba, setAba] = useState("resumo");
  const [carregando, setCarregando] = useState(true);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [profissionais, setProfissionais] = useState([]);
  const [atestados, setAtestados] = useState([]);
  const [quantitativos, setQuantitativos] = useState([]);
  const [docFoco, setDocFoco] = useState(null);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    if (!empresaId || !podeVer) return; // sem permissão nem busca
    const meu = ++pedido.current; // descarta respostas de uma empresa anterior
    setCarregando(true);
    setErro(null);
    try {
      const filtro = { empresa_id: empresaId };
      const [perfis, profs, docs, quants] = await Promise.all([
        sigo.entities.AcervoPerfil.filter(filtro, { sort_by: "-updated_at", limit: 1 }),
        sigo.entities.AcervoProfissional.filter(filtro, { sort_by: "nome" }),
        sigo.entities.AcervoAtestado.filter(filtro, { sort_by: "ordem,data_inicio" }),
        sigo.entities.AcervoQuantitativo.filter(filtro, { sort_by: "ordem" }),
      ]);
      if (meu !== pedido.current) return;
      const novo = perfis?.[0] || null;
      // mesma versão do perfil → mantém a referência (não reseta edição em curso)
      setPerfil((ant) =>
        ant && novo && ant.id === novo.id && ant.updated_at === novo.updated_at ? ant : novo
      );
      setProfissionais(profs || []);
      setAtestados(docs || []);
      setQuantitativos(quants || []);
      setCarregado(true);
    } catch (e) {
      if (meu !== pedido.current) return;
      console.error("[AcervoTecnico] carregar:", e);
      setErro(e?.message || "Erro ao carregar");
      toast.error("Erro ao carregar o acervo técnico");
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [empresaId, podeVer]);

  useEffect(() => {
    // troca de empresa: limpa o acervo anterior antes de buscar o novo
    setCarregado(false);
    setPerfil(null);
    setProfissionais([]);
    setAtestados([]);
    setQuantitativos([]);
    carregar();
  }, [carregar]);

  const abrirDocumento = useCallback((id) => {
    setAba("documentos");
    setDocFoco(id);
  }, []);
  const focoTratado = useCallback(() => setDocFoco(null), []);

  if (!empresaAtiva) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando empresa...
      </div>
    );
  }

  if (!podeVer) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="max-w-md px-6 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h3 className="mb-2 text-lg font-medium text-slate-800">Acesso Negado</h3>
          <p className="text-slate-500">
            O acervo técnico exige permissão no módulo Oportunidades. Peça acesso ao administrador
            da empresa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={createPageUrl("Oportunidades")}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-amber-700"
          >
            <ArrowLeft className="h-4 w-4" /> Oportunidades
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Award className="h-6 w-6 flex-shrink-0 text-amber-500" />
            <span className="min-w-0 break-words">Acervo técnico — {nomeEmpresa}</span>
          </h1>
        </div>
        <Button variant="outline" disabled={carregando} onClick={carregar}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <p>
          Este acervo é usado pela IA no “Atende?” dos editais desta empresa. Mantenha CATs,
          quantitativos (sínteses), quadro técnico, índices e certidões atualizados.
        </p>
      </div>

      {!podeEditar && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          <Eye className="h-4 w-4 flex-shrink-0 text-slate-500" />
          Somente leitura: editar o acervo exige a permissão de editar Oportunidades.
        </div>
      )}

      {!carregado ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          {erro ? (
            <div className="text-center">
              <p className="text-red-600">Não foi possível carregar o acervo: {erro}</p>
              <Button variant="outline" className="mt-3" onClick={carregar}>
                Tentar de novo
              </Button>
            </div>
          ) : (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando acervo...
            </>
          )}
        </div>
      ) : (
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="documentos">Documentos ({atestados.length})</TabsTrigger>
            <TabsTrigger value="quadro">Quadro técnico ({profissionais.length})</TabsTrigger>
            <TabsTrigger value="perfil">Econômico-financeiro e registros</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" forceMount className={CLASSE_ABA}>
            <ResumoAcervo
              atestados={atestados}
              quantitativos={quantitativos}
              perfil={perfil}
              profissionais={profissionais}
              onIrPara={setAba}
              onAbrirDocumento={abrirDocumento}
            />
          </TabsContent>
          <TabsContent value="documentos" forceMount className={CLASSE_ABA}>
            <DocumentosAcervo
              atestados={atestados}
              quantitativos={quantitativos}
              profissionais={profissionais}
              empresaId={empresaId}
              onRecarregar={carregar}
              docFoco={docFoco}
              onDocFocoTratado={focoTratado}
              podeEditar={podeEditar}
            />
          </TabsContent>
          <TabsContent value="quadro" forceMount className={CLASSE_ABA}>
            <QuadroTecnico
              profissionais={profissionais}
              atestados={atestados}
              empresaId={empresaId}
              onRecarregar={carregar}
              podeEditar={podeEditar}
            />
          </TabsContent>
          <TabsContent value="perfil" forceMount className={CLASSE_ABA}>
            <PerfilEconomico
              perfil={perfil}
              empresaId={empresaId}
              onRecarregar={carregar}
              podeEditar={podeEditar}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
