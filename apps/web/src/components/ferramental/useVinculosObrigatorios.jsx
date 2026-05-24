/**
 * Hook que retorna um mapa de descricao -> { caminhoes: [], funcoes: [] }
 * indicando quais caminhões e funções têm aquela ferramenta como obrigatória.
 */
import { useMemo } from 'react';

export function useVinculosObrigatorios(camposObrigatorios, funcoes, ferramentas) {
  return useMemo(() => {
    const mapa = {}; // key = descricao lowercase

    const ensureKey = (desc) => {
      const k = (desc || '').toLowerCase().trim();
      if (!mapa[k]) mapa[k] = { caminhoes: [], funcoes: [] };
      return k;
    };

    // Caminhões: CaminhaoCampoObrigatorio tem ferramenta_ids (JSON array de IDs)
    for (const campo of camposObrigatorios) {
      let ids = [];
      try { ids = campo.ferramenta_ids ? JSON.parse(campo.ferramenta_ids) : []; } catch {}
      for (const fid of ids) {
        const ferr = ferramentas.find(f => f.id === fid);
        if (!ferr) continue;
        const k = ensureKey(ferr.descricao);
        const placa = campo.caminhao_placa || campo.caminhao_id;
        if (placa && !mapa[k].caminhoes.includes(placa)) {
          mapa[k].caminhoes.push(placa);
        }
      }
    }

    // Funções: modelo_ferramentas é JSON array [{ferramenta, quantidade, ...}]
    for (const funcao of funcoes) {
      let itens = [];
      try { itens = funcao.modelo_ferramentas ? JSON.parse(funcao.modelo_ferramentas) : []; } catch {}
      for (const item of itens) {
        // item.ferramenta pode ser a descrição ou o id
        const descricao = item.ferramenta || item.descricao || '';
        if (!descricao) continue;
        const k = ensureKey(descricao);
        if (!mapa[k].funcoes.includes(funcao.nome)) {
          mapa[k].funcoes.push(funcao.nome);
        }
      }
    }

    return mapa;
  }, [camposObrigatorios, funcoes, ferramentas]);
}