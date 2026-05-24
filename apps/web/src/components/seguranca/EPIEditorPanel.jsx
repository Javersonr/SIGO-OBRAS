import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Componente externo para evitar perda de foco nos inputs de texto
const RodapeSection = ({ settings, updateSetting, expandedSection, setExpandedSection }) => {
  const isExpanded = expandedSection === 'rodape';
  return (
    <div className="border border-slate-200 rounded-lg mb-3">
      <button
        onClick={() => setExpandedSection(isExpanded ? null : 'rodape')}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50"
      >
        <span className="font-medium text-sm">Rodapé</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      {isExpanded && (
        <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50">
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-slate-700">Linha 1 (Nome da Empresa)</label>
              <input
                type="text"
                value={settings.rodapeLinha1 || ''}
                onChange={(e) => updateSetting('rodapeLinha1', e.target.value)}
                placeholder="Nome da empresa (automático se vazio)"
                className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Linha 2 (Endereço)</label>
              <input
                type="text"
                value={settings.rodapeLinha2 || ''}
                onChange={(e) => updateSetting('rodapeLinha2', e.target.value)}
                className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Linha 3 (Telefone)</label>
              <input
                type="text"
                value={settings.rodapeLinha3 || ''}
                onChange={(e) => updateSetting('rodapeLinha3', e.target.value)}
                className="w-full mt-1 px-2 py-1 border border-slate-300 rounded text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function EPIEditorPanel({ settings, onSettingsChange }) {
  const [expandedSection, setExpandedSection] = useState('fontes');

  const updateSetting = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const updateColumnWidth = (columnIndex, width) => {
    const newWidths = [...(settings.columnWidths || [7, 7, 5, 20, 8, 23, 20])];
    newWidths[columnIndex] = parseInt(width);
    updateSetting('columnWidths', newWidths);
  };

  const moveColumn = (fromIndex, toIndex) => {
    const newOrder = [...(settings.columnOrder || [0, 1, 2, 3, 4, 5, 6])];
    const [movedColumn] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedColumn);
    updateSetting('columnOrder', newOrder);
  };

  const Section = ({ title, id, children }) => (
    <div className="border border-slate-200 rounded-lg mb-3">
      <button
        onClick={() => setExpandedSection(expandedSection === id ? null : id)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50"
      >
        <span className="font-medium text-sm">{title}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${expandedSection === id ? 'rotate-180' : ''}`} />
      </button>
      {expandedSection === id && (
        <div className="p-3 border-t border-slate-200 space-y-3 bg-slate-50">
          {children}
        </div>
      )}
    </div>
  );

  const SliderControl = ({ label, value, min, max, onChange }) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-700">{label}</label>
      <div className="flex gap-2">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-12 px-2 py-1 border border-slate-300 rounded text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="w-80 border-l border-slate-200 bg-white overflow-y-auto p-4 space-y-2">
      <h3 className="font-bold text-slate-800 mb-4">Editor de Documento</h3>

      <Section title="Fontes" id="fontes">
        <SliderControl
          label="Tamanho - Título"
          value={settings.fontSizeTitulo || 14}
          min={10}
          max={24}
          onChange={(v) => updateSetting('fontSizeTitulo', v)}
        />
        <SliderControl
          label="Tamanho - Cabeçalho Tabela"
          value={settings.fontSizeTabela || 11}
          min={8}
          max={16}
          onChange={(v) => updateSetting('fontSizeTabela', v)}
        />
        <SliderControl
          label="Tamanho - Dados"
          value={settings.fontSizeDados || 10}
          min={8}
          max={14}
          onChange={(v) => updateSetting('fontSizeDados', v)}
        />
        <SliderControl
          label="Tamanho - Rodapé"
          value={settings.fontSizeRodape || 10}
          min={8}
          max={14}
          onChange={(v) => updateSetting('fontSizeRodape', v)}
        />
      </Section>

      <Section title="Espaçamentos" id="espacamentos">
        <SliderControl
          label="Altura Linha Tabela (px)"
          value={settings.alturaLinhaTabela || 35}
          min={20}
          max={60}
          onChange={(v) => updateSetting('alturaLinhaTabela', v)}
        />
        <SliderControl
          label="Altura Assinatura (px)"
          value={settings.alturaAssinatura || 35}
          min={20}
          max={60}
          onChange={(v) => updateSetting('alturaAssinatura', v)}
        />
        <SliderControl
          label="Margem Superior (mm)"
          value={settings.margemSuperior || 10}
          min={5}
          max={30}
          onChange={(v) => updateSetting('margemSuperior', v)}
        />
        <SliderControl
          label="Margem Inferior (mm)"
          value={settings.margemInferior || 10}
          min={5}
          max={30}
          onChange={(v) => updateSetting('margemInferior', v)}
        />
        <SliderControl
          label="Padding Célula (px)"
          value={settings.paddingCelula || 6}
          min={2}
          max={12}
          onChange={(v) => updateSetting('paddingCelula', v)}
        />
      </Section>

      <Section title="Colunas" id="colunas">
        <div className="text-xs text-slate-600 mb-3">Arraste para reorganizar, ajuste as larguras:</div>
        <div className="space-y-2">
          {[
            { idx: 0, label: 'Retirada' },
            { idx: 1, label: 'Devolução' },
            { idx: 2, label: 'Quant.' },
            { idx: 3, label: 'Descrição' },
            { idx: 4, label: 'Nº C.A.' },
            { idx: 5, label: 'Assinatura' },
            { idx: 6, label: 'Responsável' },
          ].map((col) => (
            <div key={col.idx} className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-700">{col.label}</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={settings.columnWidths?.[col.idx] || [7, 7, 5, 20, 8, 23, 20][col.idx]}
                    onChange={(e) => updateColumnWidth(col.idx, e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                    min="2"
                    max="50"
                  />
                  <span className="text-xs text-slate-500 py-1">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Cabeçalho" id="cabecalho">
        <SliderControl
          label="Altura Logo (px)"
          value={settings.alturaLogo || 70}
          min={40}
          max={120}
          onChange={(v) => updateSetting('alturaLogo', v)}
        />
        <SliderControl
          label="Margem Logo (px)"
          value={settings.margemLogo || 20}
          min={5}
          max={40}
          onChange={(v) => updateSetting('margemLogo', v)}
        />
        <SliderControl
          label="Espaço Inferior Cabeçalho (px)"
          value={settings.espacoInferiorCabecalho || 12}
          min={5}
          max={25}
          onChange={(v) => updateSetting('espacoInferiorCabecalho', v)}
        />
      </Section>

      <Section title="Dados Funcionário" id="dados">
        <SliderControl
          label="Espaço Inferior (px)"
          value={settings.espacoDados || 8}
          min={2}
          max={20}
          onChange={(v) => updateSetting('espacoDados', v)}
        />
        <SliderControl
          label="Tamanho Fonte Labels"
          value={settings.fontSizeLabels || 10}
          min={8}
          max={12}
          onChange={(v) => updateSetting('fontSizeLabels', v)}
        />
      </Section>

      <RodapeSection settings={settings} updateSetting={updateSetting} expandedSection={expandedSection} setExpandedSection={setExpandedSection} />

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onSettingsChange({
          fontSizeTitulo: 14,
          fontSizeTabela: 11,
          fontSizeDados: 10,
          fontSizeRodape: 10,
          alturaLinhaTabela: 35,
          alturaAssinatura: 35,
          margemSuperior: 10,
          margemInferior: 10,
          paddingCelula: 6,
          alturaLogo: 70,
          margemLogo: 20,
          espacoInferiorCabecalho: 12,
          espacoDados: 8,
          fontSizeLabels: 10,
          columnWidths: [7, 7, 5, 20, 8, 23, 20],
          rodapeLinha1: '',
          rodapeLinha2: 'Rua Artelux de Oliveira, 74 Bairro Santa José de Paula. CEP 32.77000 – João Pinheiro – MG',
          rodapeLinha3: 'Fone: (38) 3561-4381',
        })}
      >
        Restaurar Padrão
      </Button>
    </div>
  );
}