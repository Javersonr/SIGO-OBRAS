import React, { useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Download, Settings } from 'lucide-react';
import EPIEditorPanel from './EPIEditorPanel';

export default function VisualizarDireitoRecusaModal({ open, onOpenChange, funcionario, funcoes, empresaAtiva }) {
  const printRef = useRef(null);
  const [showEditor, setShowEditor] = useState(false);
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('direito-recusa-modal-settings');
      return saved ? JSON.parse(saved) : {
        fontSizeTitulo: 14,
        fontSizeTabela: 11,
        fontSizeDados: 10,
        fontSizeRodape: 10,
        margemSuperior: 10,
        margemInferior: 10,
        paddingCelula: 6,
        alturaLogo: 70,
        margemLogo: 20,
        espacoInferiorCabecalho: 12,
        espacoDados: 8,
        fontSizeLabels: 10,
        alturaAssinatura: 35,
        rodapeLinha1: '',
        rodapeLinha2: 'Rua Artelux de Oliveira, 74 Bairro Santa José de Paula. CEP 32.77000 – João Pinheiro – MG',
        rodapeLinha3: 'Fone: (38) 3561-4381',
      };
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('direito-recusa-modal-settings', JSON.stringify(settings));
  }, [settings]);

  const handleImprimir = () => {
    const printRef = document.getElementById('direito-recusa-print-content');
    const printWindow = window.open('', '', 'height=800,width=1200');

    printWindow.document.write(`
      <html>
        <head>
          <title>Impressão - Direito de Recusa ${funcionario.nome_completo}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              margin: 0;
              padding: 5mm;
              font-family: Arial, sans-serif;
              font-size: 12px;
              background: white;
            }
            img {
              display: block;
              max-width: 100%;
            }
            h1 {
              font-size: 14px;
              font-weight: bold;
              text-align: center;
              margin: 10px 0;
            }
            .border-b {
              border-bottom: 2px solid #1f2937;
              padding-bottom: 8px;
            }
            .text-sm {
              font-size: 11px;
            }
            .text-xs {
              font-size: 10px;
            }
            .font-bold {
              font-weight: bold;
            }
            @media print {
              body::before, body::after {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          ${printRef.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();

    const images = printWindow.document.images;
    let loadedImages = 0;
    const totalImages = images.length;

    if (totalImages === 0) {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 500);
    } else {
      Array.from(images).forEach(img => {
        if (img.complete) {
          loadedImages++;
        } else {
          img.onload = () => {
            loadedImages++;
            if (loadedImages === totalImages) {
              printWindow.focus();
              printWindow.print();
              printWindow.close();
            }
          };
          img.onerror = () => {
            loadedImages++;
            if (loadedImages === totalImages) {
              printWindow.focus();
              printWindow.print();
              printWindow.close();
            }
          };
        }
      });

      if (loadedImages === totalImages) {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 500);
      }

      setTimeout(() => {
        if (loadedImages < totalImages) {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }
      }, 3000);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-hidden p-0 flex flex-row w-full">
        <div className="flex-1 flex flex-col overflow-hidden">
          <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between sticky top-0 bg-white">
            <SheetTitle>Visualizar Direito de Recusa</SheetTitle>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowEditor(!showEditor)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                {showEditor ? 'Fechar' : 'Editar'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleImprimir}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Imprimir
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto p-6">
            <div 
              id="direito-recusa-print-content"
              ref={printRef} 
              className="bg-white"
              style={{ 
                fontFamily: 'Arial, sans-serif',
                width: '100%',
                maxWidth: '1200px',
                margin: '0 auto'
              }}
            >
              {/* Cabeçalho com Logo */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '16px', gap: '20px' }}>
                <div style={{ minWidth: '120px' }}>
                  {empresaAtiva?.logo_url && (
                    <img 
                      src={empresaAtiva.logo_url} 
                      alt="Logo" 
                      style={{ maxHeight: '80px', width: 'auto', objectFit: 'contain' }}
                    />
                  )}
                </div>
              </div>

              {/* Título */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <h1 style={{ fontSize: '16px', fontWeight: 'bold', textDecoration: 'underline' }}>
                  Direito de Recusa
                </h1>
              </div>

              {/* Dados do Funcionário - Destaque amarelo */}
              <div style={{ marginBottom: '16px', fontSize: '11px' }}>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold' }}>Nome do Empregado: </span>
                  <span style={{ backgroundColor: '#ffff00', padding: '2px 4px', fontWeight: 'bold' }}>
                    {funcionario.nome_completo?.toUpperCase() || ''}
                  </span>
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold' }}>Função: </span>
                  <span style={{ backgroundColor: '#ffff00', padding: '2px 4px', fontWeight: 'bold' }}>
                    {funcionario.funcao_nome?.toUpperCase() || ''}
                  </span>
                </div>
                <div>
                  <span style={{ fontWeight: 'bold' }}>CPF: </span>
                  <span style={{ backgroundColor: '#ffff00', padding: '2px 4px', fontWeight: 'bold' }}>
                    {funcionario.cpf || ''}
                  </span>
                </div>
              </div>

              {/* Legislação */}
              <div style={{ marginBottom: '16px', fontSize: '10px', lineHeight: '1.6' }}>
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Legislação:</p>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Norma Regulamentadora 03-NR-3-Embargo ou Interdição</p>
                  <p style={{ textAlign: 'justify' }}>
                    3.1.1 Considera – se grave e iminente risco toda condição ou situação de trabalho que possa causar acidente ou doença relacionado ao trabalho com lesão grave à integridade física do trabalhador.
                  </p>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Norma Regulamentadora 09 NR – 9 Programa de Prevenção de Riscos Ambientais</p>
                  <p style={{ textAlign: 'justify' }}>
                    9.6.3 O empregador deverá garantir que, na ocorrência de riscos ambientais nos locais de trabalho que coloquem em situação de grave e iminente risco um ou mais trabalhadores, os mesmos possam interromper de imediato as suas atividades, comunicando o fato ao supervisor hierárquico direto para as devidas providências.
                  </p>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Norma regulamentadora 10 NR – 10 Segurança em Instalação e Serviços em Eletricidade</p>
                  <p style={{ textAlign: 'justify' }}>
                    10.14.1 Os trabalhadores devem interromper suas tarefas exercendo o direito de recusa, sempre que constatarem evidências de riscos graves e iminentes para sua segurança e saúde ou a de outras pessoas, comunicando imediatamente o fato ao supervisor hierárquico, que diligenciará as medidas cabíveis.
                  </p>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Norma regulamentadora 35 NR – 35 – Trabalho em Altura</p>
                  <p style={{ textAlign: 'justify' }}>
                    35.2.2 Cabe aos trabalhadores;
                  </p>
                  <p style={{ textAlign: 'justify', paddingLeft: '10px' }}>
                    e) interromper suas atividades exercendo o direito de recusa, sempre que constatarem evidências de risco grave e iminentes para sua segurança e saúde ou a de outras pessoas, comunicando imediatamente o fato ao seu superior hierárquico, que diligenciará as medidas cabíveis.
                  </p>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Organização Internacional do trabalho (OIT) Convenção Nº 155 – Segurança e Saúde dos Trabalhadores</p>
                  <p style={{ textAlign: 'justify' }}>
                    De conformidade com a prática e as condições nacionais, deverá proteger – se de consequências injustificada a todo trabalhador que julgar necessário interromper uma situação de trabalho por acreditar, por motivos razoáveis, que este envolve perigo iminente para sua vida ou sua saúde "Artigo 13"
                  </p>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Declaração:</p>
                  <p style={{ textAlign: 'justify' }}>
                    Declaro que tomei ciência da constatação da situação de risco grave e iminente relatada durante o exercício das atividades. Poderei submeter a realização dessas atividades comunicando imediatamente tal fato ao supervisor hierárquico, bem como apresentar a recusa formal, prevista e sustentada pela legislação vigente do Ministério do Trabalho e Emprego, inclusive a Convenção 155 da Organização Internacional do Trabalho que garante e ampara a minha integridade física, bem como a dos demais colegas envolvidos e a dos terceiros próximos.
                  </p>
                </div>
              </div>

              {/* Assinaturas */}
              <div style={{ marginTop: '24px', paddingTop: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', fontSize: '10px' }}>
                  <div>
                    <div style={{ borderBottom: '1px solid #000', height: '50px', marginBottom: '8px' }}></div>
                    <div style={{ marginBottom: '8px' }}>
                      <p style={{ fontWeight: 'bold' }}>Nome: <span style={{ backgroundColor: '#ffff00', padding: '2px 4px' }}>{funcionario.nome_completo?.toUpperCase() || ''}</span></p>
                      <p style={{ marginTop: '4px' }}>Função: {funcionario.funcao_nome?.toUpperCase() || ''}</p>
                      <p>CPF: {funcionario.cpf || ''}</p>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '9px' }}>Assinatura</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid #000', height: '50px', marginBottom: '8px' }}></div>
                    <div style={{ marginBottom: '8px' }}>
                      <p style={{ fontWeight: 'bold' }}>Nome: {funcionario.responsavel_tecnico_nome || 'Javerson Rodrigues da Silva'}</p>
                      <p style={{ marginTop: '4px' }}>Responsável Técnico</p>
                      <p>CREA-MG {funcionario.responsavel_tecnico_crea || '171446/D'}</p>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '9px' }}>Assinatura</div>
                  </div>
                </div>
              </div>

              {/* Rodapé */}
              <div style={{ marginTop: '24px', fontSize: '8px', textAlign: 'center', borderTop: '1px solid #ccc', paddingTop: '8px', color: '#666' }}>
                <p>{settings.rodapeLinha1 || empresaAtiva?.razao_social || empresaAtiva?.nome || 'ELETRO ENERGIA LTDA'}</p>
                {settings.rodapeLinha2 && <p>{settings.rodapeLinha2}</p>}
                {settings.rodapeLinha3 && <p>{settings.rodapeLinha3}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Editor Panel */}
        {showEditor && <EPIEditorPanel settings={settings} onSettingsChange={setSettings} />}
      </SheetContent>
    </Sheet>
  );
}