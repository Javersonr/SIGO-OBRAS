import React, { useState, useEffect } from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";

const CORES_PADRAO = {
  "cor-primaria": "#f59e0b",
  "cor-primaria-hover": "#d97706",
  "cor-primaria-active": "#b45309",
  "cor-secundaria": "#10b981",
  "cor-secundaria-hover": "#059669",
  "cor-secundaria-active": "#047857",
  "bg-principal": "#ffffff",
  "bg-secundario": "#f8fafc",
  "bg-terciario": "#f1f5f9",
  "bg-hover": "#f1f5f9",
  "bg-active": "#e2e8f0",
  "texto-principal": "#1e293b",
  "texto-secundario": "#64748b",
  "texto-terciario": "#94a3b8",
  "cor-sucesso": "#10b981",
  "cor-erro": "#ef4444",
  "cor-aviso": "#f59e0b",
  "cor-info": "#3b82f6",
};

const GRUPOS_CORES = [
  {
    nome: "Cores Primárias",
    cores: ["cor-primaria", "cor-primaria-hover", "cor-primaria-active"],
  },
  {
    nome: "Cores Secundárias",
    cores: ["cor-secundaria", "cor-secundaria-hover", "cor-secundaria-active"],
  },
  {
    nome: "Fundos",
    cores: ["bg-principal", "bg-secundario", "bg-terciario", "bg-hover", "bg-active"],
  },
  {
    nome: "Textos",
    cores: ["texto-principal", "texto-secundario", "texto-terciario"],
  },
  {
    nome: "Estados",
    cores: ["cor-sucesso", "cor-erro", "cor-aviso", "cor-info"],
  },
];

export default function TemaCustomizacao({ value, onChange }) {
  const [cores, setCores] = useState(CORES_PADRAO);

  useEffect(() => {
    try {
      if (value) {
        const parsedCores = safeParseJSON(value, {});
        setCores((prev) => ({ ...prev, ...parsedCores }));
      } else {
        setCores(CORES_PADRAO);
      }
    } catch (e) {
      console.error("Erro ao carregar cores:", e);
      setCores(CORES_PADRAO);
    }
  }, [value]);

  const handleCorChange = (key, newValue) => {
    const novasCores = { ...cores, [key]: newValue };
    setCores(novasCores);
    onChange(JSON.stringify(novasCores));
  };

  const resetarCores = () => {
    if (confirm("Deseja resetar para as cores padrão?")) {
      setCores(CORES_PADRAO);
      onChange(JSON.stringify(CORES_PADRAO));
    }
  };

  const getDisplayName = (key) => {
    const names = {
      "cor-primaria": "Cor Primária",
      "cor-primaria-hover": "Cor Primária (Hover)",
      "cor-primaria-active": "Cor Primária (Ativo)",
      "cor-secundaria": "Cor Secundária",
      "cor-secundaria-hover": "Cor Secundária (Hover)",
      "cor-secundaria-active": "Cor Secundária (Ativo)",
      "bg-principal": "Fundo Principal",
      "bg-secundario": "Fundo Secundário",
      "bg-terciario": "Fundo Terciário",
      "bg-hover": "Fundo (Hover)",
      "bg-active": "Fundo (Ativo)",
      "texto-principal": "Texto Principal",
      "texto-secundario": "Texto Secundário",
      "texto-terciario": "Texto Terciário",
      "cor-sucesso": "Cor de Sucesso",
      "cor-erro": "Cor de Erro",
      "cor-aviso": "Cor de Aviso",
      "cor-info": "Cor de Informação",
    };
    return names[key] || key;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Personalização de Tema</CardTitle>
          <p className="text-sm text-slate-500 mt-1">Personalize as cores do sistema</p>
        </div>
        <Button variant="outline" onClick={resetarCores} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Resetar Padrão
        </Button>
      </CardHeader>
      <CardContent>
        {GRUPOS_CORES.map((grupo, idx) => (
          <div key={grupo.nome} className={idx > 0 ? "mt-8 pt-8 border-t" : "mt-0"}>
            <h3 className="text-base font-semibold text-slate-700 mb-6">{grupo.nome}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {grupo.cores.map((key) => (
                <div key={key}>
                  <Label className="block mb-2.5 text-sm font-medium text-slate-600">
                    {getDisplayName(key)}
                  </Label>
                  <div className="flex gap-3 items-center">
                    <div className="relative">
                      <Input
                        type="color"
                        value={cores[key] || ""}
                        onChange={(e) => handleCorChange(key, e.target.value)}
                        className="h-12 w-16 p-1 cursor-pointer border-2 border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                      />
                    </div>
                    <Input
                      type="text"
                      value={cores[key] || ""}
                      onChange={(e) => handleCorChange(key, e.target.value)}
                      placeholder="#000000"
                      className="flex-1 font-mono text-sm h-12 uppercase"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
