import { describe, it, expect } from "vitest";
import {
  dataDoCSV,
  dataDoOFX,
  decodificarArquivoExtrato,
  lerCSVExtrato,
  lerExtrato,
  lerOFX,
  resumoDaImportacao,
  valorMonetario,
} from "./extrato-importado";

describe("valorMonetario", () => {
  it("ponto decimal (OFX) com e sem sinal", () => {
    expect(valorMonetario("-123.45")).toBe(-123.45);
    expect(valorMonetario("123.45")).toBe(123.45);
    expect(valorMonetario("+10.00")).toBe(10);
    expect(valorMonetario("-.50")).toBe(-0.5);
  });

  it("vírgula decimal brasileira com milhar", () => {
    expect(valorMonetario("1.234,56")).toBe(1234.56);
    expect(valorMonetario("-1.234,56")).toBe(-1234.56);
    expect(valorMonetario("1.234.567,89")).toBe(1234567.89);
    expect(valorMonetario("R$ 1.234,56")).toBe(1234.56);
    expect(valorMonetario("-R$ 50,00")).toBe(-50);
    expect(valorMonetario("50,5")).toBe(50.5);
  });

  it("formato americano com milhar", () => {
    expect(valorMonetario("1,234.56")).toBe(1234.56);
    expect(valorMonetario("1,234,567")).toBe(1234567);
  });

  it("negativos contábeis e sufixo D/C", () => {
    expect(valorMonetario("(1.234,56)")).toBe(-1234.56);
    expect(valorMonetario("1.234,56-")).toBe(-1234.56);
    expect(valorMonetario("150,00 D")).toBe(-150);
    expect(valorMonetario("150,00 C")).toBe(150);
    expect(valorMonetario("150,00D")).toBe(-150);
  });

  it("arredonda a 2 casas a partir da string, sem erro de ponto flutuante", () => {
    // parseFloat("1.005") * 100 = 100.49999… → 1.00 no arredondamento ingênuo
    expect(valorMonetario("1.005")).toBe(1.01);
    expect(valorMonetario("0,125")).toBe(0.13);
    expect(valorMonetario("-0,125")).toBe(-0.13);
    expect(valorMonetario("1.234,564")).toBe(1234.56);
    expect(valorMonetario("1.234,565")).toBe(1234.57);
    expect(valorMonetario("0.1")).toBe(0.1);
    // soma em centavos fecha exato
    expect(JSON.stringify({ v: valorMonetario("1.234,57") })).toBe('{"v":1234.57}');
  });

  it("zero vira 0 (sem -0)", () => {
    expect(Object.is(valorMonetario("-0,00"), 0)).toBe(true);
    expect(valorMonetario("0")).toBe(0);
  });

  it("lixo vira null", () => {
    expect(valorMonetario("")).toBeNull();
    expect(valorMonetario(null)).toBeNull();
    expect(valorMonetario("abc")).toBeNull();
    expect(valorMonetario("12a")).toBeNull();
    expect(valorMonetario("1.23,45")).toBeNull(); // milhar mal agrupado
    expect(valorMonetario("-")).toBeNull();
    expect(valorMonetario("D")).toBeNull();
  });
});

describe("dataDoOFX", () => {
  it("lê AAAAMMDD com hora e fuso, sem converter o dia", () => {
    expect(dataDoOFX("20260929")).toBe("2026-09-29");
    expect(dataDoOFX("20260929120000")).toBe("2026-09-29");
    expect(dataDoOFX("20260929120000[-3:BRT]")).toBe("2026-09-29");
    expect(dataDoOFX("20260929000000.000[-3:BRT]")).toBe("2026-09-29");
    expect(dataDoOFX("20260929000000[0:GMT]")).toBe("2026-09-29");
    expect(dataDoOFX(" 20261001100000[-03:EST] ")).toBe("2026-10-01");
  });

  it("data impossível ou ausente → null", () => {
    expect(dataDoOFX("20260231")).toBeNull();
    expect(dataDoOFX("20261301")).toBeNull();
    expect(dataDoOFX("")).toBeNull();
    expect(dataDoOFX(undefined)).toBeNull();
    expect(dataDoOFX("2026-09-29")).toBeNull();
  });
});

describe("dataDoCSV", () => {
  it("DD/MM/AAAA e variações brasileiras", () => {
    expect(dataDoCSV("29/09/2026")).toBe("2026-09-29");
    expect(dataDoCSV("1/9/2026")).toBe("2026-09-01");
    expect(dataDoCSV("29/09/26")).toBe("2026-09-29");
    expect(dataDoCSV("29-09-2026")).toBe("2026-09-29");
    expect(dataDoCSV("29.09.2026")).toBe("2026-09-29");
    expect(dataDoCSV("29/09/2026 14:30")).toBe("2026-09-29");
  });

  it("ISO", () => {
    expect(dataDoCSV("2026-09-29")).toBe("2026-09-29");
    expect(dataDoCSV("2026/09/29")).toBe("2026-09-29");
    expect(dataDoCSV("2026-09-29T10:00:00")).toBe("2026-09-29");
  });

  it("inválida → null", () => {
    expect(dataDoCSV("31/02/2026")).toBeNull();
    expect(dataDoCSV("Data")).toBeNull();
    expect(dataDoCSV("")).toBeNull();
  });
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKTRANLIST>
<DTSTART>20260901000000[-3:BRT]
<DTEND>20260930000000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260929120000[-3:BRT]
<TRNAMT>-123.45
<FITID>2026092901
<CHECKNUM>000123
<MEMO>PAGAMENTO BOLETO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260930
<TRNAMT>1500.00
<FITID>2026093001
<NAME>CLIENTE FULANO
<MEMO>PIX RECEBIDO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260930
<TRNAMT>45.90
<FITID>2026093002
<REFNUM>REF-9
<MEMO>TARIFA PACOTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>
<TRNAMT>-10.00
<FITID>2026093003
<MEMO>SEM DATA
</STMTTRN>
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20260930
<TRNAMT>0.00
<FITID>2026093004
<MEMO>VALOR ZERO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>1000.00
<DTASOF>20260930
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe("lerOFX — 1.x SGML (sem tags de fechamento)", () => {
  it("lê as linhas no formato de p_linhas (0156), com sinal", () => {
    const { linhas, descartadas } = lerOFX(OFX_SGML);
    expect(linhas).toEqual([
      {
        data: "2026-09-29",
        valor: -123.45,
        descricao: "PAGAMENTO BOLETO",
        fitid: "2026092901",
        documento: "000123",
      },
      {
        data: "2026-09-30",
        valor: 1500,
        descricao: "PIX RECEBIDO - CLIENTE FULANO",
        fitid: "2026093001",
        documento: null,
      },
      {
        // TRNAMT sem sinal + TRNTYPE DEBIT → negativo
        data: "2026-09-30",
        valor: -45.9,
        descricao: "TARIFA PACOTE",
        fitid: "2026093002",
        documento: "REF-9",
      },
    ]);
    // sem data + valor zero
    expect(descartadas).toBe(2);
  });

  it("arquivo inteiro numa linha só", () => {
    const umaLinha =
      "<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929<TRNAMT>-5.00<FITID>A1<MEMO>CAFE</STMTTRN>" +
      "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260929<TRNAMT>7,50<FITID>A2<MEMO>ESTORNO</STMTTRN></BANKTRANLIST></OFX>";
    const { linhas, descartadas } = lerOFX(umaLinha);
    expect(descartadas).toBe(0);
    expect(linhas.map((l) => [l.fitid, l.valor, l.descricao])).toEqual([
      ["A1", -5, "CAFE"],
      ["A2", 7.5, "ESTORNO"],
    ]);
  });

  it("sinal explícito do TRNAMT vale mais que o TRNTYPE", () => {
    const ofx =
      "<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260929<TRNAMT>-20.00<FITID>X</STMTTRN>" +
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929<TRNAMT>+20.00<FITID>Y</STMTTRN>" +
      "<STMTTRN><TRNTYPE>XFER<DTPOSTED>20260929<TRNAMT>20.00<FITID>Z</STMTTRN></OFX>";
    expect(lerOFX(ofx).linhas.map((l) => l.valor)).toEqual([-20, 20, 20]);
  });

  it("tipos de saída (PAYMENT, FEE, ATM...) sem sinal viram negativos", () => {
    const tipos = ["PAYMENT", "FEE", "SRVCHG", "ATM", "POS", "CHECK", "DIRECTDEBIT", "CASH"];
    const ofx = tipos
      .map((t, i) => `<STMTTRN><TRNTYPE>${t}<DTPOSTED>20260929<TRNAMT>10.00<FITID>${i}</STMTTRN>`)
      .join("\n");
    expect(lerOFX(ofx).linhas.every((l) => l.valor === -10)).toBe(true);
  });

  it("usa DTUSER quando não há DTPOSTED", () => {
    const ofx = "<STMTTRN><TRNTYPE>DEBIT<DTUSER>20260915<TRNAMT>-1.00<FITID>U</STMTTRN>";
    expect(lerOFX(ofx).linhas[0].data).toBe("2026-09-15");
  });

  it("FITID repetido no mesmo arquivo não some na deduplicação", () => {
    const ofx =
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929<TRNAMT>-10.00<FITID>DUP<MEMO>A</STMTTRN>" +
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929<TRNAMT>-25.00<FITID>DUP<MEMO>B</STMTTRN>" +
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929<TRNAMT>-10.00<FITID>DUP<MEMO>C</STMTTRN>" +
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929<TRNAMT>-1.00<FITID>UNICO</STMTTRN>";
    const fitids = lerOFX(ofx).linhas.map((l) => l.fitid);
    expect(fitids).toEqual([
      "DUP|2026-09-29|-10|1",
      "DUP|2026-09-29|-25|1",
      "DUP|2026-09-29|-10|2",
      "UNICO",
    ]);
    // e é estável: o mesmo arquivo gera as mesmas chaves (reimportar não duplica)
    expect(lerOFX(ofx).linhas.map((l) => l.fitid)).toEqual(fitids);
  });

  it("sem FITID/MEMO: campos null", () => {
    const ofx = "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929<TRNAMT>-3.00</STMTTRN>";
    expect(lerOFX(ofx).linhas[0]).toEqual({
      data: "2026-09-29",
      valor: -3,
      descricao: null,
      fitid: null,
      documento: null,
    });
  });
});

describe("lerOFX — 2.x XML", () => {
  const OFX_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260929120000.000[-3:BRT]</DTPOSTED>
            <TRNAMT>-1234.56</TRNAMT>
            <FITID>XML-1</FITID>
            <CHECKNUM>778</CHECKNUM>
            <NAME>Energia &amp; Luz S/A</NAME>
            <MEMO>Conta de energia elétrica</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20261001</DTPOSTED>
            <TRNAMT>99.9</TRNAMT>
            <FITID>XML-2</FITID>
            <MEMO>Rendimento</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

  it("lê tags com fechamento e decodifica entidades", () => {
    const { linhas, descartadas } = lerOFX(OFX_XML);
    expect(descartadas).toBe(0);
    expect(linhas).toEqual([
      {
        data: "2026-09-29",
        valor: -1234.56,
        descricao: "Conta de energia elétrica - Energia & Luz S/A",
        fitid: "XML-1",
        documento: "778",
      },
      {
        data: "2026-10-01",
        valor: 99.9,
        descricao: "Rendimento",
        fitid: "XML-2",
        documento: null,
      },
    ]);
  });
});

describe("lerCSVExtrato — Data; Descrição; Valor [; Tipo]", () => {
  it("ponto-e-vírgula com vírgula decimal e cabeçalho", () => {
    const csv = [
      "Data;Descrição;Valor",
      "29/09/2026;PIX ENVIADO;-1.234,56",
      "30/09/2026;PIX RECEBIDO;2.000,00",
      "",
    ].join("\r\n");
    expect(lerCSVExtrato(csv)).toEqual({
      linhas: [
        {
          data: "2026-09-29",
          valor: -1234.56,
          descricao: "PIX ENVIADO",
          fitid: null,
          documento: null,
        },
        {
          data: "2026-09-30",
          valor: 2000,
          descricao: "PIX RECEBIDO",
          fitid: null,
          documento: null,
        },
      ],
      descartadas: 0,
    });
  });

  it("coluna Tipo manda no sinal (C/D, crédito/débito, entrada/saída)", () => {
    const csv = [
      "data;descricao;valor;tipo",
      "01/10/2026;Tarifa;12,90;D",
      "01/10/2026;Depósito;100,00;Crédito",
      "01/10/2026;Saque;50,00;Débito",
      "01/10/2026;Transferência;-30,00;Saída",
      "01/10/2026;Estorno;-5,00;C",
      "01/10/2026;Outro;-7,00;PIX",
    ].join("\n");
    expect(lerCSVExtrato(csv).linhas.map((l) => l.valor)).toEqual([-12.9, 100, -50, -30, 5, -7]);
  });

  it("vírgula como separador com valores entre aspas", () => {
    const csv = 'Data,Descricao,Valor\n"29/09/2026","Cimento, cal e areia","-1.234,56"\n';
    const { linhas } = lerCSVExtrato(csv);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].descricao).toBe("Cimento, cal e areia");
    expect(linhas[0].valor).toBe(-1234.56);
  });

  it("sem cabeçalho, datas ISO e ponto decimal", () => {
    const csv = "2026-09-29,Pagamento,-10.50\n2026-09-30,Recebimento,20.00";
    expect(lerCSVExtrato(csv).linhas.map((l) => [l.data, l.valor])).toEqual([
      ["2026-09-29", -10.5],
      ["2026-09-30", 20],
    ]);
  });

  it("conta as linhas inválidas (data, valor, zero, colunas faltando)", () => {
    const csv = [
      "Data;Descrição;Valor",
      "29/09/2026;OK;-10,00",
      "31/02/2026;Data impossível;-10,00",
      "29/09/2026;Valor lixo;abc",
      "29/09/2026;Zero;0,00",
      "29/09/2026;Só duas colunas",
      ";;",
      "30/09/2026;OK 2;5,00",
    ].join("\n");
    const { linhas, descartadas } = lerCSVExtrato(csv);
    expect(linhas.map((l) => l.descricao)).toEqual(["OK", "OK 2"]);
    expect(descartadas).toBe(4); // a linha só com separadores é vazia, não conta
  });

  it("BOM do Excel e descrição vazia viram null", () => {
    const csv = "﻿Data;Descrição;Valor\n29/09/2026;;-1,00";
    expect(lerCSVExtrato(csv).linhas[0]).toEqual({
      data: "2026-09-29",
      valor: -1,
      descricao: null,
      fitid: null,
      documento: null,
    });
  });
});

describe("lerExtrato", () => {
  it("escolhe o formato pela extensão ou pelo conteúdo", () => {
    expect(lerExtrato(OFX_SGML, "extrato.OFX").formato).toBe("ofx");
    expect(lerExtrato(OFX_SGML, "extrato.txt").formato).toBe("ofx");
    expect(lerExtrato("29/09/2026;X;-1,00", "extrato.CSV").formato).toBe("csv");
    expect(lerExtrato("qualquer coisa", "extrato.pdf")).toEqual({
      formato: null,
      linhas: [],
      descartadas: 0,
    });
  });
});

describe("decodificarArquivoExtrato", () => {
  it("UTF-8 (com BOM) e Windows-1252", () => {
    const utf8 = new TextEncoder().encode("﻿CONCESSIONÁRIA");
    expect(decodificarArquivoExtrato(utf8)).toBe("CONCESSIONÁRIA");
    // "Á" em 1252 é o byte 0xC1 sozinho — UTF-8 inválido
    const cp1252 = new Uint8Array([0x43, 0x4f, 0x4e, 0xc1, 0x47, 0x55, 0x41]);
    expect(decodificarArquivoExtrato(cp1252.buffer)).toBe("CONÁGUA");
  });
});

describe("resumoDaImportacao", () => {
  it("importadas × já existentes × descartadas", () => {
    expect(resumoDaImportacao({ total: 3, importadas: 3, duplicadas: 0, invalidas: 0 })).toBe(
      "Extrato importado: 3 linhas novas importadas."
    );
    expect(resumoDaImportacao({ importadas: 1, duplicadas: 1, invalidas: 0 })).toBe(
      "Extrato importado: 1 linha nova importada; 1 linha já existia e não foi duplicada."
    );
    expect(resumoDaImportacao({ importadas: 0, duplicadas: 12, invalidas: 1 }, 2)).toBe(
      "Extrato importado: 0 linhas novas importadas; 12 linhas já existiam e não foram duplicadas; 3 linhas descartadas (data ou valor inválido)."
    );
  });
});
