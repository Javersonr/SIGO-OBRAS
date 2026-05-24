import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { itens, cabecalho } = await req.json();

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const verde = rgb(0.29, 0.49, 0.18);
    const vermelho = rgb(0.8, 0, 0);
    const cinza = rgb(0.96, 0.96, 0.96);
    const preto = rgb(0, 0, 0);
    const branco = rgb(1, 1, 1);

    const pageW = 595, pageH = 842;
    const margin = 30;

    const drawText = (page, text, x, y, size, color, f) => {
      page.drawText(String(text || '').substring(0, 200), { x, y, size, color, font: f || font });
    };
    const drawRect = (page, x, y, w, h, color, border = false) => {
      page.drawRectangle({ x, y, width: w, height: h, color, borderColor: border ? rgb(0.6, 0.6, 0.6) : undefined, borderWidth: border ? 0.5 : 0 });
    };

    // ===== PÁGINA 1: PLANILHA DE FECHAMENTO =====
    const planPage = pdfDoc.addPage([pageW, pageH]);
    let y = pageH - margin;

    drawRect(planPage, margin, y - 20, pageW - 2 * margin, 20, verde);
    drawText(planPage, `${cabecalho.numeroCaixa} CAIXA FUNDO FIXO – ${(cabecalho.nomeResponsavel || '').toUpperCase()}`, margin + 4, y - 15, 10, branco, fontBold);
    y -= 20;

    drawRect(planPage, margin, y - 16, pageW - 2 * margin, 16, verde);
    drawText(planPage, `PRESTAÇÃO DE CONTAS REF A: ${cabecalho.dataFormatada}`, margin + 4, y - 12, 9, branco, font);
    y -= 16;

    drawRect(planPage, margin, y - 16, pageW - 2 * margin, 16, cinza);
    drawText(planPage, cabecalho.empresa || '', margin + 4, y - 12, 9, preto, fontBold);
    y -= 20;

    const cols = [
      { label: 'Item', w: 30 },
      { label: 'Data', w: 55 },
      { label: 'HISTÓRICO', w: 210 },
      { label: 'DOCUMENTOS', w: 80 },
      { label: 'ENTRADAS', w: 80, align: 'right' },
      { label: 'SAÍDAS', w: 80, align: 'right' },
    ];
    const tableW = pageW - 2 * margin;
    const rowH = 14;

    let cx = margin;
    drawRect(planPage, margin, y - rowH, tableW, rowH, verde);
    cols.forEach(col => { drawText(planPage, col.label, cx + 2, y - rowH + 3, 8, branco, fontBold); cx += col.w; });
    y -= rowH;

    // Saldo inicial
    cx = margin;
    drawRect(planPage, margin, y - rowH, tableW, rowH, cinza, true);
    const saldoAnt = parseFloat(cabecalho.saldoAnterior) || 0;
    const saldoCells = ['', '', 'Saldo Inicial – Último acerto realizado', '', `R$ ${saldoAnt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, ''];
    cols.forEach((col, ci) => {
      const txt = saldoCells[ci];
      const tx = col.align === 'right' ? cx + col.w - 2 - font.widthOfTextAtSize(txt, 8) : cx + 2;
      drawText(planPage, txt, tx, y - rowH + 3, 8, preto, font);
      cx += col.w;
    });
    y -= rowH;

    let totalSaidas = 0;
    itens.forEach((item, i) => {
      const valor = parseFloat(item.valor) || 0;
      totalSaidas += valor;
      const valorStr = `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const cells = [String(i + 1), item.data || '', (item.descricao || '').substring(0, 50), item.documento || '', '', valorStr];
      const bg = i % 2 === 0 ? branco : cinza;
      cx = margin;
      drawRect(planPage, margin, y - rowH, tableW, rowH, bg, true);
      cols.forEach((col, ci) => {
        const txt = cells[ci];
        const tw = font.widthOfTextAtSize(txt, 8);
        const tx = col.align === 'right' ? cx + col.w - 2 - tw : cx + 2;
        drawText(planPage, txt, tx, y - rowH + 3, 8, ci === 5 ? vermelho : preto, ci === 5 ? fontBold : font);
        cx += col.w;
      });
      y -= rowH;
      if (y < margin + 80 && i < itens.length - 1) { y = pageH - margin; }
    });

    // Total e rodapé
    const totalStr = `R$ ${totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    drawRect(planPage, margin, y - rowH, tableW, rowH, rgb(1, 1, 0.5), true);
    cx = margin;
    cols.forEach((col, ci) => {
      if (ci === 5) { const tw = fontBold.widthOfTextAtSize(totalStr, 8); drawText(planPage, totalStr, cx + col.w - 2 - tw, y - rowH + 3, 8, vermelho, fontBold); }
      cx += col.w;
    });
    y -= rowH + 4;

    const saldoAtu = parseFloat(cabecalho.saldoAtual) || (saldoAnt - totalSaidas);
    const rodape = [
      ['TOTAIS DO MOVIMENTO', '', 'ENTRADAS', 'SAÍDAS'],
      ['', '', 'R$ 0,00', totalStr],
      ['SALDO ANTERIOR', '', `R$ ${saldoAnt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, ''],
      ['SALDO ATUAL', '', `R$ ${saldoAtu.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, ''],
      ['TOTAL PARA CONFERÊNCIA', '', '', totalStr],
    ];
    rodape.forEach(row => {
      drawRect(planPage, margin, y - rowH, tableW, rowH, cinza, true);
      drawText(planPage, row[0], margin + 2, y - rowH + 3, 8, preto, fontBold);
      if (row[2]) { const tw = font.widthOfTextAtSize(row[2], 8); drawText(planPage, row[2], margin + 30 + 55 + 210 + 80 - 2 - tw, y - rowH + 3, 8, preto, font); }
      if (row[3]) { const tw = fontBold.widthOfTextAtSize(row[3], 8); drawText(planPage, row[3], margin + tableW - 2 - tw, y - rowH + 3, 8, vermelho, fontBold); }
      y -= rowH;
    });

    // ===== PÁGINAS DE COMPROVANTES (em ordem, agrupando imagens 4 por página) =====
    const drawCabecalhoComprovante = (page, titulo) => {
      let cy = pageH - margin;
      drawRect(page, margin, cy - 18, pageW - 2 * margin, 18, verde);
      drawText(page, `${cabecalho.numeroCaixa} CAIXA FUNDO FIXO – ${(cabecalho.nomeResponsavel || '').toUpperCase()} – COMPROVANTES`, margin + 4, cy - 13, 9, branco, fontBold);
      cy -= 18;
      drawRect(page, margin, cy - 14, pageW - 2 * margin, 14, verde);
      drawText(page, titulo, margin + 4, cy - 10, 8, branco, font);
      cy -= 14;
      drawRect(page, margin, cy - 14, pageW - 2 * margin, 14, cinza);
      drawText(page, cabecalho.empresa || '', margin + 4, cy - 10, 8, preto, fontBold);
      cy -= 18;
      return cy;
    };

    const compW = (pageW - 2 * margin - 10) / 2;
    const headerH = 46;
    const compH = (pageH - 2 * margin - headerH - 10) / 2;

    // Processar TODOS os itens em ordem, 4 por página (PDFs e imagens misturados)
    for (let pi = 0; pi < itens.length; pi += 4) {
      const grupo = itens.slice(pi, pi + 4);
      const compPage = pdfDoc.addPage([pageW, pageH]);
      const cy = drawCabecalhoComprovante(compPage, `PRESTAÇÃO DE CONTAS REF A: ${cabecalho.dataFormatada} – Pág. ${Math.floor(pi / 4) + 1}`);

      for (let gi = 0; gi < grupo.length; gi++) {
        const item = grupo[gi];
        const col = gi % 2;
        const row = Math.floor(gi / 2);
        const bx = margin + col * (compW + 10);
        const by = cy - row * (compH + 8) - compH;

        compPage.drawRectangle({ x: bx, y: by, width: compW, height: compH, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });

        const cellHeaderH = 22;
        drawRect(compPage, bx, by + compH - cellHeaderH, compW, cellHeaderH, verde);
        const valorStr = `R$ ${(parseFloat(item.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        drawText(compPage, `#${item.idx + 1}  ${(item.descricao || '').substring(0, 35)}`, bx + 3, by + compH - cellHeaderH + 12, 7, branco, fontBold);
        drawText(compPage, `${item.data || ''}  Doc: ${item.documento || ''}  ${valorStr}`, bx + 3, by + compH - cellHeaderH + 3, 7, branco, font);

        const imgAreaH = compH - cellHeaderH;
        const url = item.comprovante_url;

        if (!url) {
          drawText(compPage, 'Sem comprovante', bx + compW / 2 - 35, by + imgAreaH / 2, 8, rgb(0.6, 0.6, 0.6), font);
          continue;
        }

        const isPDF = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/pdf');

        if (isPDF) {
          try {
            const resp = await fetch(url);
            const buf = await resp.arrayBuffer();
            const subDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
            const [srcPage] = await pdfDoc.embedPdf(subDoc, [0]);
            const pSize = srcPage.size();
            const scale = Math.min((compW - 4) / pSize.width, (imgAreaH - 4) / pSize.height);
            const dw = pSize.width * scale;
            const dh = pSize.height * scale;
            compPage.drawPage(srcPage, {
              x: bx + (compW - dw) / 2,
              y: by + (imgAreaH - dh) / 2,
              width: dw,
              height: dh
            });
          } catch (e) {
            drawText(compPage, 'Erro ao carregar PDF', bx + 3, by + imgAreaH / 2, 7, rgb(0.7, 0, 0), font);
          }
        } else {
          try {
            const resp = await fetch(url);
            const contentType = resp.headers.get('content-type') || '';
            const buf = await resp.arrayBuffer();
            let image;
            if (contentType.includes('png') || url.toLowerCase().endsWith('.png')) {
              image = await pdfDoc.embedPng(buf);
            } else {
              image = await pdfDoc.embedJpg(buf);
            }
            const dims = image.scaleToFit(compW - 4, imgAreaH - 4);
            compPage.drawImage(image, {
              x: bx + (compW - dims.width) / 2,
              y: by + (imgAreaH - dims.height) / 2,
              width: dims.width,
              height: dims.height
            });
          } catch (e) {
            drawText(compPage, `Erro ao carregar imagem`, bx + 3, by + imgAreaH / 2, 7, rgb(0.7, 0, 0), font);
          }
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    const uint8 = new Uint8Array(pdfBytes);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    return Response.json({ base64 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});