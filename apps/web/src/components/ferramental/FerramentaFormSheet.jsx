import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import SheetModalComponent from "@/components/ui/sheet-modal";
import QRCodeGenerator from "./QRCodeGenerator";

export default function FerramentaFormSheet({
  open,
  onOpenChange,
  formData,
  setFormData,
  tipoLocalizacao,
  setTipoLocalizacao,
  selectedItem,
  saving,
  uploadingLaudo,
  setUploadingLaudo,
  almoxarifados,
  caminhoes,
  funcionarios,
  empresaAtiva,
  onSave,
}) {
  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title={selectedItem ? "Editar Ferramenta" : "Nova Ferramenta"}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || !formData.descricao || (formData.tipo === "EPI" && !formData.ca)}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-150px)]">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-2">
              Código
              <span className="text-xs text-green-600 font-normal">(opcional)</span>
            </Label>
            <Input
              value={formData.codigo}
              onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select
              value={formData.tipo}
              onValueChange={(v) => setFormData({ ...formData, tipo: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ferramenta">Ferramenta</SelectItem>
                <SelectItem value="EPI">EPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Status</Label>
          <Select
            value={formData.status}
            onValueChange={(v) => setFormData({ ...formData, status: v })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Disponível">Disponível</SelectItem>
              <SelectItem value="Em Uso">Em Uso</SelectItem>
              <SelectItem value="Em Manutenção">Em Manutenção</SelectItem>
              <SelectItem value="Danificado">Danificado</SelectItem>
              <SelectItem value="Sucata">Sucata</SelectItem>
              <SelectItem value="Inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.tipo === "EPI" && (
          <div>
            <Label>CA (Certificado de Aprovação) *</Label>
            <Input
              value={formData.ca}
              onChange={(e) => setFormData({ ...formData, ca: e.target.value })}
              placeholder="CA-XXXXX"
              className="mt-1.5"
            />
          </div>
        )}

        <div>
          <Label>Descrição *</Label>
          <Input
            value={formData.descricao}
            onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
            placeholder="Ex: Furadeira de Impacto"
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Marca</Label>
            <Input
              value={formData.marca}
              onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Modelo</Label>
            <Input
              value={formData.modelo}
              onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label>Número de Série</Label>
          <Input
            value={formData.numero_serie}
            onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>N° do Laudo</Label>
            <Input
              value={formData.numero_laudo}
              onChange={(e) => setFormData({ ...formData, numero_laudo: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Vencimento Laudo</Label>
            <Input
              type="date"
              value={formData.data_vencimento_laudo}
              onChange={(e) => setFormData({ ...formData, data_vencimento_laudo: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label>Valor Unitário (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.valor_unitario}
            onChange={(e) =>
              setFormData({ ...formData, valor_unitario: parseFloat(e.target.value) || 0 })
            }
            className="mt-1.5"
            placeholder="0.00"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Quantidade em Estoque</Label>
            <Input
              type="number"
              min="0"
              value={formData.quantidade_estoque}
              onChange={(e) =>
                setFormData({ ...formData, quantidade_estoque: parseInt(e.target.value) || 0 })
              }
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Quantidade Mínima (Alerta)</Label>
            <Input
              type="number"
              min="0"
              value={formData.quantidade_minima || 0}
              onChange={(e) =>
                setFormData({ ...formData, quantidade_minima: parseInt(e.target.value) || 0 })
              }
              className="mt-1.5"
            />
          </div>
        </div>

        <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
          <Label className="text-base font-semibold">Localização</Label>
          <div>
            <Label>Tipo de Localização</Label>
            <Select
              value={tipoLocalizacao}
              onValueChange={(v) => {
                setTipoLocalizacao(v);
                setFormData({
                  ...formData,
                  localizacao: "",
                  funcionario_id: "",
                  funcionario_nome: "",
                });
              }}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="almoxarifado">📦 Almoxarifado</SelectItem>
                <SelectItem value="caminhao">🚛 Caminhão</SelectItem>
                <SelectItem value="funcionario">👤 Funcionário</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoLocalizacao === "almoxarifado" && (
            <div>
              <Label>Local</Label>
              <Select
                value={formData.localizacao}
                onValueChange={(v) => setFormData({ ...formData, localizacao: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione o local" />
                </SelectTrigger>
                <SelectContent>
                  {almoxarifados.map((local) => (
                    <SelectItem key={local} value={local}>
                      {local}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {tipoLocalizacao === "caminhao" && (
            <div>
              <Label>Caminhão</Label>
              <Select
                value={formData.caminhao_id || ""}
                onValueChange={(v) => {
                  const caminhao = caminhoes.find((c) => c.id === v);
                  setFormData({ ...formData, caminhao_id: v, localizacao: caminhao?.placa || "" });
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione o caminhão" />
                </SelectTrigger>
                <SelectContent>
                  {caminhoes.map((cam) => (
                    <SelectItem key={cam.id} value={cam.id}>
                      {cam.placa} {cam.modelo ? `- ${cam.modelo}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {tipoLocalizacao === "funcionario" && (
            <div>
              <Label>Funcionário</Label>
              <Select
                value={formData.funcionario_id}
                onValueChange={(v) => {
                  const func = funcionarios.find((f) => f.id === v);
                  setFormData({
                    ...formData,
                    funcionario_id: v,
                    funcionario_nome: func?.nome_completo || "",
                    localizacao: `Funcionário - ${func?.nome_completo || ""}`,
                  });
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione o funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {[...funcionarios]
                    .sort((a, b) => (a.nome_completo || "").localeCompare(b.nome_completo || ""))
                    .map((func) => (
                      <SelectItem key={func.id} value={func.id}>
                        {func.nome_completo}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea
            value={formData.observacoes}
            onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
            className="mt-1.5"
            rows={2}
          />
        </div>

        {selectedItem && formData.codigo && (
          <div className="pt-4 border-t">
            <Label className="mb-3 block">QR Code da Ferramenta</Label>
            <QRCodeGenerator
              value={formData.codigo}
              size={200}
              level="H"
              showDownload={true}
              showPrint={true}
              label={formData.descricao}
            />
          </div>
        )}
      </div>
    </SheetModalComponent>
  );
}
