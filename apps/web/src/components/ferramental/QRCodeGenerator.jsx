import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function QRCodeGenerator({ 
  value, 
  size = 200, 
  level = 'M',
  showDownload = true,
  showPrint = true,
  label = '',
  className = ''
}) {
  const qrRef = useRef(null);

  const handleDownload = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `qrcode-${value}.png`;
    link.click();
  };

  const handlePrint = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;

    const url = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - ${value}</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
            }
            img {
              max-width: 100%;
              height: auto;
            }
            .label {
              margin-top: 20px;
              font-size: 18px;
              font-weight: bold;
              text-align: center;
            }
            .code {
              margin-top: 10px;
              font-size: 14px;
              font-family: monospace;
              text-align: center;
            }
            @media print {
              @page {
                margin: 0.5cm;
              }
            }
          </style>
        </head>
        <body>
          <img src="${url}" alt="QR Code" />
          ${label ? `<div class="label">${label}</div>` : ''}
          <div class="code">${value}</div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className={className}>
      <Card>
        <CardContent className="p-4 flex flex-col items-center gap-4">
          <div ref={qrRef} className="bg-white p-4 rounded-lg">
            <QRCodeCanvas
              value={value}
              size={size}
              level={level}
              includeMargin={true}
            />
          </div>
          
          {label && (
            <div className="text-center">
              <p className="font-semibold text-slate-800">{label}</p>
              <p className="text-sm text-slate-500 font-mono">{value}</p>
            </div>
          )}

          {(showDownload || showPrint) && (
            <div className="flex gap-2 w-full">
              {showDownload && (
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  className="flex-1 gap-2"
                  size="sm"
                >
                  <Download className="w-4 h-4" />
                  Baixar
                </Button>
              )}
              {showPrint && (
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  className="flex-1 gap-2"
                  size="sm"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}