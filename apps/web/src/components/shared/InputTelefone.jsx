import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatarTelefone,
  mascaraTelefone,
  mensagemTelefoneInvalido,
  telefoneValido,
} from "@/lib/telefone";

/**
 * Campo de telefone com a máscara padrão "(00) 00000-0000".
 * `onChange` recebe o TEXTO já mascarado (não o evento).
 * O aviso de inválido só aparece fora da digitação (ao sair do campo ou
 * ao abrir um cadastro antigo com número errado).
 */
export default function InputTelefone({ value, onChange, className, onFocus, onBlur, ...props }) {
  const [focado, setFocado] = useState(false);
  const invalido = !telefoneValido(value);

  return (
    <>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(00) 00000-0000"
        {...props}
        value={formatarTelefone(value)}
        onChange={(e) => onChange?.(mascaraTelefone(e.target.value))}
        onFocus={(e) => {
          setFocado(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocado(false);
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
