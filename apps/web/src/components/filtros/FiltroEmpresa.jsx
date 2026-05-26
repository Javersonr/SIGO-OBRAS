import React from "react";
import { useEmpresa } from "@/Layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export default function FiltroEmpresa({
  empresasSelecionadas = [],
  onEmpresasChange,
  mostraTodas = false,
}) {
  const { empresaAtiva, empresas } = useEmpresa();

  const handleEmpresaChange = (empresaId) => {
    if (mostraTodas) {
      if (empresasSelecionadas.includes(empresaId)) {
        onEmpresasChange(empresasSelecionadas.filter((id) => id !== empresaId));
      } else {
        onEmpresasChange([...empresasSelecionadas, empresaId]);
      }
    } else {
      onEmpresasChange([empresaId]);
    }
  };

  const empresaAtualLabel = empresaAtiva
    ? empresaAtiva.razao_social || empresaAtiva.nome_fantasia || empresaAtiva.nome
    : "Empresa";

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-slate-500" />
      <Select
        value={empresasSelecionadas.length === 1 ? empresasSelecionadas[0] : empresaAtiva?.id}
        onValueChange={handleEmpresaChange}
      >
        <SelectTrigger className="w-56 h-10 bg-white border-slate-200">
          <SelectValue placeholder="Selecione empresa" />
        </SelectTrigger>
        <SelectContent>
          {empresas.map((emp) => (
            <SelectItem key={emp.id} value={emp.id}>
              {emp.razao_social || emp.nome_fantasia || emp.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
