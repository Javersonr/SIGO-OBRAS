import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronDown, ClipboardCheck, ClipboardList } from "lucide-react";
import {
  AVISO_HISTORICO_PARCIAL,
  textoDoItemDeEntrega,
  tituloDoHistorico,
} from "@/lib/portal-ciencias";
import { fmtDataHora } from "./api";

/**
 * Ciências de entrega (EPI, ferramenta, documento) no painel do aluno: as pendentes, com o botão de
 * ciência, e o histórico das já confirmadas (T36). A separação das duas listas e o texto de cada item
 * estão em lib/portal-ciencias.js (com teste). Quem confirma é o servidor (ação `ciencia`).
 */

function ItensDaEntrega({ itens }) {
  if (!Array.isArray(itens) || itens.length === 0) return null;
  return (
    <ul className="text-sm text-slate-700 list-disc pl-5">
      {itens.map((it, i) => (
        <li key={i}>{textoDoItemDeEntrega(it)}</li>
      ))}
    </ul>
  );
}

/** Entregas que ainda esperam a ciência do aluno. `onConfirmar(id)` chama o servidor. */
export function EntregasPendentes({ pendentes, onConfirmar }) {
  if (!pendentes?.length) return null;
  return (
    <Card className="border-amber-300">
      <CardContent className="p-4 space-y-3">
        <p className="font-semibold text-amber-800 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />
          Você tem entregas aguardando sua ciência:
        </p>
        {pendentes.map((c) => (
          <div key={c.id} className="border rounded-lg p-3 bg-amber-50 space-y-2">
            <p className="text-sm">
              <Badge variant="outline" className="mr-2">
                {c.tipo}
              </Badge>
              {c.descricao}
            </p>
            <ItensDaEntrega itens={c.itens} />
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onConfirmar(c.id)}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmo o recebimento (dou ciência)
            </Button>
            <p className="text-[11px] text-amber-700">
              Ao confirmar, ficam registrados seu login, data/hora e aparelho — vale como assinatura
              eletrônica (Lei 14.063/2020).
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Histórico das entregas que o aluno já confirmou, recolhido por padrão (só leitura). Não desenha nada
 * quando não há nenhuma. O servidor manda só as 30 entregas mais recentes (pendentes e confirmadas
 * juntas): com `parcial` (o servidor mandou o limite inteiro, `historicoDeCienciasParcial`) o título
 * não sugere o total e um aviso diz que as mais antigas não aparecem.
 */
export function HistoricoDeEntregas({ confirmadas, parcial = false }) {
  if (!confirmadas?.length) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
            <ClipboardCheck className="w-4 h-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="flex-1">{tituloDoHistorico(confirmadas.length, parcial)}</span>
            <ChevronDown
              className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="divide-y border-t">
            {confirmadas.map((c) => (
              <li key={c.id} className="p-4 space-y-1.5">
                <p className="text-sm">
                  <Badge variant="outline" className="mr-2">
                    {c.tipo}
                  </Badge>
                  {c.descricao}
                </p>
                <ItensDaEntrega itens={c.itens} />
                <p className="text-xs text-emerald-700">
                  {c.confirmada_em ? `Confirmada em ${fmtDataHora(c.confirmada_em)}` : "Confirmada"}
                </p>
              </li>
            ))}
          </ul>
          {parcial && (
            <p className="border-t p-4 text-xs text-slate-500">{AVISO_HISTORICO_PARCIAL}</p>
          )}
        </details>
      </CardContent>
    </Card>
  );
}
