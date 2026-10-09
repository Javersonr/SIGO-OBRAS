---
name: orcamento-prefeitura-sigo
description: Converte a planilha orçamentária de uma licitação de prefeitura (PDF ou Excel; SINAPI, SETOP, SICRO, CDHU, ORSE, GOINFRA etc.) para o modelo de importação do SIGO Obras, um .xlsx com as abas "Orçamento" e "Informações" e, quando o edital traz o cronograma físico-financeiro, a aba "Cronograma" com o % de cada etapa por mês. Use quando o usuário anexar a planilha orçamentária, planilha de preços, orçamento sintético ou cronograma físico-financeiro de um edital e pedir para converter, transcrever ou montar no modelo do SIGO, para importar no SIGO, ou disser "orçamento SIGO", "cronograma SIGO" ou "planilha para o SIGO". Copia fielmente etapas, itens, quantidades e preços de referência com BDI, confere com o total da prefeitura e não aplica desconto.
---

# Planilha da prefeitura → modelo de orçamento do SIGO

Você recebe a planilha orçamentária de um edital (PDF ou Excel), e o cronograma físico-financeiro quando houver, e devolve um `.xlsx` no **modelo do SIGO Obras**. O usuário importa esse arquivo no SIGO (Oportunidade → aba Orçamento → **Importar planilha**; o cronograma, na aba Planejamento → **Cronograma físico-financeiro** → **Importar**), que o lê sem IA: os nomes das abas, os cabeçalhos e os rótulos têm de ser **exatamente** os deste documento. O desconto da proposta é aplicado depois, dentro do SIGO.

**Com o conector do SIGO Obras** nesta conversa (as ferramentas `empresa_atual` e `importar_orcamento` existem), grave direto no SIGO pelas ferramentas: veja a seção **Com o conector do SIGO Obras**, no fim deste documento.

## Resultado

- Arquivo `Orcamento SIGO - <órgão>.xlsx` (ex.: `Orcamento SIGO - PM Itatinga.xlsx`), sem `\ / : * ? " < > |` no nome.
- No claude.ai e no Claude Desktop, ofereça o arquivo para baixar. No Claude Code, grave na pasta que o usuário indicar (ou ao lado do arquivo de origem) e informe o caminho.
- Uma resposta curta com a conferência (modelo no fim deste documento).

## O modelo (formato exato)

### Aba `Orçamento`

A linha 1 é o cabeçalho, com estes textos, nesta ordem (colunas A a H):

| Coluna | Cabeçalho             | Conteúdo                                                                         |
| ------ | --------------------- | -------------------------------------------------------------------------------- |
| A      | `Item`                | número hierárquico em **texto**: `1`, `1.1`, `1.1.2`                             |
| B      | `Código`              | código na fonte (ex.: `93358`); vazio se não houver                              |
| C      | `Fonte`               | `SINAPI`, `SETOP`, `SICRO`, `CDHU`, `ORSE`, `GOINFRA`, `Próprio`…                |
| D      | `Descrição`           | texto do serviço ou título da etapa                                              |
| E      | `Unidade`             | `m`, `m²`, `m³`, `un`, `kg`, `vb`… (vazio na etapa)                              |
| F      | `Quantidade`          | número, até 3 casas (vazio na etapa)                                             |
| G      | `Preço unitário (R$)` | preço unitário **com BDI** da prefeitura, até 4 casas (vazio na etapa)           |
| H      | `Total (R$)`          | total da linha com BDI, como está na planilha da prefeitura, só para conferência |

- **Linha de etapa** (título de grupo): só `Item` e `Descrição`; quantidade e preço vazios. Pode ser de qualquer nível (`1`, `1.2`).
- **Linha de item:** `Quantidade` e `Preço unitário (R$)` sempre preenchidos, como **números** (não texto, não fórmula).
- A coluna A é gravada como **texto** (formato `@`), para `1.10` não virar `1.1`.
- Uma linha da planilha da prefeitura = uma linha do modelo, na mesma ordem. Não entram linhas de subtotal, de total geral, cabeçalhos repetidos de página nem linhas em branco no meio.

### Aba `Informações`

Rótulo na coluna A, valor na coluna B, uma linha por rótulo:

| Rótulo (coluna A)          | Valor (coluna B)                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `Órgão`                    | ex.: `Prefeitura Municipal de Itatinga`                                                |
| `Objeto`                   | objeto da licitação, como no edital                                                    |
| `Edital/Processo`          | ex.: `Pregão Eletrônico 12/2026 — Processo 345/2026`                                   |
| `Data-base`                | data-base dos preços, em texto (ex.: `09/2025`)                                        |
| `BDI (%)`                  | BDI da prefeitura em %, em texto (ex.: `23,96`); com dois BDIs, os dois, identificados |
| `Fonte de preços`          | ex.: `SINAPI 09/2025 desonerado; SETOP 07/2025`                                        |
| `Total da prefeitura (R$)` | valor global da planilha da prefeitura (com BDI), como **número**                      |
| `Observações`              | tudo o que foi calculado, normalizado, criado, ilegível ou ambíguo                     |

Deixe a coluna B vazia quando a planilha não trouxer a informação. Não invente.

### Aba `Cronograma` (opcional)

Só quando o edital traz o cronograma físico-financeiro (regras na seção **Cronograma**). A linha 1 é o cabeçalho:

| Coluna      | Cabeçalho                 | Conteúdo                                                                        |
| ----------- | ------------------------- | ------------------------------------------------------------------------------- |
| A           | `Item`                    | número da etapa de nível 1 em **texto** (`1`, `2`…), o mesmo da aba `Orçamento` |
| B           | `Descrição`               | título da etapa, como na aba `Orçamento`                                        |
| C em diante | `Mês 1`, `Mês 2`… `Mês N` | % da etapa no mês, **número** de 0 a 100 com até 2 casas (`20` = 20%); N até 60 |

- Uma linha por etapa de nível 1 (`1`, `2`, `3`…); subetapas (`1.1`) e itens não entram.
- Cada linha soma **100,00**. Mês sem execução: `0` ou vazio.

## Passo a passo

1. **Leia o arquivo inteiro**, todas as páginas ou abas.
   - Excel: abra com `openpyxl` e `data_only=True` (valores, não fórmulas). Use a aba do orçamento sintético, não a de composições analíticas; a do cronograma vale para a aba `Cronograma` (passo 6). A tabela quase nunca começa na linha 1: localize o cabeçalho pelos rótulos (Item, Código, Descrição, Unid., Quant., Preço/Valor unitário, Total).
   - PDF: extraia as tabelas página a página (ex.: `pdfplumber`). Se o PDF for imagem (escaneado), leia cada página visualmente. Cuidado com descrições quebradas em várias linhas e com o cabeçalho repetido em cada página.
2. **Mapeie as colunas** da prefeitura para as do modelo. Nomes comuns: `Item`/`Nº`; `Código`/`Cód.`/`SINAPI`; `Fonte`/`Banco`/`Referência`; `Descrição`/`Serviços`/`Discriminação`; `Und`/`Unid.`; `Quant.`/`Qtde`; `Preço unitário`/`Valor unit. c/ BDI`; `Total`/`Valor total`. Quando uma coluna junta código e fonte (ex.: `4813-SINAPI-08/2025`), separe: `Código` = `4813`, `Fonte` = `SINAPI`.
3. **Numeração e etapas.**
   - Copie o número do item como está. Só normalize o zero final de título: `1.0` → `1`, `2.0` → `2`, mantendo o resto (`1.1`, `1.1.2`), e anote em Observações.
   - Linhas de grupo ou título (em geral em maiúsculas, sem quantidade e sem preço) viram **etapa**.
   - Linhas de subtotal ("TOTAL SERVIÇOS PRELIMINARES", ou só um valor solto) **não** entram; use o valor delas só para conferir.
   - Planilha sem numeração: numere na ordem (`1`, `2`, `3`…; com grupos, `1` para o grupo e `1.1`, `1.2`… para os itens) e anote em Observações: "Numeração criada na conversão: a planilha da prefeitura não numera os itens."
4. **Preço unitário com BDI** (coluna G):
   - A planilha tem o preço unitário com BDI: copie-o.
   - Só tem o preço sem BDI e um BDI geral: calcule `arredondar(preço sem BDI × (1 + BDI), 2)`, meio para cima, como a prefeitura faz (função `preco_com_bdi` abaixo). Anote em Observações, ex.: "Preço com BDI calculado: sem BDI × (1 + 23,96%), arredondado em 2 casas."
   - Exemplo real (Itatinga-SP): unitário sem BDI 2.827,92 e BDI 23,96% → 3.505,49; 6 un → 21.032,94, o mesmo total com BDI da planilha da prefeitura.
   - Dois BDIs (material/equipamento e serviço/mão de obra): use o BDI de cada linha e anote a regra usada.
   - BDI embutido e não mostrado: copie o preço como está.
   - No Excel, se a célula guarda mais casas do que mostra (fórmula sem arredondar), use o valor exibido, com as casas do formato da célula (`arred`), e anote em Observações.
5. **Não aplique desconto.** O SIGO aplica o desconto da proposta.
6. **Cronograma:** se o edital tiver cronograma físico-financeiro, monte as linhas da aba `Cronograma` (seção **Cronograma**). Sem cronograma no edital, não crie a aba.
7. **Grave o `.xlsx`** com `gravar_modelo_sigo` (valores, não fórmulas; com cronograma, passe `cronograma=`).
8. **Confira** com `conferir_modelo_sigo`, corrija o que der erro e responda ao usuário.

## Regras de fidelidade

- Copie número, código, fonte, descrição, unidade e quantidade **exatamente** como na planilha, na mesma ordem. Não resuma nem "corrija" descrições; não troque unidades.
- **Nunca invente** item, quantidade, preço ou código. Valor ilegível, célula cortada ou linha duvidosa: use a leitura mais provável **e** registre em `Observações` e na resposta, com o número do item e a página.
- Não junte, não separe e não reordene itens.
- Quantidade até 3 casas e preço até 4 casas, como na planilha; não arredonde além disso.
- Colunas F, G e H e o `Total da prefeitura (R$)` são **números** (`125.5`, não `"125,50"`).
- Não crie outras abas além de `Orçamento`, `Informações` e, quando houver cronograma, `Cronograma`; nem colunas, fórmulas, células mescladas ou linhas de total.

## Conferência (obrigatória)

- Some `arredondar(quantidade × preço unitário, 2)` de todos os itens e compare com o **total geral da prefeitura**. Diferença acima de R$ 0,01 indica item faltando, número lido errado ou arredondamento diferente: procure a causa e informe.
- Se a planilha tiver subtotal por etapa, compare também cada etapa.
- Linha a linha: `Total (R$)` diferente de `arredondar(quantidade × preço, 2)` em mais de R$ 0,01 vai para a resposta, com o número do item.

## Cronograma

Quando o edital trouxer o **cronograma físico-financeiro** (no PDF, numa aba do Excel ou num anexo), preencha também a aba `Cronograma`.

- **Uma linha por etapa de nível 1** do orçamento, com o mesmo `Item` da aba `Orçamento`, em texto.
- **Os meses do edital, sem reperiodizar.** Cronograma da prefeitura em 6 meses = `Mês 1` a `Mês 6`, mesmo que a Ordem de Serviço vá dar outro prazo: a reperiodização é feita dentro do SIGO.
- **% por célula:** o % daquela etapa naquele mês, como número de 0 a 100 com até 2 casas (`20` para 20%; nunca `0,2`, texto ou formato de %).
- **Cada linha soma 100,00.** Se o edital mostrar % que somam 99,99 ou 100,01 por arredondamento, copie como está e anote em Observações; o SIGO importa e mostra a linha em vermelho até alguém corrigir.
- **Edital só com R$ por mês:** converta com `pct_da_linha` (R$ do mês ÷ total da etapa no cronograma da prefeitura, 2 casas; o último mês com % maior que zero fica com a diferença, para fechar 100,00, como no SIGO; se isso deixasse esse mês negativo, a linha vai pelo maior resto) e anote em Observações: "Cronograma convertido de R$ para %: R$ do mês ÷ total da etapa, 2 casas, diferença no último mês."
- **Orçamento sem etapas e cronograma com uma etapa só** (ex.: Itatinga-SP, "1 SERVIÇOS DE ELÉTRICA"): crie essa etapa `1` na aba `Orçamento`, antes dos itens, numere os itens como `1.1`, `1.2`… e anote em Observações: "Etapa 1 criada a partir do cronograma; itens numerados como 1.1, 1.2…".
- **Não force a correspondência.** Se as etapas do cronograma não baterem com as do orçamento (outra divisão, outra numeração) ou se o cronograma só tiver o total por mês, sem as etapas, não crie a aba: explique na resposta, e o usuário decide.
- Confira com `conferir_modelo_sigo`: % fora de 0 a 100, texto numa célula de mês e `Item` repetido são **erros**; linha que não soma 100,00, `Item` que não é etapa de nível 1 e etapa sem linha são **avisos**. O SIGO recusa o % fora da faixa, o texto que não é número e o `Item` repetido; um texto com número (`"12,5"`) o SIGO aceita, mas o `conferir_cronograma` da skill recusa, para o arquivo sair só com números.

## Código (Python + openpyxl)

```python
import re
from decimal import Decimal, ROUND_HALF_UP

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font

CABECALHOS = ["Item", "Código", "Fonte", "Descrição", "Unidade", "Quantidade",
              "Preço unitário (R$)", "Total (R$)"]
ROTULOS_INFO = ["Órgão", "Objeto", "Edital/Processo", "Data-base", "BDI (%)",
                "Fonte de preços", "Total da prefeitura (R$)", "Observações"]
LARGURAS = {"A": 10, "B": 12, "C": 12, "D": 70, "E": 9, "F": 12, "G": 20, "H": 16}
CABECALHO_CRONOGRAMA = ["Item", "Descrição"]  # depois, "Mês 1", "Mês 2"… até "Mês <meses>"
PREFIXO_MES = "Mês "
MAX_MESES = 60


def arred(valor, casas=2):
    """Arredonda meio para cima. O round() do Python arredonda 0,125 para 0,12."""
    passo = Decimal(1).scaleb(-casas)
    return float(Decimal(str(valor)).quantize(passo, rounding=ROUND_HALF_UP))


def preco_com_bdi(sem_bdi, bdi_pct):
    """Preço com BDI como a prefeitura calcula: arredondar(sem BDI × (1 + BDI/100), 2)."""
    valor = Decimal(str(sem_bdi)) * (1 + Decimal(str(bdi_pct)) / 100)
    return float(valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def pct_da_linha(valores):
    """% de cada mês a partir dos R$ da etapa no cronograma da prefeitura, com 2 casas.
    O último mês com % > 0 fica com a diferença, para a linha fechar 100,00 (como no SIGO);
    nunca um mês com 0%. Se isso deixasse esse mês negativo (mês com valor ínfimo), a linha
    vai pelo maior resto: soma 100,00 e nenhum % negativo."""
    reais = [Decimal(str(v or 0)) for v in valores]
    total = sum(reais)
    if total == 0:
        return [0.0] * len(reais)
    pct = [(v * 100 / total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for v in reais]
    diferenca = Decimal("100") - sum(pct)
    ultimo = max(k for k, p in enumerate(pct) if p > 0)
    if pct[ultimo] + diferenca >= 0:
        pct[ultimo] += diferenca
        return [float(p) for p in pct]
    # maior resto em centésimos: cada mês fica com o piso, e os centésimos que faltam vão para
    # os meses de maior resto (empate: o mais cedo); mês sem valor não recebe nada
    exatos = [v * 10000 / total for v in reais]
    base = [int(e) for e in exatos]
    ordem = sorted(range(len(reais)), key=lambda k: (base[k] - exatos[k], k))
    for k in ordem[:10000 - sum(base)]:
        base[k] += 1
    return [b / 100 for b in base]


def gravar_modelo_sigo(linhas, info, caminho, cronograma=None):
    """linhas: lista de dicts com item, codigo, fonte, descricao, unidade, quantidade,
    preco e total. Etapa: só item e descricao. info: {rótulo de ROTULOS_INFO: valor}.
    cronograma (opcional): {"meses": N, "linhas": [{"item": "1", "descricao": "...",
    "pct": [% do Mês 1, ..., % do Mês N]}]}, uma linha por etapa de nível 1."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Orçamento"
    ws.append(CABECALHOS)
    for celula in ws[1]:
        celula.font = Font(bold=True)
    for n, l in enumerate(linhas, start=2):
        codigo = l.get("codigo")
        valores = [str(l["item"]), str(codigo) if codigo not in (None, "") else None,
                   l.get("fonte") or None, l["descricao"], l.get("unidade") or None,
                   l.get("quantidade"), l.get("preco"), l.get("total")]
        for c, valor in enumerate(valores, start=1):
            celula = ws.cell(row=n, column=c, value=valor)
            if isinstance(valor, str) and valor.startswith("="):
                celula.data_type = "s"  # texto que começa com "=" não vira fórmula
        ws.cell(row=n, column=1).number_format = "@"  # coluna A como Texto
    for coluna, largura in LARGURAS.items():
        ws.column_dimensions[coluna].width = largura
    wi = wb.create_sheet("Informações")
    for rotulo in ROTULOS_INFO:
        wi.append([rotulo, info.get(rotulo)])
    wi.column_dimensions["A"].width = 26
    wi.column_dimensions["B"].width = 80
    if cronograma:
        meses = int(cronograma["meses"])
        if not 1 <= meses <= MAX_MESES:
            raise ValueError(f"O cronograma tem de ter de 1 a {MAX_MESES} meses: {meses}")
        wc = wb.create_sheet("Cronograma")
        wc.append(CABECALHO_CRONOGRAMA + [f"{PREFIXO_MES}{k}" for k in range(1, meses + 1)])
        for celula in wc[1]:
            celula.font = Font(bold=True)
        for n, l in enumerate(cronograma["linhas"], start=2):
            pct = list(l["pct"])
            if len(pct) != meses:
                raise ValueError(f"Etapa {l['item']}: {len(pct)} valores de %, e o cronograma "
                                 f"tem {meses} meses")
            for c, valor in enumerate([str(l["item"]), l.get("descricao") or None] + pct, start=1):
                celula = wc.cell(row=n, column=c, value=valor)
                if isinstance(valor, str) and valor.startswith("="):
                    celula.data_type = "s"  # texto que começa com "=" não vira fórmula
            wc.cell(row=n, column=1).number_format = "@"  # coluna A como Texto
        wc.column_dimensions["A"].width = 10
        wc.column_dimensions["B"].width = 50
    wb.save(caminho)


def conferir_modelo_sigo(caminho):
    """Relê o arquivo e aplica as regras do importador do SIGO.
    Devolve (erros, avisos, soma_dos_itens). Com erros, corrija antes de entregar: o SIGO recusa
    a importação (no texto com número da aba Cronograma, quem recusa é a skill)."""
    wb = load_workbook(caminho)
    erros, avisos = [], []
    abas_validas = (["Orçamento", "Informações"], ["Orçamento", "Informações", "Cronograma"])
    if wb.sheetnames not in abas_validas:
        erros.append(f"As abas devem ser Orçamento e Informações (e, opcional, Cronograma): "
                     f"{wb.sheetnames}")
        return erros, avisos, 0.0
    ws = wb["Orçamento"]
    cabecalho = [c.value for c in ws[1]][:8]
    if cabecalho != CABECALHOS:
        erros.append(f"Cabeçalho diferente do modelo: {cabecalho}")
    vistos, soma, itens, etapas = {}, Decimal("0"), 0, []
    for linha in ws.iter_rows(min_row=2, max_col=8):
        item, _, _, descricao, _, qtd, preco, total = [c.value for c in linha]
        n = linha[0].row
        if all(v in (None, "") for v in (item, descricao, qtd, preco, total)):
            continue
        if not isinstance(item, str) or not re.fullmatch(r"\d+(\.\d+)*", item):
            erros.append(f"Linha {n}: Item {item!r} tem de ser texto no padrão 1, 1.1, 1.1.2")
        elif item in vistos:
            erros.append(f"Linha {n}: Item {item} repetido (linha {vistos[item]})")
        else:
            vistos[item] = n
        if not descricao:
            erros.append(f"Linha {n}: Descrição vazia")
        if any(isinstance(v, str) for v in (qtd, preco, total)):
            erros.append(f"Linha {n}: Quantidade, Preço e Total têm de ser números")
        elif (qtd is None) != (preco is None):
            erros.append(f"Linha {n}: Quantidade e Preço unitário vão juntos (etapa: os dois vazios)")
        elif qtd is not None:
            if qtd <= 0 or preco < 0:
                erros.append(f"Linha {n}: Quantidade tem de ser maior que zero e Preço, positivo")
            itens += 1
            calculado = (Decimal(str(qtd)) * Decimal(str(preco))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP)
            soma += calculado
            if total is not None and abs(Decimal(str(total)) - calculado) > Decimal("0.01"):
                avisos.append(f"Linha {n}: Total {total} difere de qtd × preço = {calculado}")
        elif isinstance(item, str) and re.fullmatch(r"\d+", item):
            etapas.append(item)  # etapa de nível 1, para conferir a aba Cronograma
    if itens == 0:
        erros.append("Nenhum item com Quantidade e Preço unitário")
    info = {r[0].value: r[1].value for r in wb["Informações"].iter_rows(max_col=2) if r[0].value}
    total_prefeitura = info.get("Total da prefeitura (R$)")
    if total_prefeitura is None:
        avisos.append("Sem o Total da prefeitura (R$): a soma não foi conferida")
    elif abs(soma - Decimal(str(total_prefeitura))) > Decimal("0.01"):
        avisos.append(f"Soma dos itens {soma} difere do total da prefeitura {total_prefeitura} "
                      f"em {soma - Decimal(str(total_prefeitura))}")
    if "Cronograma" in wb.sheetnames:
        conferir_cronograma(wb["Cronograma"], etapas, erros, avisos)
    return erros, avisos, float(soma)


def conferir_cronograma(ws, etapas, erros, avisos):
    """Aba Cronograma com as regras do importador do SIGO. Erros: cabeçalho, Item que não é texto,
    Item repetido e % que não é número de 0 a 100. Avisos: linha que não soma 100,00, % com mais
    de 2 casas, Item que não é etapa de nível 1 da aba Orçamento e etapa sem linha. Mais estrita
    que o SIGO: texto com número numa célula de mês ("12,5") é erro aqui; o SIGO o aceita."""
    cabecalho = [c.value for c in ws[1]]
    while cabecalho and cabecalho[-1] in (None, ""):
        cabecalho.pop()
    meses = len(cabecalho) - 2
    esperado = CABECALHO_CRONOGRAMA + [f"{PREFIXO_MES}{k}" for k in range(1, meses + 1)]
    if not 1 <= meses <= MAX_MESES or cabecalho != esperado:
        erros.append(f"Cronograma: cabeçalho diferente de Item, Descrição, Mês 1… Mês N "
                     f"(N de 1 a {MAX_MESES}): {cabecalho}")
        return
    vistos = {}
    for linha in ws.iter_rows(min_row=2, max_col=meses + 2):
        item, _, *pct = [c.value for c in linha]
        n = linha[0].row
        if item in (None, "") and all(p in (None, "") for p in pct):
            continue
        if not isinstance(item, str) or not item.strip():
            erros.append(f"Cronograma, linha {n}: Item {item!r} tem de ser texto (1, 2, 3…)")
            continue
        if item in vistos:
            erros.append(f"Cronograma, linha {n}: Item {item} repetido (linha {vistos[item]})")
            continue
        vistos[item] = n
        if item not in etapas:
            avisos.append(f"Cronograma, linha {n}: Item {item} não é etapa de nível 1 da aba "
                          f"Orçamento; o SIGO ignora a linha")
        total = Decimal("0")
        for k, p in enumerate(pct, start=1):
            if p in (None, ""):
                continue
            if isinstance(p, bool) or not isinstance(p, (int, float)) or not 0 <= p <= 100:
                erros.append(f"Cronograma, linha {n}, Mês {k}: {p!r} tem de ser número de 0 a 100")
                continue
            duas = Decimal(str(p)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if duas != Decimal(str(p)):
                avisos.append(f"Cronograma, linha {n}, Mês {k}: {p} tem mais de 2 casas")
            total += duas
        if total != 100:
            soma = f"{total:.2f}".replace(".", ",")
            avisos.append(f"Cronograma, linha {n}: a etapa {item} soma {soma}%, e não 100,00%")
    for etapa in etapas:
        if etapa not in vistos:
            avisos.append(f"Cronograma: a etapa {etapa} da aba Orçamento não tem linha")


# Exemplo
linhas = [
    {"item": "1", "descricao": "SERVIÇOS PRELIMINARES"},
    {"item": "1.1", "codigo": "93358", "fonte": "SINAPI", "descricao": "ESCAVAÇÃO MANUAL DE VALA",
     "unidade": "m³", "quantidade": 125.5, "preco": 10.48, "total": 1315.24},
    {"item": "2", "descricao": "POSTES"},
    {"item": "2.1", "codigo": "41210", "fonte": "SINAPI", "descricao": "Poste 12/1000",
     "unidade": "un", "quantidade": 6, "preco": preco_com_bdi(2827.92, 23.96), "total": 21032.94},
]
info = {"Órgão": "Prefeitura Municipal de Exemplo", "Data-base": "09/2025", "BDI (%)": "23,96",
        "Total da prefeitura (R$)": 22348.18,
        "Observações": "Item 2.1: preço com BDI calculado, 2.827,92 × (1 + 23,96%) = 3.505,49."}
cronograma = {"meses": 4, "linhas": [
    {"item": "1", "descricao": "SERVIÇOS PRELIMINARES", "pct": [20, 35, 30, 15]},
    {"item": "2", "descricao": "POSTES", "pct": pct_da_linha([0, 7010.98, 7010.98, 7010.98])},
]}
gravar_modelo_sigo(linhas, info, "Orcamento SIGO - PM Exemplo.xlsx", cronograma)
print(conferir_modelo_sigo("Orcamento SIGO - PM Exemplo.xlsx"))
```

## Resposta ao usuário (modelo)

> Planilha convertida para o modelo do SIGO: **N etapas e M itens**.
>
> - Soma dos itens: R$ X · Total da prefeitura: R$ Y · Diferença: R$ Z (explique se não for zero).
> - Preço com BDI: copiado da planilha / calculado com BDI de B% (ver Observações).
> - Pontos de atenção: itens ilegíveis, numeração criada ou normalizada, linhas com total diferente.
> - Cronograma: N meses e E etapas, copiado do edital sem reperiodizar; cada linha soma 100,00% (ou: a etapa X soma Y%). Sem cronograma no edital: "O edital não traz cronograma físico-financeiro; a aba Cronograma não foi criada."
>
> Para importar: SIGO → Oportunidade → aba **Orçamento** → **Importar planilha**. Confira a prévia e confirme; depois aplique o desconto no campo **Desconto (%)**. O cronograma, com o mesmo arquivo: aba **Planejamento** → **Cronograma físico-financeiro** → **Importar**.

## Com o conector do SIGO Obras

Quando as ferramentas `empresa_atual` e `importar_orcamento` do conector do SIGO Obras existem nesta conversa, **grave direto no SIGO** pelas ferramentas, em vez de pedir ao usuário para importar o arquivo. Sem o conector, nada muda: siga o resto deste documento.

1. Chame `empresa_atual` e confirme a empresa. Ache a oportunidade com `buscar_oportunidades` (ou use a que o usuário indicar); o `oportunidade_id` é o UUID dela.
2. Monte as linhas com as mesmas regras deste documento (fidelidade, numeração, etapas, preço com BDI, sem desconto) e, em vez das células da aba `Orçamento`, mande uma lista `linhas`, uma entrada por linha, na mesma ordem:

   | Coluna do modelo      | Campo de `linhas[]`                                                |
   | --------------------- | ------------------------------------------------------------------ |
   | `Item`                | `item`, em texto (`"1"`, `"1.1"`, `"1.10"`)                        |
   | `Código`              | `codigo`                                                           |
   | `Fonte`               | `fonte`                                                            |
   | `Descrição`           | `descricao`                                                        |
   | `Unidade`             | `unidade`                                                          |
   | `Quantidade`          | `quantidade`, número (null na etapa)                               |
   | `Preço unitário (R$)` | `preco_unitario`, número, com BDI e sem desconto (null na etapa)   |
   | `Total (R$)`          | `total`, número, como na planilha da prefeitura (só para conferir) |

3. A aba `Informações` vai no objeto `informacoes`:

   | Rótulo da aba              | Campo de `informacoes` |
   | -------------------------- | ---------------------- |
   | `Órgão`                    | `orgao`                |
   | `Objeto`                   | `objeto`               |
   | `Edital/Processo`          | `edital`               |
   | `Data-base`                | `data_base`            |
   | `BDI (%)`                  | `bdi`                  |
   | `Fonte de preços`          | `fonte_precos`         |
   | `Total da prefeitura (R$)` | `total_prefeitura`     |
   | `Observações`              | `observacoes`          |

4. Mostre a conferência ao usuário (etapas, itens, soma, total da prefeitura e diferença) e **pergunte o desconto (%) da proposta antes de gravar**.
5. Grave nesta ordem:
   1. `importar_orcamento` com `oportunidade_id`, `linhas` e `informacoes`. Se voltar `gravado: false` e `motivo: "ja_existe"`, faça ao usuário a `pergunta` que veio ("Substituir os N itens atuais?") e só com o "sim" chame de novo com `substituir: true`. Erro `validacao`: corrija o que veio em `erros` ("Linha n" conta como no Excel: a 1ª entrada de `linhas` é a linha 2) e chame de novo. Todo item precisa estar dentro de uma etapa.
   2. `aplicar_desconto` com o `desconto_pct` que o usuário informou (12,35 ou 12.35). Se voltar `orcamento_mudou`, chame de novo.
   3. Se houver a aba `Cronograma`: `importar_cronograma` com `meses` e `linhas: [{item, pct}]`, uma entrada por etapa de nível 1 (`item` = o `Item` da etapa; `pct` = os % de `Mês 1` a `Mês N`, vazio = 0). O `ja_existe` funciona como no orçamento: `substituir: true` só depois de o usuário confirmar.
   4. `registrar_proposta` com o `oportunidade_id`: registra a versão da proposta (Rascunho) com o total com desconto.
   5. Para conferir o que ficou gravado, use `ler_orcamento`.
6. O Excel continua: grave o `.xlsx` com `gravar_modelo_sigo`, como sempre, e anexe nos Arquivos da oportunidade com `gerar_link_envio` (alvo `oportunidade`, pasta `Envelope 01 – Proposta`). O usuário solta o arquivo na página do link; no Claude Code, envie pelo comando que o link devolve e chame `registrar_arquivos`.
7. Responda com o que foi gravado (etapas, itens, total de referência, total da proposta e desconto real; meses do cronograma e as linhas que não fecham 100,00%) e com o aviso: "Baixe o PDF oficial no SIGO: Oportunidade → Orçamento → **Exportar proposta** e Planejamento → **Exportar cronograma** (desmarque 'Registrar como nova versão', que o Claude já registrou)", com o link da oportunidade.

Se o usuário pedir algo que as ferramentas não fazem (apagar a oportunidade, mexer no financeiro, gerar o PDF da proposta), diga que o conector não faz e não invente.
