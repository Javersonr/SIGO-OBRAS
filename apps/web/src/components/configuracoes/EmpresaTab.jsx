import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Search } from "lucide-react";
import TemaCustomizacao from "@/components/configuracoes/TemaCustomizacao";

export default function EmpresaTab({
  empresaAtiva,
  empresaData,
  setEmpresaData,
  handleSaveEmpresa,
  savingEmpresa,
  handleUploadLogo,
  uploadingLogo,
  handleBuscarCnpj,
  handleBuscarCepEmpresa,
  buscandoCepEmpresa,
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Dados da Empresa</CardTitle>
          <Button
            onClick={handleSaveEmpresa}
            disabled={savingEmpresa}
            className="bg-amber-500 hover:bg-amber-600"
          >
            <Save className="w-4 h-4 mr-2" />
            {savingEmpresa ? "Salvando..." : "Salvar"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200">
              {empresaData.logo_url ? (
                <img
                  src={empresaData.logo_url}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-slate-400 text-xs text-center">Sem logo</span>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Logo da Empresa</Label>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors">
                  {uploadingLogo ? "Enviando..." : "Alterar Logo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadLogo}
                  disabled={uploadingLogo}
                />
              </label>
            </div>
          </div>

          {/* CNPJ com busca */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>CNPJ</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  value={empresaData.cnpj || ""}
                  onChange={(e) => setEmpresaData({ ...empresaData, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
                <Button
                  variant="outline"
                  onClick={() => handleBuscarCnpj(empresaData.cnpj || "")}
                  disabled={buscandoCepEmpresa}
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Inscrição Estadual</Label>
              <Input
                value={empresaData.inscricao_estadual || ""}
                onChange={(e) =>
                  setEmpresaData({ ...empresaData, inscricao_estadual: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Razão Social e Nome Fantasia */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Razão Social</Label>
              <Input
                value={empresaData.razao_social || ""}
                onChange={(e) => setEmpresaData({ ...empresaData, razao_social: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Nome Fantasia</Label>
              <Input
                value={empresaData.nome_fantasia || ""}
                onChange={(e) => setEmpresaData({ ...empresaData, nome_fantasia: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Contato */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={empresaData.email || ""}
                onChange={(e) => setEmpresaData({ ...empresaData, email: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={empresaData.telefone || ""}
                onChange={(e) => setEmpresaData({ ...empresaData, telefone: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>WhatsApp Financeiro</Label>
              <Input
                value={empresaData.whatsapp_financeiro || ""}
                onChange={(e) =>
                  setEmpresaData({ ...empresaData, whatsapp_financeiro: e.target.value })
                }
                placeholder="5511999999999"
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Endereço */}
          <div>
            <h4 className="font-medium text-slate-700 mb-3">Endereço</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>CEP</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    value={empresaData.cep || ""}
                    onChange={(e) => setEmpresaData({ ...empresaData, cep: e.target.value })}
                    placeholder="00000-000"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleBuscarCepEmpresa(empresaData.cep || "")}
                    disabled={buscandoCepEmpresa}
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input
                  value={empresaData.endereco || ""}
                  onChange={(e) => setEmpresaData({ ...empresaData, endereco: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Número</Label>
                <Input
                  value={empresaData.numero || ""}
                  onChange={(e) => setEmpresaData({ ...empresaData, numero: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div>
                <Label>Bairro</Label>
                <Input
                  value={empresaData.bairro || ""}
                  onChange={(e) => setEmpresaData({ ...empresaData, bairro: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="col-span-2">
                <Label>Cidade</Label>
                <Input
                  value={empresaData.cidade || ""}
                  onChange={(e) => setEmpresaData({ ...empresaData, cidade: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Estado (UF)</Label>
                <Input
                  value={empresaData.estado || ""}
                  onChange={(e) => setEmpresaData({ ...empresaData, estado: e.target.value })}
                  maxLength={2}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>

          {/* Responsável */}
          <div>
            <Label>Responsável Principal</Label>
            <Input
              value={empresaData.responsavel_principal || ""}
              onChange={(e) =>
                setEmpresaData({ ...empresaData, responsavel_principal: e.target.value })
              }
              className="mt-1.5"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tema */}
      <TemaCustomizacao
        empresaAtiva={empresaAtiva}
        empresaData={empresaData}
        setEmpresaData={setEmpresaData}
      />
    </div>
  );
}
