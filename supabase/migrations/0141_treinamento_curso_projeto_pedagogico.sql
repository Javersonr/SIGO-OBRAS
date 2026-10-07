-- 0141 — EAD (NR-1, Anexo II 3.1 e 3.3): projeto pedagógico estruturado do curso (T25 do handoff do Portal de Treinamento)
--
-- Por quê: o Anexo II da NR-1 exige que cada curso a distância tenha um projeto pedagógico com 15 itens (3.1, de a
-- até o), validado a cada 2 anos ou quando a NR mudar (3.3). O curso só tinha o PDF do projeto
-- (projeto_pedagogico_ref, migração 0103), vazio nos 16 cursos, e campos para 5 dos 15 itens (responsável técnico,
-- instrutor, carga horária, material e avaliação). Esta migração cria as colunas dos outros itens e os campos da
-- validação, para a tela do curso mostrar os 15 itens, gerar o PDF do projeto e avisar quando a revisão vencer.
--
-- Onde ficam (decisão D5, Javerson, 07/10/2026): no CURSO EAD, não no cadastro central de treinamentos. São
-- exclusivos do EAD e o RH os preenche no curso; não mudam as exigências das funções. A migração 0131 (que copia
-- nome, código, validade, conteúdo programático e carga do cadastro central para o curso) não toca nestas colunas.
-- O texto do projeto é do responsável técnico: esta migração só cria os campos, não grava nenhum texto.
--
-- O que guarda (todas nulas ao nascer):
--   itens do 3.1, escritos pelo RH:
--     objetivo_geral             (a)  texto
--     principios_sst             (b)  texto
--     estrategia_pedagogica      (c)  texto
--     infraestrutura_apoio       (f)  texto
--     modulos_objetivos          (h)  jsonb: lista de { modulo, objetivo }, um objetivo por módulo das aulas
--     dedicacao_diaria_min       (j)  minutos por dia (o aluno vê no portal)
--     prazo_conclusao_dias       (k)  dias a partir da matrícula (o RH e o aluno veem; vale mais que o prazo
--                                     padrão que cada navegador do RH guarda na tela de matrículas, T22)
--     publico_alvo               (l)  texto
--     instrumentos_aprendizagem  (n)  texto
--   validação (3.3):
--     projeto_validado_por       quem validou (o responsável técnico)
--     projeto_validado_em        data da validação
--     proxima_revisao            data limite da próxima revisão (a tela sugere 2 anos depois)
--   Os outros 6 itens (d, e, g, i, m, o) vêm de campos que o curso já tinha.
--   marca do PDF (revisão da T25):
--     projeto_pdf_marca          a marca dos 12 campos acima no instante em que o PDF do projeto foi gerado (ou
--                                anexado). O PDF é um arquivo parado: sem esta marca, o requisito de publicação
--                                "projeto pedagógico" ficava em ordem com a data da validação mesmo quando o PDF
--                                que o aluno abre e que vai no dossiê da fiscalização dizia "ainda não foi
--                                validado". Quem grava projeto_pedagogico_ref grava junto a marca (a tela do curso);
--                                o requisito (no front e na função portal-funcionario) só fica em ordem enquanto a
--                                marca guardada bate com a dos campos de hoje. É um detector de mudança, não
--                                segurança. A fórmula está em apps/web/src/lib/ead-projeto-marca.js.
--
-- Limites (4000 caracteres por texto, 120 no nome de quem validou, 1 a 1440 minutos por dia e 1 a 3650 dias de
-- prazo) repetem os da tela (lib ead-projeto.js): sem eles, uma chamada direta à API poderia pôr um texto enorme
-- na tela do aluno ou no PDF. As colunas nascem vazias, então as restrições passam em todas as linhas existentes.
-- Quem validou e a data andam juntos (os dois ou nenhum), e a revisão não pode ser anterior à validação.
--
-- Idempotente (add column if not exists; as restrições são recriadas): se a versão anterior desta migração (sem a
-- marca do PDF) já foi aplicada, rodar esta de novo só acrescenta a coluna da marca. Sem UPDATE de dados reais: nenhum
-- curso ganha texto, validação, prazo ou marca sozinho; o RH preenche pela tela. Curso que já tem PDF (nenhum, até
-- hoje) fica com o PDF "desatualizado" até gerar de novo, porque não tem marca.
--
-- Depois de aplicar: publicar a função portal-funcionario (o aluno passa a receber o prazo e a dedicação diária do
-- curso) e o site (a seção "Projeto pedagógico" no curso, o botão "Gerar PDF do projeto", o aviso no painel
-- Vencimentos). Em RH & Segurança → Treinamentos → curso, o RH preenche o projeto quando quiser.

begin;

alter table public.treinamento_curso
  add column if not exists objetivo_geral text,
  add column if not exists principios_sst text,
  add column if not exists estrategia_pedagogica text,
  add column if not exists infraestrutura_apoio text,
  add column if not exists publico_alvo text,
  add column if not exists instrumentos_aprendizagem text,
  add column if not exists dedicacao_diaria_min integer,
  add column if not exists prazo_conclusao_dias integer,
  add column if not exists modulos_objetivos jsonb,
  add column if not exists projeto_validado_em date,
  add column if not exists projeto_validado_por text,
  add column if not exists proxima_revisao date,
  add column if not exists projeto_pdf_marca text;

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_projeto_textos_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_projeto_textos_chk
  check (
    (objetivo_geral is null or char_length(objetivo_geral) <= 4000)
    and (principios_sst is null or char_length(principios_sst) <= 4000)
    and (estrategia_pedagogica is null or char_length(estrategia_pedagogica) <= 4000)
    and (infraestrutura_apoio is null or char_length(infraestrutura_apoio) <= 4000)
    and (publico_alvo is null or char_length(publico_alvo) <= 4000)
    and (instrumentos_aprendizagem is null or char_length(instrumentos_aprendizagem) <= 4000)
  );

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_dedicacao_diaria_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_dedicacao_diaria_chk
  check (dedicacao_diaria_min is null or dedicacao_diaria_min between 1 and 1440);

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_prazo_conclusao_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_prazo_conclusao_chk
  check (prazo_conclusao_dias is null or prazo_conclusao_dias between 1 and 3650);

-- a lista de objetivos: nula, ou uma lista (jsonb array) de até 100 módulos
alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_modulos_objetivos_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_modulos_objetivos_chk
  check (
    modulos_objetivos is null
    or case when jsonb_typeof(modulos_objetivos) = 'array'
         then jsonb_array_length(modulos_objetivos) <= 100
         else false end
  );

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_projeto_validado_por_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_projeto_validado_por_chk
  check (projeto_validado_por is null or char_length(projeto_validado_por) <= 120);

-- a marca é curta ("v1:" e 14 dígitos hexadecimais); o teto só impede lixo
alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_projeto_pdf_marca_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_projeto_pdf_marca_chk
  check (projeto_pdf_marca is null or char_length(projeto_pdf_marca) <= 64);

-- quem validou e a data andam juntos; a revisão não vem antes da validação
alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_projeto_validacao_chk;
alter table public.treinamento_curso
  add constraint treinamento_curso_projeto_validacao_chk
  check (
    (projeto_validado_em is null) = (projeto_validado_por is null)
    and (proxima_revisao is null or projeto_validado_em is null or proxima_revisao >= projeto_validado_em)
  );

comment on column public.treinamento_curso.objetivo_geral is
  'Projeto pedagógico (NR-1, Anexo II 3.1 a): objetivo geral do curso. Até 4000 caracteres. Escrito pelo RH/RT.';
comment on column public.treinamento_curso.principios_sst is
  'Projeto pedagógico (3.1 b): princípios e conceitos de SST definidos nas NR. Até 4000 caracteres.';
comment on column public.treinamento_curso.estrategia_pedagogica is
  'Projeto pedagógico (3.1 c): estratégia pedagógica (teoria e prática). Até 4000 caracteres.';
comment on column public.treinamento_curso.infraestrutura_apoio is
  'Projeto pedagógico (3.1 f): infraestrutura operacional de apoio e controle. Até 4000 caracteres.';
comment on column public.treinamento_curso.publico_alvo is
  'Projeto pedagógico (3.1 l): público-alvo do curso. Até 4000 caracteres.';
comment on column public.treinamento_curso.instrumentos_aprendizagem is
  'Projeto pedagógico (3.1 n): instrumentos para potencialização do aprendizado. Até 4000 caracteres.';
comment on column public.treinamento_curso.dedicacao_diaria_min is
  'Projeto pedagógico (3.1 j): estimativa de tempo mínimo de dedicação diária, em minutos (1 a 1440). O aluno vê no portal.';
comment on column public.treinamento_curso.prazo_conclusao_dias is
  'Projeto pedagógico (3.1 k): prazo máximo para concluir, em dias a partir da matrícula (1 a 3650). RH e aluno veem; vale mais que o prazo padrão da tela de matrículas.';
comment on column public.treinamento_curso.modulos_objetivos is
  'Projeto pedagógico (3.1 h): lista jsonb de { modulo, objetivo }, um objetivo por módulo das aulas (modulo = o rótulo da aula; vazio = aulas sem módulo).';
comment on column public.treinamento_curso.projeto_validado_em is
  'Projeto pedagógico (NR-1, Anexo II 3.3): data em que o responsável técnico validou o projeto. Anda junto com projeto_validado_por.';
comment on column public.treinamento_curso.projeto_validado_por is
  'Projeto pedagógico (3.3): nome de quem validou o projeto (o responsável técnico), até 120 caracteres.';
comment on column public.treinamento_curso.proxima_revisao is
  'Projeto pedagógico (3.3): data limite da próxima revisão (a tela sugere 2 anos depois da validação). Vencida, aparece no painel Vencimentos.';
comment on column public.treinamento_curso.projeto_pdf_marca is
  'Projeto pedagógico: marca dos 12 campos do projeto quando o PDF (projeto_pedagogico_ref) foi gerado ou anexado. O requisito PROJETO só fica em ordem se a marca bate com a dos campos de hoje; senão o PDF está desatualizado. Gravada pela tela do curso.';

commit;

-- Conferência (só leitura): as 13 colunas existem e quantos cursos vivos já têm projeto (0 na primeira aplicação;
-- sobe conforme o RH preenche pela tela).
select (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'treinamento_curso'
          and column_name = any (array[
            'objetivo_geral', 'principios_sst', 'estrategia_pedagogica', 'infraestrutura_apoio',
            'publico_alvo', 'instrumentos_aprendizagem', 'dedicacao_diaria_min', 'prazo_conclusao_dias',
            'modulos_objetivos', 'projeto_validado_em', 'projeto_validado_por', 'proxima_revisao',
            'projeto_pdf_marca'
          ])) as colunas_do_projeto_de_13,
       count(*) filter (where objetivo_geral is not null) as cursos_com_objetivo_geral,
       count(*) filter (where projeto_validado_em is not null) as cursos_com_projeto_validado,
       count(*) filter (where prazo_conclusao_dias is not null) as cursos_com_prazo,
       count(*) as cursos
from public.treinamento_curso
where deleted_at is null;

select 'ok' as res;
