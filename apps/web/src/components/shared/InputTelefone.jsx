import React, { useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  digitosTelefone,
  formatarTelefone,
  mascaraTelefone,
  mensagemTelefoneInvalido,
  telefoneValido,
} from "@/lib/telefone";

const soDigitos = (s) => String(s ?? "").replace(/\D/g, "");

/** Posição no texto logo depois do n-ésimo dígito (n = 0 → antes do 1º dígito). */
function posicaoAposDigitos(texto, n) {
  if (n <= 0) {
    const i = texto.search(/\d/);
    return i < 0 ? texto.length : i;
  }
  let c = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i]) && ++c === n) return i + 1;
  }
  return texto.length;
}

/**
 * Aplica a máscara no texto digitado preservando o cursor: devolve o texto
 * mascarado e quantos dígitos ficam antes do cursor.
 * Passou de 11 dígitos? Descarta o que acabou de entrar (os dígitos logo
 * antes do cursor), como um maxLength — digitar no meio de um número completo
 * não pode empurrar o último dígito pra fora e virar outro número válido.
 */
function mascararComCursor(bruto, cursor) {
  let antes = soDigitos(bruto.slice(0, cursor)).length;
  let d = digitosTelefone(bruto);
  antes = Math.max(0, antes - (soDigitos(bruto).length - d.length)); // +55/0 tirados do início
  const sobra = d.length - 11;
  if (sobra > 0) {
    const ini = Math.max(0, antes - sobra);
    d = (d.slice(0, ini) + d.slice(antes)).slice(0, 11);
    antes = ini;
  }
  const texto = mascaraTelefone(d);
  antes = Math.max(0, antes - (d.length - soDigitos(texto).length)); // 0 tirado na máscara
  return { texto, antes };
}

/**
 * Backspace/Delete que só apagou um separador ("-", ")", " ") não mudaria
 * nada (a máscara o recoloca): apaga o dígito vizinho — o anterior no
 * Backspace, o seguinte no Delete. Devolve o texto/cursor a mascarar.
 */
function apagarSobreSeparador(bruto, cursor, anterior, tipo) {
  const tras = tipo === "deleteContentBackward";
  if (!tras && tipo !== "deleteContentForward") return { bruto, cursor };
  if (bruto.length !== anterior.length - 1 || soDigitos(bruto) !== soDigitos(anterior)) {
    return { bruto, cursor };
  }
  const n = soDigitos(bruto.slice(0, cursor)).length;
  const alvo = tras ? n - 1 : n; // índice do dígito a apagar
  // nada antes/depois (ex.: o "(" do início): mantém o valor e o cursor
  if (alvo < 0 || alvo >= soDigitos(bruto).length) {
    return { bruto: anterior, cursor: posicaoAposDigitos(anterior, n) };
  }
  const p = posicaoAposDigitos(bruto, alvo + 1) - 1; // posição do dígito alvo
  return { bruto: bruto.slice(0, p) + bruto.slice(p + 1), cursor: p };
}

/**
 * Campo de telefone com a máscara padrão "(00) 00000-0000".
 * `onChange` recebe o TEXTO já mascarado (não o evento).
 * O cursor fica onde o usuário estava editando (não pula pro fim).
 * O aviso de inválido só aparece fora da digitação (ao sair do campo ou
 * ao abrir um cadastro antigo com número errado).
 */
export default function InputTelefone({ value, onChange, className, onFocus, onBlur, ...props }) {
  const [focado, setFocado] = useState(false);
  // nº de dígitos antes do cursor após a última edição (objeto novo a cada
  // edição → re-renderiza mesmo se o valor não mudou)
  const [cursor, setCursor] = useState(null);
  const ref = useRef(null);
  const invalido = !telefoneValido(value);
  const mostrado = formatarTelefone(value);

  // depois que o valor mascarado chega ao DOM, recoloca o cursor
  useLayoutEffect(() => {
    const el = ref.current;
    if (!cursor || !el || document.activeElement !== el) return;
    const pos = posicaoAposDigitos(el.value, cursor.antes);
    el.setSelectionRange(pos, pos);
  }, [cursor, mostrado]);

  const aoMudar = (e) => {
    const el = e.target;
    const inicial = el.selectionStart ?? el.value.length;
    const { bruto, cursor: pos } = apagarSobreSeparador(
      el.value,
      inicial,
      mostrado,
      e.nativeEvent?.inputType
    );
    const { texto, antes } = mascararComCursor(bruto, pos);
    setCursor({ antes });
    onChange?.(texto);
  };

  return (
    <>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(00) 00000-0000"
        {...props}
        ref={ref}
        value={mostrado}
        onChange={aoMudar}
        onFocus={(e) => {
          setFocado(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocado(false);
          setCursor(null);
          onBlur?.(e);
        }}
        aria-invalid={invalido || undefined}
        className={cn(invalido && !focado && "border-red-400", className)}
      />
      {invalido && !focado && (
        <p className="text-xs text-red-600 mt-1">{mensagemTelefoneInvalido(value)}</p>
      )}
    </>
  );
}
