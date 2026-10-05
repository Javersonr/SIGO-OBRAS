---
name: orcamento-prefeitura-sigo
description: Converte a planilha orçamentária de uma licitação de prefeitura (PDF ou Excel; SINAPI, SETOP, SICRO, CDHU, ORSE, GOINFRA etc.) para o modelo de importação do SIGO Obras, um .xlsx com as abas "Orçamento" e "Informações". Use quando o usuário anexar a planilha orçamentária, planilha de preços ou orçamento sintético de um edital e pedir para converter, transcrever ou montar no modelo do SIGO, para importar no SIGO, ou disser "orçamento SIGO" ou "planilha para o SIGO". Copia fielmente etapas, itens, quantidades e preços de referência com BDI, confere com o total da prefeitura e não aplica desconto.
---

# Planilha da prefeitura → modelo de orçamento do SIGO

Você recebe a planilha orçamentária de um edital (PDF ou Excel) e devolve um `.xlsx` no **modelo do SIGO Obras**. O usuário importa esse arquivo no SIGO (Oportunidade → aba Orçamento → **Importar planilha**), que o lê sem IA: os nomes das abas, os cabeçalhos e os rótulos têm de ser **exatamente** os deste documento. O desconto da proposta é aplicado depois, dentro do SIGO.

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

## Passo a passo

1. **Leia o arquivo inteiro**, todas as páginas ou abas.
   - Excel: abra com `openpyxl` e `data_only=True` (valores, não fórmulas). Use a aba do orçamento sintético, não a de composições analíticas nem a do cronograma. A tabela quase nunca começa na linha 1: localize o cabeçalho pelos rótulos (Item, Código, Descrição, Unid., Quant., Preço/Valor unitário, Total).
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
6. **Grave o `.xlsx`** com `gravar_modelo_sigo` (valores, não fórmulas).
7. **Confira** com `conferir_modelo_sigo`, corrija o que der erro e responda ao usuário.

## Regras de fidelidade

- Copie número, código, fonte, descrição, unidade e quantidade **exatamente** como na planilha, na mesma ordem. Não resuma nem "corrija" descrições; não troque unidades.
- **Nunca invente** item, quantidade, preço ou código. Valor ilegível, célula cortada ou linha duvidosa: use a leitura mais provável **e** registre em `Observações` e na resposta, com o número do item e a página.
- Não junte, não separe e não reordene itens.
- Quantidade até 3 casas e preço até 4 casas, como na planilha; não arredonde além disso.
- Colunas F, G e H e o `Total da prefeitura (R$)` são **números** (`125.5`, não `"125,50"`).
- Não crie outras abas, colunas, fórmulas, células mescladas nem linhas de total.

## Conferência (obrigatória)

- Some `arredondar(quantidade × preço unitário, 2)` de todos os itens e compare com o **total geral da prefeitura**. Diferença acima de R$ 0,01 indica item faltando, número lido errado ou arredondamento diferente: procure a causa e informe.
- Se a planilha tiver subtotal por etapa, compare também cada etapa.
- Linha a linha: `Total (R$)` diferente de `arredondar(quantidade × preço, 2)` em mais de R$ 0,01 vai para a resposta, com o número do item.

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


def arred(valor, casas=2):
    """Arredonda meio para cima. O round() do Python arredonda 0,125 para 0,12."""
    passo = Decimal(1).scaleb(-casas)
    return float(Decimal(str(valor)).quantize(passo, rounding=ROUND_HALF_UP))


def preco_com_bdi(sem_bdi, bdi_pct):
    """Preço com BDI como a prefeitura calcula: arredondar(sem BDI × (1 + BDI/100), 2)."""
    valor = Decimal(str(sem_bdi)) * (1 + Decimal(str(bdi_pct)) / 100)
    return float(valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def gravar_modelo_sigo(linhas, info, caminho):
    """linhas: lista de dicts com item, codigo, fonte, descricao, unidade, quantidade,
    preco e total. Etapa: só item e descricao. info: {rótulo de ROTULOS_INFO: valor}."""
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
    wb.save(caminho)


def conferir_modelo_sigo(caminho):
    """Relê o arquivo e aplica as regras do importador do SIGO.
    Devolve (erros, avisos, soma_dos_itens). Com erros, o SIGO recusa a importação."""
    wb = load_workbook(caminho)
    erros, avisos = [], []
    if wb.sheetnames != ["Orçamento", "Informações"]:
        erros.append(f"As abas devem ser Orçamento e Informações: {wb.sheetnames}")
        return erros, avisos, 0.0
    ws = wb["Orçamento"]
    cabecalho = [c.value for c in ws[1]][:8]
    if cabecalho != CABECALHOS:
        erros.append(f"Cabeçalho diferente do modelo: {cabecalho}")
    vistos, soma, itens = {}, Decimal("0"), 0
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
    if itens == 0:
        erros.append("Nenhum item com Quantidade e Preço unitário")
    info = {r[0].value: r[1].value for r in wb["Informações"].iter_rows(max_col=2) if r[0].value}
    total_prefeitura = info.get("Total da prefeitura (R$)")
    if total_prefeitura is None:
        avisos.append("Sem o Total da prefeitura (R$): a soma não foi conferida")
    elif abs(soma - Decimal(str(total_prefeitura))) > Decimal("0.01"):
        avisos.append(f"Soma dos itens {soma} difere do total da prefeitura {total_prefeitura} "
                      f"em {soma - Decimal(str(total_prefeitura))}")
    return erros, avisos, float(soma)


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
gravar_modelo_sigo(linhas, info, "Orcamento SIGO - PM Exemplo.xlsx")
print(conferir_modelo_sigo("Orcamento SIGO - PM Exemplo.xlsx"))
```

## Resposta ao usuário (modelo)

> Planilha convertida para o modelo do SIGO: **N etapas e M itens**.
>
> - Soma dos itens: R$ X · Total da prefeitura: R$ Y · Diferença: R$ Z (explique se não for zero).
> - Preço com BDI: copiado da planilha / calculado com BDI de B% (ver Observações).
> - Pontos de atenção: itens ilegíveis, numeração criada ou normalizada, linhas com total diferente.
>
> Para importar: SIGO → Oportunidade → aba **Orçamento** → **Importar planilha**. Confira a prévia e confirme; depois aplique o desconto no campo **Desconto (%)**.
