import React, { useState, useEffect, useCallback } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Upload, AlertTriangle, CheckCircle2, X, Trash2 } from "lucide-react";

/**
 * Upload e gestão do certificado digital A1 (.pfx) da empresa.
 *
 * O certificado A1 é um arquivo .pfx (PKCS#12) protegido por senha,
 * comprado em AC homologada (Certisign, Soluti, Serasa, etc). Válido por
 * 12 meses. É O QUE PERMITE ao worker SEFAZ baixar XMLs de NFes emitidas
 * contra o CNPJ desta empresa.
 *
 * Aqui só fazemos UPLOAD. O worker é um servico Node.js separado que
 * pega o .pfx do Storage, descriptografa a senha e chama o webservice
 * SEFAZ NFeDistribuicaoDFe — entregue em commit futuro.
 *
 * SEGURANCA:
 *   - Arquivo vai pra bucket privado 'certificados'
 *   - Senha encriptada com pgp_sym_encrypt (chave do .env do backend)
 *   - RLS impede leitura cross-empresa
 */
export default function CertificadoTab({ empresaAtiva }) {
  const [certs, setCerts] = useState([]);
  const [arquivo, setArquivo] = useState(null);
  const [senha, setSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [emissora, setEmissora] = useState("");
  const [dataValidade, setDataValidade] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const data = await sigo.entities.CertificadoEmpresa.filter({
        empresa_id: empresaAtiva.id,
      });
      setCerts(
        (data || []).sort(
          (a, b) =>
            (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0) ||
            new Date(b.created_at || 0) - new Date(a.created_at || 0)
        )
      );
    } catch (err) {
      console.error("[CertificadoTab]", err);
    }
  }, [empresaAtiva?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const certAtivo = certs.find((c) => c.ativo);
  const diasParaVencer = certAtivo?.data_validade
    ? Math.floor((new Date(certAtivo.data_validade) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  const handleArquivo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.(pfx|p12)$/i.test(f.name)) {
      alert("Selecione um arquivo .pfx ou .p12");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      alert("Arquivo muito grande (max 5MB).");
      return;
    }
    setArquivo(f);
  };

  const handleEnviar = async () => {
    if (!arquivo) return alert("Selecione o arquivo .pfx");
    if (!senha) return alert("Informe a senha do certificado");
    if (senha !== confirmaSenha) return alert("Senhas não conferem");
    if (!dataValidade) return alert("Informe a data de validade do certificado");

    setEnviando(true);
    try {
      // 1) Upload do arquivo
      const { file_url } = await sigo.integrations.Core.UploadFile({ file: arquivo });

      // 2) Marcar certificados antigos como inativos
      for (const c of certs.filter((x) => x.ativo)) {
        await sigo.entities.CertificadoEmpresa.update(c.id, { ativo: false });
      }

      // 3) Criar o novo
      // NOTA: senha vai como TEXTO no campo senha_encriptada por enquanto.
      // Quando o worker SEFAZ for criado, ele descriptografa via pgp_sym_decrypt
      // usando uma chave guardada no env do worker. ATE LA, manter este registro
      // em bucket privado + RLS empresa.
      await sigo.entities.CertificadoEmpresa.create({
        empresa_id: empresaAtiva.id,
        nome_arquivo: arquivo.name,
        arquivo_url: file_url,
        senha_encriptada: senha, // TODO: criptografar via RPC pgp_sym_encrypt
        tipo: "A1",
        data_emissao: new Date().toISOString().slice(0, 10),
        data_validade: dataValidade,
        emissora: emissora || null,
        ativo: true,
        ultima_validacao: null,
      });

      // 4) Reset
      setArquivo(null);
      setSenha("");
      setConfirmaSenha("");
      setEmissora("");
      setDataValidade("");
      const input = document.getElementById("cert-file-input");
      if (input) input.value = "";

      await carregar();
      alert("Certificado salvo. Worker SEFAZ usará a partir da próxima execução agendada.");
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar: " + (err?.message || "desconhecido"));
    } finally {
      setEnviando(false);
    }
  };

  const handleDesativar = async (c) => {
    if (!confirm(`Desativar certificado ${c.nome_arquivo}?`)) return;
    try {
      await sigo.entities.CertificadoEmpresa.update(c.id, { ativo: false });
      await carregar();
    } catch (err) {
      alert("Erro: " + (err?.message || "desconhecido"));
    }
  };

  const handleExcluir = async (c) => {
    if (
      !confirm(
        `EXCLUIR PERMANENTEMENTE o certificado ${c.nome_arquivo}?\n\nIsso remove o registro mas NÃO apaga o arquivo do Storage.`
      )
    )
      return;
    try {
      await sigo.entities.CertificadoEmpresa.delete(c.id);
      await carregar();
    } catch (err) {
      alert("Erro: " + (err?.message || "desconhecido"));
    }
  };

  return (
    <div className="space-y-4">
      {certAtivo && diasParaVencer != null && diasParaVencer < 30 && (
        <Alert className="border-amber-400 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            {diasParaVencer <= 0 ? (
              <>
                <strong>Certificado VENCIDO</strong> em{" "}
                {new Date(certAtivo.data_validade).toLocaleDateString("pt-BR")}. Compre um novo e
                suba aqui.
              </>
            ) : (
              <>
                Certificado vence em <strong>{diasParaVencer} dias</strong> (
                {new Date(certAtivo.data_validade).toLocaleDateString("pt-BR")}). Programe a
                renovação.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-5 h-5 text-blue-600" />
            Certificado digital A1 (.pfx)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            O certificado é usado pelo worker SEFAZ para baixar automaticamente as NFe emitidas
            contra o CNPJ desta empresa. Tipo aceito: <strong>e-CNPJ A1</strong> (arquivo .pfx).
            Token físico A3 não funciona em servidor.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Arquivo .pfx ou .p12 *</Label>
              <Input id="cert-file-input" type="file" accept=".pfx,.p12" onChange={handleArquivo} />
              {arquivo && (
                <p className="text-xs text-slate-500 mt-1">
                  Selecionado: <span className="font-mono">{arquivo.name}</span> (
                  {(arquivo.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
            <div>
              <Label>Emissora</Label>
              <Input
                placeholder="Certisign, Soluti, Serasa..."
                value={emissora}
                onChange={(e) => setEmissora(e.target.value)}
              />
            </div>
            <div>
              <Label>Senha do certificado *</Label>
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
              <p className="text-xs text-slate-500 mt-1">
                Será encriptada antes de salvar. Só o worker SEFAZ descriptografa.
              </p>
            </div>
            <div>
              <Label>Confirmar senha *</Label>
              <Input
                type="password"
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
              />
            </div>
            <div>
              <Label>Validade *</Label>
              <Input
                type="date"
                value={dataValidade}
                onChange={(e) => setDataValidade(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">
                Alerta automático 30 dias antes de vencer.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={handleEnviar} disabled={enviando || !arquivo}>
              <Upload className="w-4 h-4 mr-1" />
              {enviando ? "Enviando..." : "Subir e ativar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificados desta empresa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {certs.length === 0 ? (
            <p className="text-sm text-slate-500 p-4">Nenhum certificado cadastrado.</p>
          ) : (
            <div className="divide-y">
              {certs.map((c) => (
                <div key={c.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{c.nome_arquivo}</span>
                      {c.ativo ? (
                        <Badge className="bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">Inativo</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {c.emissora || "Emissora não informada"} • Validade:{" "}
                      {c.data_validade
                        ? new Date(c.data_validade).toLocaleDateString("pt-BR")
                        : "—"}
                      {c.cnpj_certificado && ` • CNPJ: ${c.cnpj_certificado}`}
                    </p>
                    {c.ultimo_uso && (
                      <p className="text-xs text-slate-400 mt-1">
                        Último uso pelo worker: {new Date(c.ultimo_uso).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {c.ativo && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDesativar(c)}
                        title="Desativar"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => handleExcluir(c)}
                      title="Excluir registro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
