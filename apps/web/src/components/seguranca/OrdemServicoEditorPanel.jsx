import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OrdemServicoEditorPanel({ settings, onSettingsChange }) {
  const [expandedSection, setExpandedSection] = useState('fontes');

  const updateSetting = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
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
          label="Tamanho - Labels"
          value={settings.fontSizeLabels || 10}
          min={8}
          max={14}
          onChange={(v) => updateSetting('fontSizeLabels', v)}
        />
        <SliderControl
          label="Tamanho - Dados"
          value={settings.fontSizeDados || 10}
          min={8}
          max={14}
          onChange={(v) => updateSetting('fontSizeDados', v)}
        />
      </Section>

      <Section title="Espaçamentos" id="espacamentos">
        <SliderControl
          label="Margem Superior (px)"
          value={settings.margemSuperior || 10}
          min={5}
          max={30}
          onChange={(v) => updateSetting('margemSuperior', v)}
        />
        <SliderControl
          label="Margem Inferior (px)"
          value={settings.margemInferior || 10}
          min={5}
          max={30}
          onChange={(v) => updateSetting('margemInferior', v)}
        />
        <SliderControl
          label="Padding Célula (px)"
          value={settings.paddingCelula || 8}
          min={2}
          max={12}
          onChange={(v) => updateSetting('paddingCelula', v)}
        />
        <SliderControl
          label="Espaço Dados (px)"
          value={settings.espacoDados || 8}
          min={2}
          max={20}
          onChange={(v) => updateSetting('espacoDados', v)}
        />
      </Section>

      <Section title="Cabeçalho" id="cabecalho">
        <SliderControl
          label="Altura Logo (px)"
          value={settings.alturaLogo || 70}
          min={40}
          max={150}
          onChange={(v) => updateSetting('alturaLogo', v)}
        />
        <SliderControl
          label="Espaço Inferior Cabeçalho (px)"
          value={settings.espacoInferiorCabecalho || 12}
          min={5}
          max={25}
          onChange={(v) => updateSetting('espacoInferiorCabecalho', v)}
        />
      </Section>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onSettingsChange({
          fontSizeTitulo: 14,
          fontSizeDados: 10,
          margemSuperior: 10,
          margemInferior: 10,
          paddingCelula: 8,
          alturaLogo: 70,
          margemLogo: 20,
          espacoInferiorCabecalho: 12,
          espacoDados: 8,
          fontSizeLabels: 10,
        })}
      >
        Restaurar Padrão
      </Button>
    </div>
  );
}