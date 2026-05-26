import React, { useRef } from "react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { Download } from "lucide-react";

export default function PrintPreviewModal({
  open,
  onOpenChange,
  contentId,
  title = "Visualização de Impressão",
}) {
  const printRef = useRef(null);

  const handleImprimir = () => {
    const printContent = document.getElementById(contentId);
    const printWindow = window.open("", "", "height=800,width=1200");

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
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
          ${printContent.innerHTML}
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
      Array.from(images).forEach((img) => {
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
      <SheetContent
        side="right"
        className="h-full overflow-hidden p-0 flex flex-row"
        style={{ inset: "auto 0 0 256px", width: "calc(100% - 256px)", maxWidth: "none" }}
      >
        <div className="flex-1 flex flex-col overflow-hidden">
          <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between sticky top-0 bg-white">
            <SheetTitle>{title}</SheetTitle>
            <Button variant="outline" size="sm" onClick={handleImprimir} className="gap-2">
              <Download className="w-4 h-4" />
              Imprimir
            </Button>
          </SheetHeader>

          <div className="flex-1 overflow-auto p-6">
            <div
              id={contentId}
              ref={printRef}
              className="bg-white"
              style={{
                fontFamily: "Arial, sans-serif",
                width: "210mm",
                margin: "20px auto",
                padding: "20mm 18mm 20mm 5mm",
                backgroundColor: "white",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
