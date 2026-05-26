import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Fingerprint, Loader2, CheckCircle2, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { sigo } from "@/api/sigoClient";
import NitgenCapture from "@/components/ferramental/NitgenCapture";
import { format } from "date-fns";

export default function BiometriaFuncionarioPanel({
  funcionarioForm,
  setFuncionarioForm,
  selectedFuncionario,
  empresaAtiva,
  uploadingDoc,
  setUploadingDoc,
}) {
  const [showCapturador, setShowCapturador] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [biometriaCarregada, setBiometriaCarregada] = useState(null);

  // Carregar biometria ao abrir funcionário
  useEffect(() => {
    if (selectedFuncionario?.biometria_template) {
      const biometria = JSON.parse(selectedFuncionario.biometria_template || "null");
      if (biometria) {
        setBiometriaCarregada({
          template: biometria.template,
          data_captura: biometria.data_captura,
          qualidade: biometria.qualidade,
        });
      }
    } else {
      setBiometriaCarregada(null);
    }
  }, [selectedFuncionario]);

  const handleCapturarBiometria = async (biometryData) => {
    if (!biometryData || !biometryData.template) {
      toast.error("Erro ao capturar biometria. Tente novamente.");
      return;
    }

    setCapturando(true);
    try {
      const novaBiometria = {
        template: biometryData.template,
        data_captura: new Date().toISOString(),
        qualidade: biometryData.quality || "Boa",
      };

      // Atualizar o formulário com a nova biometria
      const novoForm = {
        ...funcionarioForm,
        biometria_capturada: true,
        biometria_template: JSON.stringify(novaBiometria),
      };
      setFuncionarioForm(novoForm);
      setBiometriaCarregada(novaBiometria);

      // Se já existe funcionário, salvar imediatamente
      if (selectedFuncionario?.id) {
        await sigo.entities.Funcionario.update(selectedFuncionario.id, {
          biometria_capturada: true,
          biometria_template: JSON.stringify(novaBiometria),
        });
      }

      toast.success("Biometria capturada com sucesso!");
      setShowCapturador(false);
    } catch (error) {
      console.error("Erro ao salvar biometria:", error);
      toast.error("Erro ao salvar biometria");
    } finally {
      setCapturando(false);
    }
  };

  const handleRemoverBiometria = async () => {
    if (!confirm("Deseja remover a biometria capturada?")) return;

    try {
      const novoForm = {
        ...funcionarioForm,
        biometria_capturada: false,
        biometria_template: null,
      };
      setFuncionarioForm(novoForm);
      setBiometriaCarregada(null);

      if (selectedFuncionario?.id) {
        await sigo.entities.Funcionario.update(selectedFuncionario.id, {
          biometria_capturada: false,
          biometria_template: null,
        });
      }

      toast.success("Biometria removida com sucesso");
    } catch (error) {
      console.error("Erro ao remover biometria:", error);
      toast.error("Erro ao remover biometria");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-2 border-amber-200 bg-amber-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <CardTitle className="text-base text-amber-900">Cadastro de Biometria</CardTitle>
                <p className="text-xs text-amber-700 mt-1">
                  Necessária para assinatura digital de documentos
                </p>
              </div>
            </div>
            {biometriaCarregada && (
              <Badge className="bg-green-100 text-green-700 border-green-300">✓ Capturada</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {biometriaCarregada ? (
            <div className="space-y-3">
              <div className="bg-white rounded-lg p-3 space-y-2 border border-green-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-700">Biometria Registrada</span>
                </div>
                <div className="text-sm text-slate-600 space-y-1 ml-7">
                  <p>
                    <span className="font-medium">Data de captura:</span>{" "}
                    {format(new Date(biometriaCarregada.data_captura), "dd/MM/yyyy HH:mm")}
                  </p>
                  <p>
                    <span className="font-medium">Qualidade:</span> {biometriaCarregada.qualidade}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCapturador(true)}
                  className="flex-1 gap-2"
                  disabled={capturando}
                >
                  <RefreshCw className="w-4 h-4" />
                  Recapturar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemoverBiometria}
                  className="flex-1 gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Remover
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white rounded-lg p-4 border-2 border-dashed border-amber-300 text-center">
                <Fingerprint className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Nenhuma biometria capturada ainda.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Clique em "Capturar Biometria" para registrar a digital do funcionário.
                </p>
              </div>

              <Button
                onClick={() => setShowCapturador(true)}
                disabled={capturando}
                className="w-full bg-amber-600 hover:bg-amber-700 gap-2"
              >
                {capturando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Capturando...
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4" />
                    Capturar Biometria
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Informações de uso */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 space-y-1">
            <p className="font-medium">💡 Como usar:</p>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              <li>A biometria será usada para assinar treinamentos, EPIs e ferramentas</li>
              <li>A captura requer um leitor biométrico conectado</li>
              <li>Pode ser recapturada a qualquer momento</li>
              <li>Utilize para autenticação de documentos importantes</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Modal de captura */}
      {showCapturador && (
        <NitgenCapture
          open={showCapturador}
          onCapture={handleCapturarBiometria}
          onClose={() => setShowCapturador(false)}
          titulo="Capturar Biometria do Funcionário"
          descricao={`Coloque o dedo do(a) ${funcionarioForm.nome_completo} no leitor biométrico`}
        />
      )}
    </div>
  );
}
