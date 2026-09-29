/**
 * ia-tipos — tipos comuns da porta de IA (Gemini padrão, OpenAI reserva).
 * Só tipos: sem imports e sem código, pode ser importado com `import type`
 * em qualquer módulo (inclusive os testados com node --test).
 */

export type Esforco = "minimal" | "low" | "medium" | "high";
export type NivelIA = "padrao" | "forte";
export type ProvedorIA = "gemini" | "openai";

export interface UsoIA {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface OpcoesIA {
  prompt: string;
  fileRefs?: string[];
  jsonSchema?: unknown;
  nomeSchema?: string;
  strict?: boolean;
  timeoutMs?: number;
  maxOutputTokens?: number;
  inputsExtras?: Record<string, unknown>[];
  esforco?: Esforco;
  /** padrão "padrao" */
  nivel?: NivelIA;
}

export type RespostaIA =
  | {
      ok: true;
      resultado: unknown;
      modelo: string;
      provedor: ProvedorIA;
      usage?: UsoIA;
      ms: number;
      tentativas?: RespostaIA[];
    }
  | {
      ok: false;
      erro: string;
      /** config | timeout | rede | http | cortada | recusa | json */
      motivo?: string;
      modelo?: string;
      provedor?: ProvedorIA;
      usage?: UsoIA;
      ms?: number;
      tentativas?: RespostaIA[];
    };
