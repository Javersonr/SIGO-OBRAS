import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Printer, Download, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import EPIEditorPanel from './EPIEditorPanel';

export default function VisualizarAutorizacaoFormalCemigModal({ 
  open, 
  onOpenChange, 
  funcionario,
  funcao,
  modelo_autorizacao_formal,
  empresaAtiva 
}) {
  const [showEditor, setShowEditor] = useState(false);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('autorizacao_cemig_settings');
    return saved ? JSON.parse(saved) : {
      fontSize: '10pt',
      lineHeight: '1.4',
      marginTop: '5mm',
      marginBottom: '5mm',
      marginLeft: '5mm',
      marginRight: '18mm',
      titleSize: '10pt',
      textSize: '9.5pt',
      smallTextSize: '9pt'
    };
  });

  useEffect(() => {
    localStorage.setItem('autorizacao_cemig_settings', JSON.stringify(settings));
  }, [settings]);

  const [autorizacoes, setAutorizacoes] = useState(() => {
    // Carregar o modelo de autorização formal da função
    // Priorizar modelo_autorizacao_formal_opcoes (novo formato)
    const opcoesStr = funcao?.modelo_autorizacao_formal_opcoes;
    if (opcoesStr) {
      try {
        const opcoes = JSON.parse(opcoesStr);
        // Mapear as opções para o formato esperado
        return {
          intervencoes_sep: opcoes.nr10 === true,
          espaco_confinado: opcoes.nr33 === true,
          supervisor_entrada: opcoes.nr33_supervisor === true,
          vigia_autorizado: opcoes.nr33_vigia === true,
          altura: opcoes.nr35 === true,
          estruturas_rda: opcoes.nr35_rda === true,
          telhado: opcoes.nr35_telhado === true,
          plataforma: opcoes.nr35_plataforma === true,
          outros: opcoes.outros === true,
          fase_adaptacao: opcoes.fase_adaptacao === true
        };
      } catch (e) {
        console.error('Erro ao parsear modelo_autorizacao_formal_opcoes:', e);
      }
    }

    // Fallback: tentar modelo antigo
    const modeloStr = modelo_autorizacao_formal || funcao?.modelo_autorizacao_formal;
    if (modeloStr) {
      try {
        const modelo = JSON.parse(modeloStr);
        // Se for um array (lista de checkboxes), converter para objeto booleano
        if (Array.isArray(modelo)) {
          return {
            intervencoes_sep: modelo.some(item => item.nome && item.nome.includes('Intervenções') && item.checked),
            espaco_confinado: modelo.some(item => item.nome && item.nome.includes('Espaço Confinado') && item.checked),
            supervisor_entrada: modelo.some(item => item.nome && item.nome.includes('Supervisor') && item.checked),
            vigia_autorizado: modelo.some(item => item.nome && item.nome.includes('Vigia') && item.checked),
            altura: modelo.some(item => item.nome && item.nome.includes('Altura') && item.checked),
            estruturas_rda: modelo.some(item => item.nome && item.nome.includes('Estruturas') && item.checked),
            telhado: modelo.some(item => item.nome && item.nome.includes('Telhado') && item.checked),
            plataforma: modelo.some(item => item.nome && item.nome.includes('Plataforma') && item.checked),
            outros: modelo.some(item => item.nome && item.nome.includes('Outros') && item.checked),
            fase_adaptacao: modelo.some(item => item.nome && item.nome.includes('fase de adaptação') && item.checked)
          };
        }
        // Se já for um objeto, usar diretamente
        return modelo;
      } catch (e) {
        console.error('Erro ao parsear modelo de autorização formal:', e);
      }
    }
    
    // Fallback para o estado padrão
    return {
      intervencoes_sep: false,
      espaco_confinado: false,
      supervisor_entrada: false,
      vigia_autorizado: false,
      altura: false,
      estruturas_rda: false,
      telhado: false,
      plataforma: false,
      outros: false,
      fase_adaptacao: false
    };
  });

  const handleImprimir = () => {
    const printRef = document.getElementById('autorizacao-cemig');
    const printWindow = window.open('', '', 'height=800,width=1200');

    printWindow.document.write(`
      <html>
        <head>
          <title>Autorização Formal CEMIG</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
              padding: 0;
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
            }
            @media print {
              body::before, body::after {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          ${printRef.outerHTML}
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

  const handleGerarPDF = async () => {
    try {
      const element = document.getElementById('autorizacao-cemig');
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }

      const fileName = `Autorizacao_CEMIG_${funcionario.nome_completo.replace(/\s+/g, '_')}_${format(new Date(), 'dd_MM_yyyy')}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  };

  if (!funcionario || !empresaAtiva) return null;

  const nomeEmpresa = empresaAtiva.razao_social || empresaAtiva.nome_fantasia || empresaAtiva.nome;
  const localData = `${empresaAtiva.cidade || 'JOAO PINHEIRO'}, ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }).toUpperCase()}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="overflow-y-auto p-0 bg-white w-full"
      >
        <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-white z-10 no-print">
          <div className="flex items-center justify-between">
            <SheetTitle>Autorização Formal CEMIG</SheetTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditor(!showEditor)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Configurar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGerarPDF}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Baixar PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImprimir}
                className="gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-6 bg-white">
          <div id="autorizacao-cemig" style={{ 
            width: '210mm', 
            margin: '0 auto',
            padding: `${settings.marginTop} ${settings.marginRight} ${settings.marginBottom} ${settings.marginLeft}`,
            backgroundColor: 'white',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column'
          }}>
          <style>{`
            /* Estilos base - aplicados tanto na tela quanto na impressão */
            #autorizacao-cemig {
              font-family: Arial, Helvetica, sans-serif;
              line-height: ${settings.lineHeight};
              color: #000;
              font-size: ${settings.fontSize};
              flex: 1;
              display: flex;
              flex-direction: column;
            }
            
            #autorizacao-cemig h2 {
              font-size: ${settings.titleSize};
              line-height: 1.2;
              margin: 8px 0;
              padding: 4px 0;
            }
            
            #autorizacao-cemig p {
              margin: 6px 0;
              padding: 0;
              line-height: 1.4;
              text-align: justify;
            }
            
            #autorizacao-cemig input[type="checkbox"] {
              width: 12px;
              height: 12px;
              margin: 0 4px 0 0;
              vertical-align: middle;
              flex-shrink: 0;
            }
            
            #autorizacao-cemig .text-xs {
              font-size: ${settings.textSize};
            }
            
            #autorizacao-cemig ul {
              margin: 4px 0;
              padding-left: 16px;
            }
            
            #autorizacao-cemig ul li {
              margin-bottom: 2px;
              font-size: 9.5pt;
            }

            #autorizacao-cemig strong {
              font-weight: bold;
            }

            @media print {
              @page {
                size: A4;
                margin: 20mm 20mm;
              }
              
              * {
                margin: 0 !important;
                padding: 0 !important;
              }
              
              body {
                margin: 0;
                padding: 0;
              }
              
              body * { 
                visibility: hidden; 
              }
              
              #autorizacao-cemig, 
              #autorizacao-cemig * { 
                visibility: visible !important; 
              }
              
              #autorizacao-cemig { 
                position: absolute !important; 
                left: 0 !important; 
                top: 0 !important; 
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 20mm 20mm !important;
                box-shadow: none !important;
                background: white !important;
                page-break-after: avoid;
              }
              
              .no-print { 
                display: none !important; 
              }

              /* Garantir que os estilos inline sejam mantidos */
              #autorizacao-cemig * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          `}</style>

          {/* Logo */}
          <div style={{ marginBottom: '10px' }}>
            {empresaAtiva?.logo_url && (
              <img src={empresaAtiva.logo_url} alt="Logo" style={{ height: '60px', objectFit: 'contain' }} />
            )}
          </div>

          {/* Título */}
          <h2 style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '8px', borderBottom: '2px solid #1e293b', paddingBottom: '4px', fontSize: settings.titleSize, lineHeight: '1.2' }}>
            Autorização Formal para fins de cumprimento da NR-10, NR-33 e NR-35
          </h2>

          {/* Empresa */}
          <div style={{ marginBottom: '8px' }}>
            <p style={{ textAlign: 'center', fontWeight: 'bold', fontSize: settings.textSize }}>EMPRESA: {nomeEmpresa}</p>
          </div>

          {/* Texto principal */}
          <div style={{ marginBottom: '8px', fontSize: settings.textSize }}>
            <p>
              Pelo presente documento, eu, <strong>Javerson Rodrigues da Silva</strong>, Engenheiro Eletricista, registrado no <strong>CREA-MG</strong> sob o n° <strong>171446/D</strong>, 
              CPF N.° <strong>076.443.916-22</strong>, designado pela empresa <strong>{nomeEmpresa}</strong>, Inscrita no CNPJ: <strong>{empresaAtiva.cnpj || '_______________________'}</strong>, 
              para ser o Responsável Técnico–RT pela implantação da Norma(s) Regulamentadora(s) – NR(s) 10, 35, declaro que o empregado <strong>{funcionario.nome_completo.toUpperCase()}</strong>, 
              CPF: <strong>{funcionario.cpf}</strong>, empregado(a) desta empresa, ocupante do cargo <strong>{funcionario.funcao_nome || '_____________'}</strong>, está autorizado(a) formalmente pela Empresa a realizar a(s) seguinte(s) atividade(s):
            </p>
          </div>

          {/* Checkboxes de autorizações */}
          <div style={{ marginBottom: '8px', fontSize: settings.textSize, lineHeight: settings.lineHeight }}>
            {/* Intervenções SEP */}
            <p style={{ marginBottom: '4px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
              <input
                type="checkbox"
                checked={autorizacoes.intervencoes_sep}
                onChange={(e) => setAutorizacoes({ ...autorizacoes, intervencoes_sep: e.target.checked })}
                style={{ width: '12px', height: '12px', marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
              />
              <label style={{ cursor: 'pointer', margin: 0 }}>
                Intervenções em Sistema Elétrico de Potência com código de autorização <strong><em>"{(() => {
                  try {
                    const opcoes = JSON.parse(funcao?.modelo_autorizacao_formal_opcoes || '{}');
                    return opcoes.codigo_autorizacao || '15- C,I';
                  } catch {
                    return '15- C,I';
                  }
                })()}"</em></strong> {(() => {
                  try {
                    const opcoes = JSON.parse(funcao?.modelo_autorizacao_formal_opcoes || '{}');
                    return opcoes.descricao_nr10 || 'Autorizado a auxiliar na execução de serviços no SEP sem contudo executar atividades que requeiram intervenção diretamente no mesmo. Suas atividades são realizadas somente ao nível do solo e restritas à zona livre, de acordo com os limites estabelecidos no anexo I da NR-10 e critérios corporativos definidos pelo item 4.5.12.2 da ET- VCTE-GM-0832.';
                  } catch {
                    return 'Autorizado a auxiliar na execução de serviços no SEP sem contudo executar atividades que requeiram intervenção diretamente no mesmo. Suas atividades são realizadas somente ao nível do solo e restritas à zona livre, de acordo com os limites estabelecidos no anexo I da NR-10 e critérios corporativos definidos pelo item 4.5.12.2 da ET- VCTE-GM-0832.';
                  }
                })()}
              </label>
            </p>

            {/* Espaço Confinado */}
            <p style={{ marginBottom: '4px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
              <input
                type="checkbox"
                checked={autorizacoes.espaco_confinado}
                onChange={(e) => setAutorizacoes({ ...autorizacoes, espaco_confinado: e.target.checked })}
                style={{ width: '12px', height: '12px', marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
              />
              <label style={{ cursor: 'pointer', margin: 0 }}>
                Atividades em Espaço Confinado atendendo ao disposto na NR-33 na função:{' '}
                <input
                  type="checkbox"
                  checked={autorizacoes.supervisor_entrada}
                  onChange={(e) => setAutorizacoes({ ...autorizacoes, supervisor_entrada: e.target.checked })}
                  style={{ width: '12px', height: '12px', margin: '0 2px', verticalAlign: 'middle', cursor: 'pointer' }}
                />
                Supervisor de Entrada{' '}
                <input
                  type="checkbox"
                  checked={autorizacoes.vigia_autorizado}
                  onChange={(e) => setAutorizacoes({ ...autorizacoes, vigia_autorizado: e.target.checked })}
                  style={{ width: '12px', height: '12px', margin: '0 2px', verticalAlign: 'middle', cursor: 'pointer' }}
                />
                Vigia/Trabalhador Autorizado
              </label>
            </p>

            {/* Altura */}
            <p style={{ marginBottom: '4px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
              <input
                type="checkbox"
                checked={autorizacoes.altura}
                onChange={(e) => setAutorizacoes({ ...autorizacoes, altura: e.target.checked })}
                style={{ width: '12px', height: '12px', marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
              />
              <label style={{ cursor: 'pointer', margin: 0 }}>
                Atividades em Altura atendendo ao disposto na NR-35. Abrangendo Trabalhos em:{' '}
                <input
                  type="checkbox"
                  checked={autorizacoes.estruturas_rda}
                  onChange={(e) => setAutorizacoes({ ...autorizacoes, estruturas_rda: e.target.checked })}
                  style={{ width: '12px', height: '12px', margin: '0 2px', verticalAlign: 'middle', cursor: 'pointer' }}
                />
                Estruturas de RDA,{' '}
                <input
                  type="checkbox"
                  checked={autorizacoes.telhado}
                  onChange={(e) => setAutorizacoes({ ...autorizacoes, telhado: e.target.checked })}
                  style={{ width: '12px', height: '12px', margin: '0 2px', verticalAlign: 'middle', cursor: 'pointer' }}
                />
                Telhado,{' '}
                <input
                  type="checkbox"
                  checked={autorizacoes.plataforma}
                  onChange={(e) => setAutorizacoes({ ...autorizacoes, plataforma: e.target.checked })}
                  style={{ width: '12px', height: '12px', margin: '0 2px', verticalAlign: 'middle', cursor: 'pointer' }}
                />
                Plataforma elevatórias ou andaimes.
              </label>
            </p>

            {/* Outros */}
            <p style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="checkbox"
                checked={autorizacoes.outros}
                onChange={(e) => setAutorizacoes({ ...autorizacoes, outros: e.target.checked })}
                style={{ width: '12px', height: '12px', flexShrink: 0, cursor: 'pointer' }}
              />
              <label style={{ cursor: 'pointer', margin: 0 }}>Outros</label>
            </p>

            {/* Fase de adaptação */}
            <p style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="checkbox"
                checked={autorizacoes.fase_adaptacao}
                onChange={(e) => setAutorizacoes({ ...autorizacoes, fase_adaptacao: e.target.checked })}
                style={{ width: '12px', height: '12px', flexShrink: 0, cursor: 'pointer' }}
              />
              <label style={{ cursor: 'pointer', margin: 0 }}>
                Empregado em fase de adaptação profissional. Vigência da autorização: _______________
              </label>
            </p>
          </div>

          {/* Declaração de treinamentos */}
          <div style={{ marginBottom: '8px', fontSize: settings.smallTextSize, lineHeight: settings.lineHeight, flex: 1, overflow: 'hidden' }}>
            <p>
              Declaro também que o (a) empregado(a) <strong>recebeu</strong> todos os devidos treinamentos técnicos necessários à sua capacitação e/ou qualificação e pertinentes à sua atividade conforme o contrato de prestação de serviços, legislação vigente e matriz de treinamentos para contratadas, constando no dossiê de treinamentos do funcionário e também os treinamentos de segurança constantes no Anexo II da NR10, estando portanto apto(a) para realizar a correta análise de risco necessária à execução de seus serviços, bem como executar tecnicamente os serviços para os quais foi capacitado(a)/qualificado(a).
            </p>

            <p>
              <strong>Obs:</strong> Caso seja detectada qualquer restrição médica/psicológica através dos exames de saúde realizados conforme disposto nos itens 10.8.7 da NR10, 35.4.11 da NR35 e 33.3.4.1 da NR33, a empresa comunicará a CEMIG e a validade desta autorização estará temporariamente suspensa.
            </p>

            <p>
              A validade da autorização formal estará condicionada ao treinamento de reciclagem bienal, conforme item 10.8.8.2 da NR-10, 35.3.3 da NR35, reciclagem anual conforme item 33.3.5.3 da NR33 e anexo I da matriz de treinamentos para contratadas, ou seja, caso o empregado não realize os treinamentos de reciclagem obrigatórios, ele automaticamente não estará autorizado a realizar intervenções no SEP e em suas proximidades, atividades em espaços confinados e trabalhos em altura.
            </p>

            <p>
              Este documento atende às determinações da NR-10, NR-35, NR-33 e a matriz de treinamentos para contratadas, em especial aos itens abaixo:
            </p>

            <ul style={{ listStyle: 'none', margin: '4px 0', paddingLeft: '16px', fontSize: settings.smallTextSize }}>
              <li style={{ marginBottom: '2px' }}><strong>Item: 10.8.4</strong> – "São considerados autorizados os trabalhadores qualificados ou capacitados e os profissionais habilitados, com anuência formal da empresa."</li>
              <li style={{ marginBottom: '2px' }}><strong>Item: 10.8.5</strong> – "A empresa deve estabelecer sistema de identificação que permita a qualquer tempo conhecer a abrangência da autorização de cada trabalhador, conforme o item 10.8.4"</li>
              <li style={{ marginBottom: '2px' }}><strong>Item: 35.4.1.1</strong> - Considera-se trabalhador autorizado para trabalho em altura aquele capacitado, cujo estado de saúde foi avaliado, tendo sido considerado apto para executar essa atividade e que possua anuência formal da empresa.</li>
              <li style={{ marginBottom: '2px' }}><strong>Item: 35.4.1.3</strong> A empresa deve manter cadastro atualizado que permita conhecer a abrangência da autorização de cada trabalhador para trabalho em altura.</li>
            </ul>

            <p>
              Pelo presente, o (a) empregado(a) assume o compromisso de executar apenas as atividades para as quais foi autorizado(a), dentro dos limites de sua abrangência de <strong>90 dias</strong>.
            </p>

            <p><strong>Obs:</strong> _________________________________________________________________</p>

            <p>
              Por ser verdade, as partes envolvidas assinam o presente documento, em três vias de igual teor.
            </p>
          </div>

          {/* Data e Local */}
          <div style={{ marginBottom: '20px', marginTop: '12px', textAlign: 'center', fontSize: settings.textSize }}>
            <p style={{ fontWeight: 'bold' }}>{localData}</p>
          </div>

          {/* Assinaturas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '2px solid #1e293b', marginTop: '50px', marginBottom: '8px' }}></div>
              <p style={{ fontWeight: '600', fontSize: settings.smallTextSize, margin: 0 }}>Responsável Técnico: Javerson Rodrigues da Silva</p>
              <p style={{ color: '#64748b', fontSize: settings.smallTextSize, margin: 0 }}>CREA-MG: 171446/D</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '2px solid #1e293b', marginTop: '50px', marginBottom: '8px' }}></div>
              <p style={{ fontWeight: '600', fontSize: settings.smallTextSize, margin: 0 }}>Empregado(a): {funcionario.nome_completo.toUpperCase()}</p>
              <p style={{ color: '#64748b', fontSize: settings.smallTextSize, margin: 0 }}>CPF: {funcionario.cpf}</p>
            </div>
          </div>
          </div>
          </div>

          {/* Painel de Edição */}
          {showEditor && (
            <EPIEditorPanel
              settings={settings}
              onSettingsChange={setSettings}
              onClose={() => setShowEditor(false)}
            />
          )}
          </SheetContent>
          </Sheet>
          );
          }