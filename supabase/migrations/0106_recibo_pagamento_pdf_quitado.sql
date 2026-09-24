-- Recibo de pagamento: PDF do recibo QUITADO (com a evidência da quitação
-- eletrônica) gerado pelo servidor quando o fornecedor confirma, guardado no
-- Storage e anexado à despesa. `pdf_ref` = "bucket/caminho" desse PDF.
alter table public.recibo_pagamento
  add column if not exists pdf_ref text;

comment on column public.recibo_pagamento.pdf_ref is
  'Referência "bucket/caminho" do PDF do recibo quitado (gerado ao confirmar; também anexado em transacao_anexo).';
