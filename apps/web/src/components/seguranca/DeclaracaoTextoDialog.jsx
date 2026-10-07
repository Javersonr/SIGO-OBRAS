import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DeclaracaoAmbienteConteudo } from "@/components/portal-funcionario/DeclaracaoAmbientePortal";
import { MARCADOS_VAZIOS } from "@/lib/portal-declaracao";
import {
  ART_MAX,
  TEXTO_MAX,
  TEXTO_MIN,
  igualAoVigente,
  normalizarDeclaracao,
  validarDeclaracaoDoRT,
} from "@/lib/ead-declaracao-ambiente";

/**
 * Janela do responsável técnico (RT) para escrever a orientação e a declaração que o aluno confirma ao abrir o
 * curso, e a ART dele (T35; NR-1, Anexo II, 4.3 e 4.4). Cada salvamento cria uma VERSÃO nova (a antiga continua
 * gravada: o evento de cada aluno guarda a versão que ele leu). À direita, "Como o aluno vê". Enquanto o RT não
 * salvar, o texto da janela é o padrão sugerido, "pendente de aprovação do RT": salvá-lo como está é a aprovação.
 *
 * `vigente` = `{ versao, texto, art, aprovado }` (lib/ead-declaracao-ambiente.js); `aberto` abre a janela;
 * `onSalvar({ texto, art })` grava e devolve true quando deu certo (a janela fecha sozinha).
 */
export default function DeclaracaoTextoDialog({ aberto, vigente, onFechar, onSalvar }) {
  const [texto, setTexto] = useState(vigente.texto);
  const [art, setArt] = useState(vigente.art || "");
  const [marcados, setMarcados] = useState({ ...MARCADOS_VAZIOS });
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);

  // cada abertura começa do que vale agora, nunca do rascunho da anterior
  useEffect(() => {
    if (!aberto) return;
    setTexto(vigente.texto);
    setArt(vigente.art || "");
    setMarcados({ ...MARCADOS_VAZIOS });
    setTentou(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const digitado = { texto, art };
  const conferido = validarDeclaracaoDoRT(digitado);
  const igual = igualAoVigente(vigente, digitado);
  const proxima = vigente.versao + 1;
  const normalizado = normalizarDeclaracao(digitado);

  const salvar = async (e) => {
    e.preventDefault();
    setTentou(true);
    if (!conferido.ok) {
      toast.error(conferido.erros.texto || conferido.erros.art);
      return;
    }
    if (igual) return;
    setSalvando(true);
    try {
      if (await onSalvar(normalizado)) onFechar();
    } finally {
      setSalvando(false);
    }
  };

  const erroTexto = (tentou || texto.length > TEXTO_MAX) && conferido.erros.texto;
  const erroArt = conferido.erros.art;

  return (
    <Dialog open={!!aberto} onOpenChange={(v) => !v && !salvando && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <form onSubmit={salvar} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="pr-6 leading-snug">
              Declaração de ambiente e horário do aluno
            </DialogTitle>
            <DialogDescription>
              O aluno lê este texto e marca três itens (local adequado, horário reservado, sem outra
              atividade) na primeira vez que abre cada curso no dia. Cada salvamento cria uma versão
              nova e registra o seu e-mail; quem já declarou continua com o texto que leu.
            </DialogDescription>
          </DialogHeader>

          {!vigente.aprovado && (
            <p
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              Este é o texto padrão sugerido,{" "}
              <strong>pendente de aprovação do responsável técnico</strong>. Edite se precisar e
              salve: o salvamento vira a versão 1 e passa a valer como o texto aprovado.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="declaracao-texto" className="text-xs">
                    Orientação e declaração (o que o aluno lê)
                  </Label>
                  <span
                    className={`text-xs ${
                      texto.trim().length > TEXTO_MAX ? "text-red-700" : "text-slate-500"
                    }`}
                  >
                    {texto.trim().length} / {TEXTO_MAX}
                  </span>
                </div>
                <Textarea
                  id="declaracao-texto"
                  rows={14}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  className="mt-0.5"
                  aria-invalid={!!erroTexto}
                  aria-describedby="declaracao-texto-ajuda"
                />
                <p
                  id="declaracao-texto-ajuda"
                  className={`mt-1 text-xs ${erroTexto ? "text-red-700" : "text-slate-500"}`}
                >
                  {erroTexto ||
                    `De ${TEXTO_MIN} a ${TEXTO_MAX} caracteres. As linhas em branco são mantidas.`}
                </p>
              </div>
              <div>
                <Label htmlFor="declaracao-art" className="text-xs">
                  ART do responsável técnico (número ou referência), opcional
                </Label>
                <Input
                  id="declaracao-art"
                  value={art}
                  onChange={(e) => setArt(e.target.value)}
                  maxLength={ART_MAX}
                  className="mt-0.5"
                  placeholder="Ex.: 1234567890123 (número da ART)"
                  aria-invalid={!!erroArt}
                />
                <p className={`mt-1 text-xs ${erroArt ? "text-red-700" : "text-slate-500"}`}>
                  {erroArt || "Aparece para o aluno logo abaixo do texto."}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Como o aluno vê</p>
              <div className="rounded-lg border border-violet-200 bg-white p-3">
                <DeclaracaoAmbienteConteudo
                  declaracao={{ versao: proxima, texto: normalizado.texto, art: normalizado.art }}
                  marcados={marcados}
                  onMarcar={(id, valor) => setMarcados((atual) => ({ ...atual, [id]: valor }))}
                  onConfirmar={() => {}}
                  previa
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando || igual || !conferido.ok}
              title={igual ? "Nada mudou em relação à versão em vigor" : undefined}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {vigente.aprovado
                ? `Salvar como versão ${proxima}`
                : "Aprovar e salvar como versão 1"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
