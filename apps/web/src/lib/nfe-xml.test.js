import { describe, it, expect } from "vitest";
import { lerXmlFiscal, textoDoXml } from "./nfe-xml";

// Amostras no leiaute oficial de cada documento, anonimizadas (CNPJ/CPF de exemplo, nomes fictícios).

const NFE_40_COM_DUPLICATAS = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe35260911222333000181550010000012341123456787" versao="4.00">
      <ide>
        <cUF>35</cUF><cNF>12345678</cNF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod>
        <serie>1</serie><nNF>1234</nNF><dhEmi>2026-09-10T10:15:00-03:00</dhEmi>
        <tpNF>1</tpNF><tpAmb>1</tpAmb>
      </ide>
      <emit>
        <CNPJ>11222333000181</CNPJ>
        <xNome>ELETRICA M&amp;M LTDA</xNome>
        <xFant>M&amp;M</xFant>
        <enderEmit>
          <xLgr>RUA DAS FLORES</xLgr><nro>100</nro><xBairro>CENTRO</xBairro>
          <cMun>3550308</cMun><xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP>
        </enderEmit>
        <IE>123456789110</IE><CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>11444777000161</CNPJ>
        <xNome>CONSTRUTORA EXEMPLO LTDA</xNome>
        <indIEDest>1</indIEDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>CAB-25</cProd><cEAN>7891234567895</cEAN><xProd>CABO FLEXIVEL 2,5MM</xProd>
          <NCM>85444900</NCM><CFOP>5102</CFOP><uCom>RL</uCom><qCom>2.0000</qCom>
          <vUnCom>150.0000000000</vUnCom><vProd>300.00</vProd>
        </prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vICMS>54.00</vICMS></ICMS00></ICMS></imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>DIS-20</cProd><cEAN>SEM GTIN</cEAN><xProd>DISJUNTOR 20A</xProd>
          <NCM>85362000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom>
          <vUnCom>0.0100000000</vUnCom><vProd>0.10</vProd>
        </prod>
      </det>
      <total><ICMSTot><vBC>300.10</vBC><vICMS>54.00</vICMS><vProd>300.10</vProd><vNF>300.10</vNF></ICMSTot></total>
      <cobr>
        <fat><nFat>1234</nFat><vOrig>300.10</vOrig><vDesc>0.00</vDesc><vLiq>300.10</vLiq></fat>
        <dup><nDup>002</nDup><dVenc>2026-11-10</dVenc><vDup>100.00</vDup></dup>
        <dup><nDup>001</nDup><dVenc>2026-10-10</dVenc><vDup>100.10</vDup></dup>
        <dup><nDup>003</nDup><dVenc>2026-12-10</dVenc><vDup>100.00</vDup></dup>
      </cobr>
      <pag>
        <detPag><tPag>90</tPag><vPag>0.00</vPag></detPag>
        <detPag><indPag>1</indPag><tPag>15</tPag><vPag>300.10</vPag></detPag>
      </pag>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb><chNFe>35260911222333000181550010000012341123456787</chNFe>
      <nProt>135260000000001</nProt><cStat>100</cStat>
    </infProt>
  </protNFe>
</nfeProc>`;

// NF-e só com o <NFe> (sem nfeProc/protNFe), com PREFIXO de namespace e destinatário CPF
const NFE_SEM_PROTOCOLO = `<ns0:NFe xmlns:ns0="http://www.portalfiscal.inf.br/nfe">
  <ns0:infNFe versao="4.00" Id="NFe31260911444777000161550010000000771876543213">
    <ns0:ide><ns0:mod>55</ns0:mod><ns0:nNF>77</ns0:nNF><ns0:dhEmi>2026-09-01T08:00:00-03:00</ns0:dhEmi><ns0:tpAmb>2</ns0:tpAmb></ns0:ide>
    <ns0:emit><ns0:CNPJ>11444777000161</ns0:CNPJ><ns0:xNome>FERRAGENS &#xC1;GUIA LTDA</ns0:xNome><ns0:IE>ISENTO</ns0:IE></ns0:emit>
    <ns0:dest><ns0:CPF>12345678909</ns0:CPF><ns0:xNome>Jos&#233; da Silva</ns0:xNome></ns0:dest>
    <ns0:total><ns0:ICMSTot><ns0:vNF>89.90</ns0:vNF></ns0:ICMSTot></ns0:total>
    <ns0:cobr><ns0:dup><ns0:nDup>001</ns0:nDup><ns0:dVenc>2026-10-01</ns0:dVenc><ns0:vDup>50.00</ns0:vDup></ns0:dup></ns0:cobr>
    <ns0:pag><ns0:detPag><ns0:tPag>17</ns0:tPag><ns0:vPag>89.90</ns0:vPag></ns0:detPag></ns0:pag>
  </ns0:infNFe>
</ns0:NFe>`;

// NF-e 2.0: data em <dEmi>, sem <pag>, <cEAN/> vazio, com comentário
const NFE_20 = `<?xml version="1.0" encoding="UTF-8"?>
<!-- exportado pelo emissor antigo -->
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00">
  <NFe><infNFe Id="NFe31120511222333000181550010000004561000004564" versao="2.00">
    <ide><mod>55</mod><nNF>456</nNF><dEmi>2012-05-10</dEmi><indPag>0</indPag></ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>DISTRIBUIDORA ANTIGA LTDA</xNome></emit>
    <det nItem="1"><prod><cProd>1</cProd><cEAN/><xProd>LAMPADA 100W</xProd><uCom>PC</uCom><qCom>5</qCom><vUnCom>10</vUnCom><vProd>50.00</vProd></prod></det>
    <total><ICMSTot><vNF>50.00</vNF></ICMSTot></total>
  </infNFe></NFe>
  <protNFe versao="2.00"><infProt><chNFe>31120511222333000181550010000004561000004564</chNFe></infProt></protNFe>
</nfeProc>`;

// NFC-e (modelo 65), pago no cartão, sem destinatário
const NFCE = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe31260911222333000181650010000098761111122229" versao="4.00">
    <ide><mod>65</mod><nNF>9876</nNF><dhEmi>2026-09-15T18:40:00-03:00</dhEmi></ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>POSTO EXEMPLO LTDA</xNome></emit>
    <det nItem="1"><prod><cProd>GAS</cProd><cEAN>SEM GTIN</cEAN><xProd>GASOLINA COMUM</xProd><NCM>27101259</NCM><uCom>L</uCom><qCom>40.0000</qCom><vUnCom>6.2900000000</vUnCom><vProd>251.60</vProd></prod></det>
    <total><ICMSTot><vNF>251.60</vNF></ICMSTot></total>
    <pag><detPag><tPag>03</tPag><vPag>251.60</vPag><card><tpIntegra>2</tpIntegra></card></detPag></pag>
  </infNFe>
  <infNFeSupl><qrCode><![CDATA[https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=3126]]></qrCode></infNFeSupl>
  </NFe>
  <protNFe versao="4.00"><infProt><chNFe>31260911222333000181650010000098761111122229</chNFe></infProt></protNFe>
</nfeProc>`;

// NFS-e ABRASF 1.0: Endereco dentro de Endereco e <Numero> também no RPS
const NFSE_ABRASF_1 = `<?xml version="1.0" encoding="utf-8"?>
<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Nfse versao="1.00">
    <InfNfse Id="nfse2026123">
      <Numero>2026000000123</Numero>
      <CodigoVerificacao>AB12CD34</CodigoVerificacao>
      <DataEmissao>2026-09-12T14:30:00</DataEmissao>
      <IdentificacaoRps><Numero>45</Numero><Serie>A</Serie><Tipo>1</Tipo></IdentificacaoRps>
      <Servico>
        <Valores><ValorServicos>1500.00</ValorServicos><ValorIss>75.00</ValorIss><ValorLiquidoNfse>1425.00</ValorLiquidoNfse></Valores>
        <ItemListaServico>7.02</ItemListaServico>
        <Discriminacao>Manuten&#231;&#227;o de ilumina&#231;&#227;o p&#250;blica - setembro/2026</Discriminacao>
      </Servico>
      <PrestadorServico>
        <IdentificacaoPrestador><Cnpj>11.222.333/0001-81</Cnpj><InscricaoMunicipal>12345</InscricaoMunicipal></IdentificacaoPrestador>
        <RazaoSocial>SERVICOS ELETRICOS EXEMPLO LTDA</RazaoSocial>
        <Endereco><Endereco>AV BRASIL</Endereco><Numero>500</Numero><Complemento>SALA 2</Complemento><Bairro>CENTRO</Bairro><CodigoMunicipio>3104007</CodigoMunicipio><Uf>MG</Uf><Cep>38183000</Cep></Endereco>
      </PrestadorServico>
      <TomadorServico>
        <IdentificacaoTomador><CpfCnpj><Cnpj>11444777000161</Cnpj></CpfCnpj></IdentificacaoTomador>
        <RazaoSocial>MUNICIPIO DE EXEMPLO</RazaoSocial>
      </TomadorServico>
    </InfNfse>
  </Nfse>
</CompNfse>`;

// NFS-e ABRASF 2.x: CNPJ do prestador só em DeclaracaoPrestacaoServico/Prestador; nota cancelada
const NFSE_ABRASF_2 = `<ConsultarNfseResposta xmlns="http://www.abrasf.org.br/nfse.xsd"><ListaNfse><CompNfse>
  <Nfse versao="2.02"><InfNfse Id="N55">
    <Numero>55</Numero><DataEmissao>2026-08-30T09:00:00</DataEmissao>
    <PrestadorServico><RazaoSocial>CONSULTORIA MODELO LTDA</RazaoSocial></PrestadorServico>
    <DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico>
      <Servico><Valores><ValorServicos>800.5</ValorServicos></Valores><Discriminacao>Projeto</Discriminacao></Servico>
      <Prestador><CpfCnpj><Cnpj>11222333000181</Cnpj></CpfCnpj></Prestador>
      <Tomador><IdentificacaoTomador><CpfCnpj><Cpf>12345678909</Cpf></CpfCnpj></IdentificacaoTomador><RazaoSocial>JOSE DA SILVA</RazaoSocial></Tomador>
    </InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico>
  </InfNfse></Nfse>
  <NfseCancelamento><Confirmacao><DataHora>2026-08-31T10:00:00</DataHora></Confirmacao></NfseCancelamento>
</CompNfse></ListaNfse></ConsultarNfseResposta>`;

// NFS-e do padrão nacional (Emissor Nacional / SPED)
const NFSE_NACIONAL = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS31040072211222333000181000000000001226090000000000">
    <xLocEmi>Araxá</xLocEmi><nNFSe>12</nNFSe><dhProc>2026-09-20T11:00:00-03:00</dhProc>
    <emit><CNPJ>11222333000181</CNPJ><xNome>ENGENHARIA EXEMPLO LTDA</xNome>
      <enderNac><xLgr>RUA A</xLgr><nro>10</nro><xBairro>CENTRO</xBairro><cMun>3104007</cMun><UF>MG</UF><CEP>38183000</CEP></enderNac>
    </emit>
    <valores><vLiq>1900.00</vLiq></valores>
    <DPS versao="1.00"><infDPS Id="DPS1">
      <dhEmi>2026-09-19T16:00:00-03:00</dhEmi>
      <toma><CNPJ>11444777000161</CNPJ><xNome>CLIENTE NACIONAL LTDA</xNome></toma>
      <serv><cServ><cTribNac>070201</cTribNac><xDescServ>Laudo técnico</xDescServ></cServ></serv>
      <valores><vServPrest><vServ>2000.00</vServ></vServPrest></valores>
    </infDPS></DPS>
  </infNFSe>
</NFSe>`;

describe("lerXmlFiscal — NF-e 4.0 completa", () => {
  const doc = lerXmlFiscal(NFE_40_COM_DUPLICATAS);

  it("cabeçalho, emitente (com entidade decodificada), destinatário e total", () => {
    expect(doc).toMatchObject({
      origem: "xml",
      tipo: "nfe",
      numero: "1234",
      chave: "35260911222333000181550010000012341123456787",
      data_emissao: "2026-09-10",
      valor_total: 300.1,
      emitente: {
        nome: "ELETRICA M&M LTDA",
        documento: "11222333000181",
        ie: "123456789110",
        endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
      },
      destinatario: { nome: "CONSTRUTORA EXEMPLO LTDA", documento: "11444777000161" },
      descricao: "VENDA DE MERCADORIA",
      avisos: [],
      duvidosos: [],
    });
  });

  it("duplicatas viram vencimentos em ordem de data", () => {
    expect(doc.vencimentos).toEqual([
      { numero: "001", data: "2026-10-10", valor: 100.1 },
      { numero: "002", data: "2026-11-10", valor: 100 },
      { numero: "003", data: "2026-12-10", valor: 100 },
    ]);
  });

  it("forma de pagamento pelo detPag de maior valor (15 = boleto; 90 é ignorado)", () => {
    expect(doc.forma_pagamento).toBe("boleto");
  });

  it("itens det/prod com EAN (SEM GTIN vira null) e NCM", () => {
    expect(doc.itens).toEqual([
      {
        descricao: "CABO FLEXIVEL 2,5MM",
        codigo: "CAB-25",
        ean: "7891234567895",
        ncm: "85444900",
        unidade: "RL",
        quantidade: 2,
        valor_unitario: 150,
        valor_total: 300,
      },
      {
        descricao: "DISJUNTOR 20A",
        codigo: "DIS-20",
        ean: null,
        ncm: "85362000",
        unidade: "UN",
        quantidade: 10,
        valor_unitario: 0.01,
        valor_total: 0.1,
      },
    ]);
  });
});

describe("lerXmlFiscal — outras NF-e", () => {
  it("sem protNFe e com prefixo de namespace: chave pelo Id, avisos de protocolo, homologação e duplicatas", () => {
    const doc = lerXmlFiscal(NFE_SEM_PROTOCOLO);
    expect(doc).toMatchObject({
      tipo: "nfe",
      numero: "77",
      chave: "31260911444777000161550010000000771876543213",
      data_emissao: "2026-09-01",
      valor_total: 89.9,
      emitente: {
        nome: "FERRAGENS ÁGUIA LTDA",
        documento: "11444777000161",
        ie: "ISENTO",
        endereco: null,
      },
      destinatario: { nome: "José da Silva", documento: "12345678909" },
      vencimentos: [{ numero: "001", data: "2026-10-01", valor: 50 }],
      forma_pagamento: "pix",
      itens: [],
    });
    expect(doc.avisos).toEqual([
      "XML sem o protocolo de autorização da SEFAZ: confira se a nota foi autorizada.",
      "Nota emitida em ambiente de homologação (sem valor fiscal).",
      "A soma das duplicatas (R$ 50,00) é diferente do total da nota (R$ 89,90).",
    ]);
  });

  it("NF-e 2.0 com dEmi, sem pag e com cEAN vazio", () => {
    const doc = lerXmlFiscal(NFE_20);
    expect(doc).toMatchObject({
      tipo: "nfe",
      numero: "456",
      chave: "31120511222333000181550010000004561000004564",
      data_emissao: "2012-05-10",
      valor_total: 50,
      emitente: { nome: "DISTRIBUIDORA ANTIGA LTDA", documento: "11222333000181", ie: null },
      destinatario: { nome: null, documento: null },
      vencimentos: [],
      forma_pagamento: null,
      avisos: [],
    });
    expect(doc.itens).toEqual([
      {
        descricao: "LAMPADA 100W",
        codigo: "1",
        ean: null,
        ncm: null,
        unidade: "PC",
        quantidade: 5,
        valor_unitario: 10,
        valor_total: 50,
      },
    ]);
  });

  it("NFC-e (modelo 65) no cartão, com CDATA no QR Code", () => {
    const doc = lerXmlFiscal(NFCE);
    expect(doc).toMatchObject({
      tipo: "nfce",
      numero: "9876",
      chave: "31260911222333000181650010000098761111122229",
      data_emissao: "2026-09-15",
      valor_total: 251.6,
      emitente: { nome: "POSTO EXEMPLO LTDA", documento: "11222333000181" },
      destinatario: { nome: null, documento: null },
      forma_pagamento: "cartao",
    });
    expect(doc.itens).toHaveLength(1);
    expect(doc.itens[0]).toMatchObject({ descricao: "GASOLINA COMUM", ean: null, quantidade: 40 });
  });
});

describe("lerXmlFiscal — NFS-e", () => {
  it("ABRASF 1.0: número da nota (não o do RPS), prestador e tomador", () => {
    const doc = lerXmlFiscal(NFSE_ABRASF_1);
    expect(doc).toEqual({
      origem: "xml",
      tipo: "nfse",
      numero: "2026000000123",
      chave: null,
      data_emissao: "2026-09-12",
      valor_total: 1500,
      emitente: {
        nome: "SERVICOS ELETRICOS EXEMPLO LTDA",
        documento: "11222333000181",
        ie: null,
        endereco: "AV BRASIL, 500 - SALA 2 - CENTRO - MG - CEP 38183-000",
      },
      destinatario: { nome: "MUNICIPIO DE EXEMPLO", documento: "11444777000161" },
      vencimentos: [],
      forma_pagamento: null,
      descricao: "Manutenção de iluminação pública - setembro/2026",
      itens: [],
      avisos: [],
      duvidosos: [],
    });
  });

  it("ABRASF 2.x: CNPJ do prestador na declaração, tomador CPF e aviso de cancelada", () => {
    const doc = lerXmlFiscal(NFSE_ABRASF_2);
    expect(doc).toMatchObject({
      tipo: "nfse",
      numero: "55",
      data_emissao: "2026-08-30",
      valor_total: 800.5,
      emitente: { nome: "CONSULTORIA MODELO LTDA", documento: "11222333000181", endereco: null },
      destinatario: { nome: "JOSE DA SILVA", documento: "12345678909" },
      descricao: "Projeto",
      avisos: ["Esta NFS-e consta como CANCELADA no XML."],
    });
  });

  it("padrão nacional: nNFSe, emitente, tomador e valor do serviço", () => {
    const doc = lerXmlFiscal(NFSE_NACIONAL);
    expect(doc).toMatchObject({
      tipo: "nfse",
      numero: "12",
      chave: null,
      data_emissao: "2026-09-19",
      valor_total: 2000,
      emitente: {
        nome: "ENGENHARIA EXEMPLO LTDA",
        documento: "11222333000181",
        endereco: "RUA A, 10 - CENTRO - MG - CEP 38183-000",
      },
      destinatario: { nome: "CLIENTE NACIONAL LTDA", documento: "11444777000161" },
      descricao: "Laudo técnico",
      avisos: [],
    });
  });
});

describe("textoDoXml", () => {
  it("respeita o encoding ISO-8859-1 do cabeçalho e lê UTF-8 sem cabeçalho", async () => {
    const codigos = (t) => [...t].map((c) => c.charCodeAt(0));
    const latin1 = Uint8Array.from([
      ...codigos('<?xml version="1.0" encoding="ISO-8859-1"?><x>S'),
      0xe3,
      ...codigos("o Paulo</x>"),
    ]);
    const arquivo = (bytes) => ({ arrayBuffer: async () => bytes.buffer });
    expect(await textoDoXml(arquivo(latin1))).toContain("<x>São Paulo</x>");
    const utf8 = new TextEncoder().encode("<x>São Paulo</x>");
    expect(await textoDoXml(arquivo(utf8))).toBe("<x>São Paulo</x>");
  });
});

describe("lerXmlFiscal — entradas inválidas", () => {
  it.each([
    ["vazio", ""],
    ["null", null],
    ["texto que não é XML", "isto não é um XML"],
    ["tag sem fechamento", "<nfeProc><NFe><infNFe></NFe></nfeProc>"],
    ["XML truncado", NFE_40_COM_DUPLICATAS.slice(0, 900)],
    ["duas raízes", "<a/><b/>"],
    [
      "XML de outro tipo (evento)",
      "<procEventoNFe><evento><infEvento><chNFe>1</chNFe></infEvento></evento></procEventoNFe>",
    ],
  ])("%s → null", (_nome, entrada) => {
    expect(lerXmlFiscal(entrada)).toBeNull();
  });
});
