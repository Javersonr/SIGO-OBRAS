import React, { useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Download, Settings } from 'lucide-react';
import OrdemServicoEditorPanel from './OrdemServicoEditorPanel';

export default function VisualizarOrdemServicoModal({ open, onOpenChange, funcionario, funcao, empresaAtiva }) {
  const printRef = useRef(null);
  const [showEditor, setShowEditor] = useState(false);
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('ordem-servico-modal-settings');
      return saved ? JSON.parse(saved) : {
        fontSizeTitulo: 14,
        fontSizeDados: 10,
        margemSuperior: 10,
        margemInferior: 10,
        paddingCelula: 8,
        alturaLogo: 70,
        margemLogo: 20,
        espacoInferiorCabecalho: 12,
        espacoDados: 8,
      };
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('ordem-servico-modal-settings', JSON.stringify(settings));
  }, [settings]);

  const handleImprimir = () => {
    const printRef = document.getElementById('ordem-servico-print-content');
    const printWindow = window.open('', '', 'height=800,width=1200');

    printWindow.document.write(`
      <html>
        <head>
          <title>Impressão - Ordem de Serviço ${funcionario.nome_completo}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              font-size: 10pt;
              background: white;
            }
            img {
              display: block;
              max-width: 100%;
              max-height: 40px;
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

  const data = funcao?.modelo_ordem_servicos ? JSON.parse(funcao.modelo_ordem_servicos) : {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full overflow-hidden p-0 flex flex-row w-full">
        <div className="flex-1 flex flex-col overflow-hidden">
          <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between sticky top-0 bg-white">
            <SheetTitle>Visualizar Ordem de Serviços</SheetTitle>
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

          <div className="flex-1 overflow-auto" key={JSON.stringify(settings)}>
           <style>{`
              #ordem-servico-print-content * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              #ordem-servico-print-content {
                font-family: Arial, sans-serif;
                font-size: 10pt;
              }
              #ordem-servico-print-content img {
                display: block;
                max-width: 100%;
              }
              @media print {
                #ordem-servico-print-content img {
                  height: 360px !important;
                  width: auto !important;
                }
              }
            `}</style>
            <div 
              id="ordem-servico-print-content"
              ref={printRef}
              className="bg-white"
              style={{
                fontFamily: 'Arial, sans-serif',
                width: '210mm',
                margin: '0 auto',
                padding: '10mm',
                boxSizing: 'border-box',
                fontSize: '10pt'
              }}
            >
              {/* PÁGINA 1 */}
              <div style={{ pageBreakAfter: 'always' }}>
                {/* Logo e Título */}
                <div style={{ marginBottom: '3mm' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8mm', marginBottom: '2mm' }}>
                    {empresaAtiva?.logo_url && (
                      <img src={empresaAtiva.logo_url} alt="Logo" style={{ height: '114px', width: 'auto', flexShrink: 0 }} />
                    )}
                    <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: '0', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ORDEM DE SERVIÇO</h1>
                  </div>
                  <div style={{ borderBottom: '2px solid black' }}></div>
                </div>

                {/* Informações do Funcionário */}
                <div style={{ border: '2px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#999', color: 'white', padding: '1.5mm', fontSize: '9pt', fontWeight: 'bold', borderBottom: '1px solid black', textAlign: 'center' }}>
                    Informações sobre o funcionário
                  </div>
                  <div style={{ backgroundColor: '#fff', padding: '2mm', fontSize: '9pt', lineHeight: '1.4' }}>
                    <div>Nome: {funcionario.nome_completo || ''}</div>
                    <div>Função: {funcionario.funcao_nome || ''}</div>
                    <div>CPF: {funcionario.cpf || ''}</div>
                    <div>DATA: {funcionario.data_admissao ? format(new Date(funcionario.data_admissao), 'dd/MM/yyyy') : ''}</div>
                  </div>
                </div>

                {/* Parágrafo Legal */}
                <div style={{ marginBottom: '3mm', fontSize: '10pt', textAlign: 'justify', lineHeight: '1.4' }}>
                  <p>Conforme estabelecido no item 1.7, letra "b", NR-01 da Portaria 3214/MTE, cabe ao empregador elaborar Ordem de Serviço (OS) sobre Segurança e Medicina do Trabalho, dando ciência os empregados:</p>
                </div>

                {/* Cargo e Função */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Cargo e Função:</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid black', marginBottom: '1mm' }}>
                      <div style={{ borderRight: '1px solid black', padding: '1mm' }}><span style={{ fontWeight: 'bold' }}>Função:</span> {data.funcao || funcionario.funcao_nome || ''}</div>
                      <div style={{ padding: '1mm' }}><span style={{ fontWeight: 'bold' }}>Setor:</span> {data.setor || ''}</div>
                    </div>
                    <div style={{ borderBottom: '1px solid black', padding: '1mm', marginBottom: '1mm' }}>
                      <span style={{ fontWeight: 'bold' }}>Locais de Trabalho:</span> {data.locais_trabalho || ''}
                    </div>
                    <div style={{ borderBottom: '1px solid black', padding: '1mm', marginBottom: '1mm' }}>
                      <span style={{ fontWeight: 'bold' }}>Descrição Sumária:</span> {data.descricao_sumaria || ''}
                    </div>
                    <div style={{ padding: '1mm' }}>
                      <span style={{ fontWeight: 'bold' }}>Atividades Desenvolvidas:</span> {data.atividades_desenvolvidas || ''}
                    </div>
                  </div>
                </div>

                {/* Agentes Ambientais */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Agentes ambientais inerentes ao local de trabalho/atividades:</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid black', marginBottom: '1mm' }}>
                      <div style={{ borderRight: '1px solid black', padding: '1mm' }}>
                        <span style={{ fontWeight: 'bold' }}>Físicos:</span> {data.agentes_fisicos || ''}
                      </div>
                      <div style={{ padding: '1mm' }}>
                        <span style={{ fontWeight: 'bold' }}>Químicos:</span> {data.agentes_quimicos || ''}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid black', marginBottom: '1mm' }}>
                      <div style={{ borderRight: '1px solid black', padding: '1mm' }}>
                        <span style={{ fontWeight: 'bold' }}>Biológicos:</span> {data.agentes_biologicos || ''}
                      </div>
                      <div style={{ padding: '1mm' }}>
                        <span style={{ fontWeight: 'bold' }}>Ergonômicos:</span> {data.agentes_ergonomicos || ''}
                      </div>
                    </div>
                    <div style={{ padding: '1mm' }}>
                      <span style={{ fontWeight: 'bold' }}>Acidentes:</span> {data.agentes_acidentes || ''}
                    </div>
                  </div>
                </div>

                {/* Tecnologias de Proteção */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Tecnologias de proteção:</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt' }}>
                    <div style={{ borderBottom: '1px solid black', paddingBottom: '1mm', marginBottom: '1mm' }}>
                      <span style={{ fontWeight: 'bold' }}>EPC:</span> {data.tecnologias_epc || ''}
                    </div>
                    <div>
                      <span style={{ fontWeight: 'bold' }}>EPI:</span> {data.tecnologias_epi || ''}
                    </div>
                  </div>
                </div>

                {/* Instruções de Segurança */}
                <div style={{ border: '1px solid black' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Instruções de Segurança e Saúde Ocupacional</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt', whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>
                    {data.instrucoes_seguranca || 'Nenhum conteúdo'}
                  </div>
                </div>

                {/* Footer */}
                <div style={{ paddingTop: '2mm', marginTop: '3mm', borderTop: '3px solid black', textAlign: 'center', fontSize: '8pt' }}>
                  SESMT – Serviço Especializado em Engenharia de Segurança e Medicina do Trabalho
                </div>
              </div>

              {/* PÁGINA 2 */}
              <div style={{ pageBreakAfter: 'avoid' }}>
                {/* Logo e Título */}
                <div style={{ marginBottom: '3mm' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8mm', marginBottom: '2mm' }}>
                    {empresaAtiva?.logo_url && (
                      <img src={empresaAtiva.logo_url} alt="Logo" style={{ height: '114px', width: 'auto', flexShrink: 0 }} />
                    )}
                    <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: '0', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ORDEM DE SERVIÇO</h1>
                  </div>
                  <div style={{ borderBottom: '2px solid black' }}></div>
                </div>

                {/* Observações */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Observações:</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt', whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>
                    {data.observacoes || 'Nenhum'}
                  </div>
                </div>

                {/* Punições */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Punições</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt', whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>
                    {data.punicoes || 'N/A'}
                  </div>
                </div>

                {/* Ministério do Trabalho */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Ministério do Trabalho</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt', whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>
                    {data.ministerio_trabalho || 'N/A'}
                  </div>
                </div>

                {/* Medicina do trabalho */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Medicina do trabalho</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt', whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>
                    {data.medicina_trabalho || 'N/A'}
                  </div>
                </div>

                {/* Bases Legais */}
                <div style={{ marginBottom: '3mm', backgroundColor: '#333', color: 'white', padding: '2mm', textAlign: 'center', fontSize: '9pt', fontWeight: 'bold', border: '1px solid black' }}>
                  BASES LEGAIS - SEGURANÇA E SAÚDE OCUPACIONAL<br/>PORTARIA 3214 DE 8 DE JUNHO DE 1978 – NR - 1
                </div>

                {/* Termo de Responsabilidade */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ backgroundColor: '#ddd', padding: '1.5mm', fontWeight: 'bold', fontSize: '10pt', textAlign: 'center', borderBottom: '1px solid black' }}>Termo de Responsabilidade</div>
                  <div style={{ padding: '1.5mm', fontSize: '10pt', textAlign: 'justify', lineHeight: '1.3' }}>
                    Declaro que recebi da {empresaAtiva?.razao_social || empresaAtiva?.nome || '[EMPRESA]'} a Ordem de Serviço contida neste documento, inclusive uma cópia do mesmo pelo qual me comprometo sempre a cumpri-las durante o exercício do trabalho. Estou ciente que estas instruções são essenciais para a proteção da minha integridade física e saúde, inclusive a de meus colegas de trabalho. Afirmo aqui que a empresa fornece os EPI's necessários ao desempenho seguro das minhas atividades. Sou ciente de que pelo não cumprimento das instruções de segurança ou pela recusa ao uso dos EPI's estará sujeito às punições cabíveis.
                  </div>
                </div>

                {/* Tabela de Assinatura */}
                <div style={{ border: '1px solid black', marginBottom: '3mm' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr', gap: '0' }}>
                    <div style={{ borderRight: '1px solid black', padding: '1.5mm', fontSize: '10pt', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ddd' }}>Data</div>
                    <div style={{ borderRight: '1px solid black', padding: '1.5mm', fontSize: '10pt', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ddd' }}>Nome</div>
                    <div style={{ borderRight: '1px solid black', padding: '1.5mm', fontSize: '10pt', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ddd' }}>CPF</div>
                    <div style={{ padding: '1.5mm', fontSize: '10pt', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ddd' }}>Assinatura</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr', gap: '0', borderTop: '1px solid black' }}>
                    <div style={{ borderRight: '1px solid black', padding: '1.5mm', fontSize: '10pt', height: '30px', display: 'flex', alignItems: 'center' }}>{format(new Date(), 'dd/MM/yyyy')}</div>
                    <div style={{ borderRight: '1px solid black', padding: '1.5mm', fontSize: '10pt', height: '30px', display: 'flex', alignItems: 'center' }}>{funcionario.nome_completo || ''}</div>
                    <div style={{ borderRight: '1px solid black', padding: '1.5mm', fontSize: '10pt', height: '30px', display: 'flex', alignItems: 'center' }}>{funcionario.cpf || ''}</div>
                    <div style={{ padding: '1.5mm', fontSize: '10pt', height: '30px' }}></div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ paddingTop: '2mm', borderTop: '3px solid black', textAlign: 'center', fontSize: '8pt' }}>
                  SESMT – Serviço Especializado em Engenharia de Segurança e Medicina do Trabalho
                </div>
              </div>
            </div>
           </div>
         </div>

         {/* Editor Panel */}
         {showEditor && <OrdemServicoEditorPanel settings={settings} onSettingsChange={setSettings} />}
       </SheetContent>


     </Sheet>
   );
}