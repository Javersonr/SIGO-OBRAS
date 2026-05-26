import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Truck, User, Search, Printer } from "lucide-react";

export default function RastreabilidadeTab({ ferramentas = [] }) {
  const [searchTerm, setSearchTerm] = useState("");

  // Agrupar por funcionário e caminhão
  const grupos = {
    caminhoes: {},
    funcionarios: {},
    almoxarifado: [],
  };

  ferramentas.forEach((ferr) => {
    if (ferr.funcionario_id && ferr.funcionario_nome) {
      if (!grupos.funcionarios[ferr.funcionario_nome]) {
        grupos.funcionarios[ferr.funcionario_nome] = [];
      }
      grupos.funcionarios[ferr.funcionario_nome].push(ferr);
    } else if (
      ferr.localizacao &&
      ferr.localizacao.trim() &&
      !["Almoxarifado", "almoxarifado"].includes(ferr.localizacao)
    ) {
      if (!grupos.caminhoes[ferr.localizacao]) {
        grupos.caminhoes[ferr.localizacao] = [];
      }
      grupos.caminhoes[ferr.localizacao].push(ferr);
    } else {
      grupos.almoxarifado.push(ferr);
    }
  });

  // Filtrar por busca
  const filtrados = {};
  Object.entries(grupos).forEach(([key, value]) => {
    if (key === "almoxarifado") {
      filtrados[key] = value.filter(
        (f) =>
          f.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          f.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else {
      filtrados[key] = {};
      Object.entries(value).forEach(([nome, ferrs]) => {
        const filtered = ferrs.filter(
          (f) =>
            f.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (filtered.length > 0) {
          filtrados[key][nome] = filtered;
        }
      });
    }
  });

  const imprimirLista = (titulo, ferramentas) => {
    const janela = window.open("", "_blank");
    if (!janela) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${titulo}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: white; }
          h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #f0f0f0; padding: 10px; text-align: left; border: 1px solid #ddd; font-weight: bold; }
          td { padding: 8px; border: 1px solid #ddd; }
          .footer { margin-top: 30px; text-align: center; font-size: 0.9em; color: #999; }
        </style>
      </head>
      <body>
        <h1>${titulo}</h1>
        <p><strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}</p>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Marca</th>
              <th>Status</th>
              <th>Série</th>
            </tr>
          </thead>
          <tbody>
            ${ferramentas
              .map(
                (f) => `
              <tr>
                <td>${f.codigo || "-"}</td>
                <td>${f.descricao || "-"}</td>
                <td>${f.marca || "-"}</td>
                <td>${f.status || "-"}</td>
                <td>${f.numero_serie || "-"}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        <div class="footer">
          <p>Total: ${ferramentas.length} unidades</p>
        </div>
      </body>
      </html>
    `;
    janela.document.write(html);
    janela.document.close();
    setTimeout(() => janela.print(), 250);
  };

  const statusColors = {
    Disponível: "bg-green-100 text-green-700",
    "Em Uso": "bg-blue-100 text-blue-700",
    "Em Manutenção": "bg-orange-100 text-orange-700",
    Danificado: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar ferramentas..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Truck className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{Object.keys(filtrados.caminhoes).length}</p>
              <p className="text-xs text-slate-500 mt-1">Caminhões</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <User className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{Object.keys(filtrados.funcionarios).length}</p>
              <p className="text-xs text-slate-500 mt-1">Funcionários</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-6 h-6 mx-auto mb-2 text-orange-500 font-bold">📦</div>
              <p className="text-2xl font-bold">{filtrados.almoxarifado.length}</p>
              <p className="text-xs text-slate-500 mt-1">Almoxarifado</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Caminhões */}
      {Object.keys(filtrados.caminhoes).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Truck className="w-5 h-5" /> Caminhões
          </h2>
          {Object.entries(filtrados.caminhoes).map(([placa, ferrs]) => (
            <Card key={placa}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Caminhão {placa}</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => imprimirLista(`Ferramentas - Caminhão ${placa}`, ferrs)}
                    className="gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ferrs.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {f.codigo} - {f.descricao}
                        </p>
                        <p className="text-xs text-slate-500">Série: {f.numero_serie || "-"}</p>
                      </div>
                      <Badge className={statusColors[f.status] || "bg-slate-100"}>
                        {f.status || "N/A"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Funcionários */}
      {Object.keys(filtrados.funcionarios).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <User className="w-5 h-5" /> Funcionários
          </h2>
          {Object.entries(filtrados.funcionarios).map(([nome, ferrs]) => (
            <Card key={nome}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{nome}</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => imprimirLista(`Ferramentas - ${nome}`, ferrs)}
                    className="gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ferrs.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {f.codigo} - {f.descricao}
                        </p>
                        <p className="text-xs text-slate-500">Série: {f.numero_serie || "-"}</p>
                      </div>
                      <Badge className={statusColors[f.status] || "bg-slate-100"}>
                        {f.status || "N/A"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Almoxarifado */}
      {filtrados.almoxarifado.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">📦 Almoxarifado</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => imprimirLista("Ferramentas - Almoxarifado", filtrados.almoxarifado)}
                className="gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filtrados.almoxarifado.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {f.codigo} - {f.descricao}
                    </p>
                    <p className="text-xs text-slate-500">Série: {f.numero_serie || "-"}</p>
                  </div>
                  <Badge className={statusColors[f.status] || "bg-slate-100"}>
                    {f.status || "N/A"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {Object.keys(filtrados.caminhoes).length === 0 &&
        Object.keys(filtrados.funcionarios).length === 0 &&
        filtrados.almoxarifado.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-slate-500">Nenhuma ferramenta encontrada</p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
