import React, { useState, useEffect } from "react";
import { sigo } from "@/api/sigoClient";
import { safeUrl } from "@/lib/safe-url";
import { useEmpresa } from "@/Layout";
import SheetModalComponent from "@/components/ui/sheet-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  X,
  Loader2,
  Link2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileWarning,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function FerramentaModal({ open, onOpenChange, ferramenta, onSave }) {
  const { empresaAtiva } = useEmpresa();
  const [formData, setFormData] = useState({
    codigo: "",
    descricao: "",
    tipo: "Ferramenta",
    marca: "",
    modelo: "",
    status: "Disponível",
    localizacao: "",
    numero_serie: "",
    numero: "",
    ca: "",
    numero_laudo: "",
    data_vencimento_laudo: "",
    laudo_url: "",
    laudo_obrigatorio: false,
    observacoes: "",
    foto_url: "",
    valor_unitario: 0,
    quantidade_estoque: 0,
    intervalo_manutencao_dias: 0,
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingLaudo, setUploadingLaudo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [caminhoes, setCaminhoes] = useState([]);
  const [camposObrigatorios, setCamposObrigatorios] = useState([]);
  const [campoVinculadoId, setCampoVinculadoId] = useState("");
  const [buscaCampo, setBuscaCampo] = useState("");
  const [sugestoesIA, setSugestoesIA] = useState([]);
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);

  useEffect(() => {
    if (empresaAtiva) {
      loadCaminhoes();
    }
  }, [empresaAtiva]);

  // Normaliza localização legada (ex: "ABC1234" → "Caminhão - ABC1234")
  const normalizarLocalizacao = (loc, cams) => {
    if (!loc) return "";
    if (loc === "Almoxarifado" || loc.startsWith("Caminhão -")) return loc;
    // Se a localização bate com a placa de algum caminhão, prefixar
    const match = cams.find((c) => c.placa === loc);
    if (match) return `Caminhão - ${match.placa}`;
    return loc;
  };

  // Quando localização muda para caminhão, carrega os campos obrigatórios daquele caminhão
  useEffect(() => {
    const localizacao = formData.localizacao;
    if (!localizacao || !localizacao.startsWith("Caminhão - ") || !empresaAtiva) {
      setCamposObrigatorios([]);
      setBuscaCampo("");
      setSugestoesIA([]);
      return;
    }
    const placa = localizacao.replace("Caminhão - ", "");
    const caminhao = caminhoes.find((c) => c.placa === placa);
    if (!caminhao) return;

    sigo.entities.CaminhaoCampoObrigatorio.filter({
      empresa_id: empresaAtiva.id,
      caminhao_id: caminhao.id,
      ativo: true,
    })
      .then((data) => {
        setCamposObrigatorios(data);
        setBuscaCampo("");
        setSugestoesIA([]);
      })
      .catch(() => {
        setCamposObrigatorios([]);
        setBuscaCampo("");
        setSugestoesIA([]);
      });
  }, [formData.localizacao, caminhoes, empresaAtiva]);

  // Ao abrir o modal, inicializa o campo vinculado
  useEffect(() => {
    if (ferramenta) {
      setCampoVinculadoId(ferramenta.campo_obrigatorio_id || "");
    } else {
      setCampoVinculadoId("");
    }
  }, [ferramenta, open]);

  useEffect(() => {
    if (ferramenta) {
      setFormData({
        codigo: ferramenta.codigo || "",
        descricao: ferramenta.descricao || "",
        tipo: ferramenta.tipo || "Ferramenta",
        marca: ferramenta.marca || "",
        modelo: ferramenta.modelo || "",
        status: ferramenta.status || "Disponível",
        localizacao: normalizarLocalizacao(ferramenta.localizacao || "", caminhoes),
        numero_serie: ferramenta.numero_serie || "",
        numero: ferramenta.numero || "",
        ca: ferramenta.ca || "",
        numero_laudo: ferramenta.numero_laudo || "",
        data_vencimento_laudo: ferramenta.data_vencimento_laudo || "",
        laudo_url: ferramenta.laudo_url || "",
        laudo_obrigatorio: ferramenta.laudo_obrigatorio || false,
        observacoes: ferramenta.observacoes || "",
        foto_url: ferramenta.foto_url || "",
        valor_unitario: ferramenta.valor_unitario || 0,
        quantidade_estoque: ferramenta.quantidade_estoque || 0,
        intervalo_manutencao_dias: ferramenta.intervalo_manutencao_dias || 0,
      });
    } else {
      setFormData({
        codigo: "",
        descricao: "",
        tipo: "Ferramenta",
        marca: "",
        modelo: "",
        status: "Disponível",
        localizacao: "",
        numero_serie: "",
        numero: "",
        ca: "",
        numero_laudo: "",
        data_vencimento_laudo: "",
        laudo_url: "",
        laudo_obrigatorio: false,
        observacoes: "",
        foto_url: "",
        valor_unitario: 0,
        quantidade_estoque: 0,
        intervalo_manutencao_dias: 0,
      });
    }
  }, [ferramenta, open]);

  const loadCaminhoes = async () => {
    try {
      const data = await sigo.entities.Caminhao.filter({
        empresa_id: empresaAtiva.id,
        ativo: true,
      });
      setCaminhoes(data);
    } catch (error) {
      console.error("Erro ao carregar caminhões:", error);
    }
  };

  const gerarSugestoesIA = async (texto) => {
    if (!texto.trim() || camposObrigatorios.length === 0) {
      setSugestoesIA([]);
      return;
    }

    setCarregandoSugestoes(true);
    try {
      const sugestoes = camposObrigatorios.filter((campo) =>
        campo.nome_campo.toLowerCase().includes(texto.toLowerCase())
      );
      setSugestoesIA(sugestoes);
    } catch (error) {
      console.error("Erro ao gerar sugestões:", error);
      setSugestoesIA([]);
    } finally {
      setCarregandoSugestoes(false);
    }
  };

  const handleLaudoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLaudo(true);
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      setFormData((prev) => ({ ...prev, laudo_url: file_url }));
      toast.success("Laudo anexado com sucesso!");
    } catch (error) {
      console.error("Erro ao fazer upload do laudo:", error);
      toast.error("Erro ao enviar laudo");
    } finally {
      setUploadingLaudo(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem");
      return;
    }

    try {
      setUploadingPhoto(true);
      const { file_url } = await sigo.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, foto_url: file_url });
      toast.success("Foto enviada com sucesso!");
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error("Erro ao enviar foto");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!formData.codigo || !formData.descricao) {
      toast.error("Preencha código e descrição");
      return;
    }

    try {
      setSaving(true);

      const data = {
        empresa_id: empresaAtiva.id,
        ...formData,
        ativo: true,
        campo_obrigatorio_id: campoVinculadoId && campoVinculadoId.trim() ? campoVinculadoId : null,
      };

      if (ferramenta) {
        await sigo.entities.Ferramenta.update(ferramenta.id, data);
        toast.success("Ferramenta atualizada com sucesso!");
      } else {
        // Verificar se código já existe
        const existe = await sigo.entities.Ferramenta.filter({
          empresa_id: empresaAtiva.id,
          codigo: formData.codigo,
          ativo: true,
        });

        if (existe.length > 0) {
          toast.error("Já existe uma ferramenta com este código");
          setSaving(false);
          return;
        }

        await sigo.entities.Ferramenta.create(data);
        toast.success("Ferramenta cadastrada com sucesso!");
      }

      onSave();
    } catch (error) {
      console.error("Erro ao salvar ferramenta:", error);
      toast.error("Erro ao salvar ferramenta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetModalComponent
      open={open}
      onOpenChange={onOpenChange}
      title={ferramenta ? "Editar Ferramenta" : "Nova Ferramenta"}
      subtitle="Preencha os dados da ferramenta"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Foto */}
        <div>
          <Label>Foto de Referência</Label>
          <div className="mt-2">
            {formData.foto_url ? (
              <div className="relative inline-block">
                <img
                  src={formData.foto_url}
                  alt="Preview"
                  className="w-32 h-32 object-cover rounded-lg border"
                />
                <button
                  onClick={() => setFormData({ ...formData, foto_url: "" })}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-amber-500 transition-colors">
                {uploadingPhoto ? (
                  <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs text-slate-500">Enviar foto</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                />
              </label>
            )}
          </div>
        </div>

        {/* Tipo */}
        <div>
          <Label>Tipo *</Label>
          <Select
            value={formData.tipo}
            onValueChange={(value) => setFormData({ ...formData, tipo: value })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Ferramenta">Ferramenta</SelectItem>
              <SelectItem value="EPI">EPI</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Código */}
        <div>
          <Label>Código *</Label>
          <Input
            value={formData.codigo}
            onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
            placeholder="Ex: FERM001"
            className="mt-1"
          />
        </div>

        {/* Descrição */}
        <div>
          <Label>Descrição *</Label>
          <Input
            value={formData.descricao}
            onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
            placeholder="Ex: Furadeira de impacto profissional"
            className="mt-1"
          />
        </div>

        {/* Marca e Modelo */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Marca</Label>
            <Input
              value={formData.marca}
              onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
              placeholder="Ex: Bosch"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Modelo</Label>
            <Input
              value={formData.modelo}
              onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
              placeholder="Ex: GSB 550"
              className="mt-1"
            />
          </div>
        </div>

        {/* Status e Localização */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Disponível">Disponível</SelectItem>
                <SelectItem value="Em Uso">Em Uso</SelectItem>
                <SelectItem value="Em Manutenção">Em Manutenção</SelectItem>
                <SelectItem value="Danificado">Danificado</SelectItem>
                <SelectItem value="Inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Localização</Label>
            <Select
              value={formData.localizacao}
              onValueChange={(value) => setFormData({ ...formData, localizacao: value })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Almoxarifado">📦 Almoxarifado</SelectItem>
                {caminhoes.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider border-t border-slate-200 mt-1 pt-2">
                      🚛 Caminhões (Configurações)
                    </div>
                    {caminhoes.map((cam) => (
                      <SelectItem key={cam.id} value={`Caminhão - ${cam.placa}`}>
                        {cam.placa}
                        {cam.modelo ? ` · ${cam.modelo}` : ""}
                        {cam.marca ? ` ${cam.marca}` : ""}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {caminhoes.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Nenhum caminhão cadastrado em Configurações.
              </p>
            )}
          </div>
        </div>

        {/* Campo Obrigatório vinculado ao caminhão */}
        {formData.localizacao?.startsWith("Caminhão - ") && (
          <div>
            <Label className="flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" />
              Campo Obrigatório
            </Label>
            {camposObrigatorios.length > 0 ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    placeholder="Buscar campo obrigatório..."
                    value={buscaCampo}
                    onChange={(e) => {
                      setBuscaCampo(e.target.value);
                      gerarSugestoesIA(e.target.value);
                    }}
                    className="mt-1"
                  />
                  {buscaCampo && sugestoesIA.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {sugestoesIA.map((campo) => (
                        <button
                          key={campo.id}
                          onClick={() => {
                            setCampoVinculadoId(campo.id);
                            setBuscaCampo(campo.nome_campo);
                            setSugestoesIA([]);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b border-slate-100 last:border-b-0 transition-colors"
                        >
                          <div className="text-sm font-medium text-slate-800">
                            {campo.nome_campo}
                          </div>
                          {campo.quantidade_obrigatoria > 1 && (
                            <div className="text-xs text-slate-500">
                              Quantidade: {campo.quantidade_obrigatoria}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {campoVinculadoId && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    Campo selecionado
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Nenhum campo obrigatório cadastrado para este caminhão.
              </p>
            )}
          </div>
        )}

        {/* Número de Série */}
        <div>
          <Label>Número de Série</Label>
          <Input
            value={formData.numero_serie}
            onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
            placeholder="Ex: SN123456789"
            className="mt-1"
          />
        </div>

        {/* Campos específicos para EPI */}
        {formData.tipo === "EPI" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Número do EPI</Label>
              <Input
                value={formData.numero}
                onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                placeholder="Ex: 001"
                className="mt-1"
              />
            </div>
            <div>
              <Label>CA (Certificado de Aprovação)</Label>
              <Input
                value={formData.ca}
                onChange={(e) => setFormData({ ...formData, ca: e.target.value })}
                placeholder="Ex: 12345"
                className="mt-1"
              />
            </div>
          </div>
        )}

        {/* Laudo — para QUALQUER tipo */}
        <div className="border border-slate-200 rounded-lg p-4 space-y-4">
          {/* Toggle obrigatoriedade */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold">Laudo Obrigatório</Label>
              <p className="text-xs text-slate-500 mt-0.5">
                Marque se esta ferramenta exige laudo técnico
              </p>
            </div>
            <Switch
              checked={!!formData.laudo_obrigatorio}
              onCheckedChange={(v) => setFormData({ ...formData, laudo_obrigatorio: v })}
            />
          </div>

          {/* Status atual do laudo (leitura) */}
          {formData.laudo_obrigatorio && (
            <>
              {formData.laudo_url ? (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-xs text-green-700 font-medium flex-1">Laudo anexado</span>
                  <a
                    href={safeUrl(formData.laudo_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    Ver
                  </a>
                  <button
                    onClick={() => setFormData({ ...formData, laudo_url: "" })}
                    className="ml-1 text-slate-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-700 font-medium">Laudo ainda não anexado</span>
                </div>
              )}

              {/* Campos do laudo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Número do Laudo</Label>
                  <Input
                    value={formData.numero_laudo}
                    onChange={(e) => setFormData({ ...formData, numero_laudo: e.target.value })}
                    placeholder="Ex: LAU-2024-001"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Vencimento do Laudo</Label>
                  <Input
                    type="date"
                    value={formData.data_vencimento_laudo}
                    onChange={(e) =>
                      setFormData({ ...formData, data_vencimento_laudo: e.target.value })
                    }
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>

              {/* Upload do arquivo */}
              <div>
                <Label className="text-xs">Arquivo do Laudo (PDF ou imagem)</Label>
                <label className="mt-1 flex items-center gap-3 cursor-pointer border-2 border-dashed border-slate-300 rounded-lg px-4 py-3 hover:border-amber-400 transition-colors">
                  {uploadingLaudo ? (
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                  ) : (
                    <FileWarning className="w-5 h-5 text-slate-400" />
                  )}
                  <span className="text-xs text-slate-500">
                    {uploadingLaudo ? "Enviando..." : "Clique para anexar laudo"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={handleLaudoUpload}
                    disabled={uploadingLaudo}
                  />
                </label>
              </div>
            </>
          )}
        </div>

        {/* Valores e Estoque */}
        <div className="grid grid-cols-2 gap-4">
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
              className="mt-1"
            />
          </div>
          <div>
            <Label>Quantidade em Estoque</Label>
            <Input
              type="number"
              min="0"
              value={formData.quantidade_estoque}
              onChange={(e) =>
                setFormData({ ...formData, quantidade_estoque: parseInt(e.target.value) || 0 })
              }
              className="mt-1"
            />
          </div>
        </div>

        {/* Manutenção */}
        <div>
          <Label>Intervalo de Manutenção (dias)</Label>
          <Input
            type="number"
            min="0"
            value={formData.intervalo_manutencao_dias}
            onChange={(e) =>
              setFormData({ ...formData, intervalo_manutencao_dias: parseInt(e.target.value) || 0 })
            }
            placeholder="0 = sem manutenção programada"
            className="mt-1"
          />
          <p className="text-xs text-slate-500 mt-1">
            Informe 0 para ferramentas sem necessidade de manutenção periódica
          </p>
        </div>

        {/* Observações */}
        <div>
          <Label>Observações</Label>
          <Textarea
            value={formData.observacoes}
            onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
            placeholder="Informações adicionais sobre a ferramenta..."
            rows={4}
            className="mt-1"
          />
        </div>
      </div>
    </SheetModalComponent>
  );
}
