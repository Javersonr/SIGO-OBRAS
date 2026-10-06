-- 0136 — EAD (NR-1 / NR-35): modalidade do curso (T8 do handoff do Portal de Treinamento)
--
-- Por quê: o certificado do portal sempre dizia "Ensino a distância (EAD) — NR-1, Anexo II", e o único
-- freio para curso que não pode emitir era um filtro por "NR-35" no NOME do curso (5d2655f). A NR-35
-- (item 35.4.5, Portaria MTE 1.259/2026) passou a exigir treinamento presencial em 16/07/2026: um
-- certificado EAD de NR-35 não tem valor. Agora a modalidade é uma coluna do curso, e é ela (não o nome)
-- que decide se o portal emite certificado:
--   - 'ead'            : emite (o único que emite hoje);
--   - 'semipresencial' : teoria EAD + prática presencial; NÃO emite até a etapa prática ser registrada
--                        (T12), por isso o servidor responde 409 PRATICA_PENDENTE;
--   - 'apoio'          : material de apoio ao treinamento presencial; NUNCA emite certificado
--                        (409 CURSO_DE_APOIO). Continua no portal como material de estudo.
--
-- Decisão D3 do Javerson (06/10/2026): os cursos 'NR-35 (apoio)' e 'NR-35 Reciclagem (8h)' ficam como
-- 'apoio'. Para o comportamento de hoje não mudar no instante da troca do filtro por nome pela coluna, ESTA
-- migração marca como 'apoio' os cursos cujo nome ou código contém NR-35 (o mesmo critério do filtro que
-- sai do código: "NR-35", "NR35", "NR 35", sem diferenciar maiúscula). É a única exceção desta migração à
-- regra "migração sem UPDATE de dados reais", autorizada por essa decisão.
--
-- Idempotente: a coluna é "add column if not exists", a restrição é recriada, e a marcação em 'apoio' só
-- roda na PRIMEIRA aplicação (quando a coluna ainda não existia). Reaplicar não desfaz o que o RH mudar
-- depois pela tela (por exemplo, trocar um curso de apoio para semipresencial).
--
-- O UPDATE da primeira aplicação passa pelos triggers do vínculo com o cadastro central (0131), que só
-- reafirmam o que o modelo já impõe (nome, código, carga, validade e conteúdo) e, se o modelo estiver
-- inativo, mantêm o curso despublicado. Nada mais muda além de modalidade e updated_at.
--
-- Quando a coluna JÁ existia (reaplicação, ou ela criada por outro caminho), a marcação em 'apoio' é
-- PULADA e a migração avisa com um NOTICE ("a marcação ... foi PULADA"). Nesse caso a modalidade de cada
-- curso é a que está no banco: confira-a na conferência impressa no fim deste arquivo.
--
-- Depois de aplicar: o RH confere o campo "Modalidade" na tela do curso EAD e a conferência impressa
-- no fim deste arquivo. Os cursos NR-35 marcados 'apoio' não emitem certificado, mas CONTINUAM
-- publicados e ACEITAM matrícula como material de estudo (D3, decisão do Javerson em 06/10/2026): para o
-- apoio o requisito de modalidade só bloqueia a EMISSÃO, no front e no servidor, e o aluno vê "Material de
-- apoio: não emite certificado" (sem "renovar até" e sem botão de certificado). O semipresencial segue sem
-- publicar, matricular nem emitir até a T12. Os demais requisitos do curso (carga x conteúdo medido,
-- instrutor, responsável técnico...) continuam valendo para o apoio: um curso de apoio só aceita matrícula
-- quando eles estiverem cumpridos.

begin;

do $$
declare
  ja_existia boolean;
  marcados integer;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'treinamento_curso' and column_name = 'modalidade'
  ) into ja_existia;

  alter table public.treinamento_curso
    add column if not exists modalidade text not null default 'ead';

  if not ja_existia then
    -- \m = início de palavra e \M = fim de palavra (o \b do filtro antigo); ~* ignora maiúsculas
    update public.treinamento_curso
       set modalidade = 'apoio'
     where modalidade = 'ead'
       and (coalesce(codigo, '') || ' ' || coalesce(nome, '')) ~* '\mNR[[:space:]-]*35\M';
    get diagnostics marcados = row_count;
    raise notice '0136: % curso(s) com NR-35 no nome ou no código marcado(s) como apoio (D3).', marcados;
  else
    -- sinal de "primeira aplicação" = a coluna ainda não existir; se ela já existe, nada é marcado e quem
    -- aplica precisa saber disso (a conferência abaixo mostra a modalidade de cada curso)
    raise notice '0136: a coluna modalidade JÁ existia: a marcação dos cursos NR-35 como apoio (D3) foi PULADA. Confira a modalidade de cada curso na conferência abaixo.';
  end if;
end
$$;

alter table public.treinamento_curso drop constraint if exists treinamento_curso_modalidade_check;
alter table public.treinamento_curso
  add constraint treinamento_curso_modalidade_check
  check (modalidade in ('ead', 'semipresencial', 'apoio'));

comment on column public.treinamento_curso.modalidade is
  'ead = emite certificado; semipresencial = teoria EAD + prática presencial (não emite até a T12); '
  'apoio = material de apoio ao presencial (nunca emite certificado)';

commit;

-- Conferência (só leitura): cursos vivos por modalidade e situação. A coluna que importa é "cursos_nao_ead":
-- os códigos (ou nomes) dos cursos que ficaram FORA do EAD, ou seja, os que não emitem certificado. Na
-- primeira aplicação devem ser os cursos NR-35 em 'apoio'. "com_nr35_no_nome_ou_codigo" usa o mesmo critério
-- do UPDATE: na primeira aplicação é 0 na linha 'ead' por construção; só serve de alerta numa reaplicação,
-- em que o RH pode ter marcado um NR-35 como EAD de propósito.
select modalidade,
       ativo,
       count(*) as cursos,
       string_agg(distinct coalesce(nullif(codigo, ''), nome), ', ')
         filter (where modalidade <> 'ead') as cursos_nao_ead,
       count(*) filter (
         where (coalesce(codigo, '') || ' ' || coalesce(nome, '')) ~* '\mNR[[:space:]-]*35\M'
       ) as com_nr35_no_nome_ou_codigo
from public.treinamento_curso
where deleted_at is null
group by modalidade, ativo
order by modalidade, ativo;

select 'ok' as res;
