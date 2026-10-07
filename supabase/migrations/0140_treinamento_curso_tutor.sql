-- 0140 — EAD (NR-1, Anexo II 4.5): nome e atendimento do tutor do curso (T21 do handoff do Portal de Treinamento)
--
-- Por quê: o canal "Fale com o tutor" já grava a dúvida do aluno e avisa o WhatsApp do tutor
-- (treinamento_curso.tutor_telefone, migração 0103), mas o curso não dizia QUEM é o tutor nem QUANDO ele atende:
-- o aluno não sabia a quem estava perguntando nem em quanto tempo esperar a resposta, e nenhum curso tinha
-- tutor cadastrado (0 de 16). Decisão D4 do Javerson (06/10/2026): "deixa local para configurar" — o RH preenche
-- na tela do curso, quando quiser, o nome, o WhatsApp e o atendimento (horário e prazo de resposta) de cada
-- tutor. Nada é obrigatório: o tutor continua só como aviso no painel de requisitos do curso e NÃO trava a
-- publicação nem a matrícula.
--
-- O que guarda:
--   - tutor_nome        o nome do tutor, que o aluno vê na tela do curso;
--   - tutor_atendimento texto livre com o horário e o prazo de resposta, que o aluno também vê.
-- O telefone fica onde já estava (tutor_telefone) e continua só do servidor: o portal nunca o entrega ao aluno.
--
-- Os limites (120 e 300 caracteres) repetem os da tela (lib ead-tutor.js) e existem porque o aluno lê esses
-- textos no portal: sem limite, uma chamada direta à API poderia pôr um texto enorme na tela dele. As colunas
-- nascem vazias, então a restrição passa em todas as linhas existentes.
--
-- Idempotente (add column if not exists; a restrição é recriada). Sem UPDATE de dados reais: nenhum curso ganha
-- tutor sozinho, o RH preenche pela tela. Nenhum telefone, nome ou prazo é gravado por esta migração.
--
-- Depois de aplicar: publicar a função portal-funcionario (o aluno passa a receber nome e atendimento do tutor,
-- e o WhatsApp ao tutor ganha o link para responder) e o site (campos na tela do curso, contador de dúvidas sem
-- resposta na aba Treinamentos e "Atualizar" no portal). Em RH & Segurança → Treinamentos → curso, o RH preenche
-- o tutor quando decidir quem é.

begin;

alter table public.treinamento_curso
  add column if not exists tutor_nome text,
  add column if not exists tutor_atendimento text;

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_tutor_nome_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_tutor_nome_chk
  check (tutor_nome is null or char_length(tutor_nome) <= 120);

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_tutor_atendimento_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_tutor_atendimento_chk
  check (tutor_atendimento is null or char_length(tutor_atendimento) <= 300);

comment on column public.treinamento_curso.tutor_nome is
  'Nome do tutor do curso (até 120 caracteres); o aluno o vê no portal. Opcional (decisão D4).';
comment on column public.treinamento_curso.tutor_atendimento is
  'Horário e prazo de resposta do tutor (texto livre, até 300 caracteres); o aluno o vê no portal. Opcional.';

commit;

-- Conferência (só leitura): as duas colunas existem e quantos cursos vivos já têm tutor (0 na primeira aplicação;
-- sobe conforme o RH preenche pela tela).
select count(*) filter (where tutor_nome is not null) as cursos_com_nome_do_tutor,
       count(*) filter (where tutor_telefone is not null) as cursos_com_whatsapp_do_tutor,
       count(*) filter (where tutor_atendimento is not null) as cursos_com_atendimento,
       count(*) as cursos
from public.treinamento_curso
where deleted_at is null;

select 'ok' as res;
