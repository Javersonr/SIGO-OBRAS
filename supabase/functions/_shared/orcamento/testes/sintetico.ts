/**
 * Orçamento sintético de 3000 linhas (o limite do modelo) para os testes de paridade da tela com o
 * servidor (Vitest) e para os testes do conector (node --test). Não termina em .test.ts: o
 * node --test não o roda como teste. Dados inventados, sem nada de produção.
 *
 * Gerador congruencial de Park-Miller (semente fixa, produto < 2^53): a mesma semente dá sempre a
 * mesma lista. Estrutura: 10 etapas de nível 1; em cada uma, 2 itens diretos (k.1 e k.2) e 3
 * etapas de nível 2 (k.3 a k.5) com 98 itens cada. Quantidade com 3 casas e preço com 4.
 */
import type { ItemModelo } from "../registros.ts";

export const LINHAS_SINTETICAS = 3000;

export function orcamentoSintetico(semente = 20261008): ItemModelo[] {
  let s = semente % 2147483647;
  if (s <= 0) s += 2147483646;
  const proximo = () => (s = (s * 16807) % 2147483647);
  const unidades = ["m", "m²", "un", "kg"];
  const itens: ItemModelo[] = [];
  const etapa = (numero: string, descricao: string) =>
    itens.push({
      linha: itens.length + 2,
      numero,
      etapa: true,
      codigo: null,
      fonte: null,
      descricao,
      unidade: null,
      quantidade: null,
      valor_unitario_ref: null,
      total_informado: null,
    });
  const item = (numero: string) =>
    itens.push({
      linha: itens.length + 2,
      numero,
      etapa: false,
      codigo: String(10000 + (proximo() % 90000)),
      fonte: "SINAPI",
      descricao: `Serviço sintético ${numero}`,
      unidade: unidades[proximo() % unidades.length],
      quantidade: (1 + (proximo() % 999999)) / 1000,
      valor_unitario_ref: (proximo() % 100000000) / 10000,
      total_informado: null,
    });
  for (let e = 1; e <= 10; e++) {
    etapa(String(e), `ETAPA SINTÉTICA ${e}`);
    item(`${e}.1`);
    item(`${e}.2`);
    for (let k = 3; k <= 5; k++) {
      etapa(`${e}.${k}`, `Subetapa sintética ${e}.${k}`);
      for (let m = 1; m <= 98; m++) item(`${e}.${k}.${m}`);
    }
  }
  return itens;
}
