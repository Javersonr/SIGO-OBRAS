-- EAD: legenda por aula + comentário por questão.
--
-- legenda_ref: "bucket/caminho" de um arquivo WebVTT (.vtt) no Storage. O
--   portal assina a URL junto com a do vídeo e o player mostra como <track>.
--   Arquivos .srt são convertidos para .vtt no upload.
-- comentario: explicação da resposta. Só volta ao funcionário DEPOIS da
--   aprovação — antes disso entregaria o gabarito na nova tentativa.

alter table public.treinamento_aula
  add column if not exists legenda_ref text;

alter table public.treinamento_questao
  add column if not exists comentario text;
