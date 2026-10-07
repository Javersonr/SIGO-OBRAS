-- ============================================================================
-- portal-credencial-conferir.sql — conferência SÓ DE LEITURA antes da migração 0145 (T38)
--
-- A 0145 copia cada acesso do Portal do Funcionário para a credencial da pessoa (portal_credencial). Esta consulta
-- lista o que a cópia não decide sozinha ou o que o código novo trata diferente. Não grava nada.
--
-- Como rodar (o Javerson, ANTES da 0145):
--   supabase db query --linked -f tools/portal-credencial-conferir.sql
--
-- Cada linha do resultado é um caso; resultado vazio = pode aplicar a 0145. Colunas: caso, funcionario_id,
-- empresa_id, usuario (o usuário do acesso hoje), cpf_cadastro (só dígitos) e detalhe. O resultado tem CPF: fica no
-- console de quem roda, não vai para o repositório.
--
-- Casos:
--   1. usuario_numerico_nao_e_cpf: usuário só de dígitos (11 ou não) que NÃO é o CPF do cadastro. A cópia o grava
--      como usuário 'manual' (continua entrando, não se junta a outra empresa); o criar novo recusaria esse usuário.
--      Decidir: corrigir o CPF do cadastro e "Redefinir senha" depois do deploy (passa para a credencial do CPF).
--   2. cpf_igual_a_usuario_de_outro: o CPF do cadastro (com acesso) é o usuário de OUTRO acesso, que vira 'manual'
--      (revisão 2, m4). Depois do deploy, o criar/redefinir desse CPF responde "fale com o suporte" até resolver.
--   3. cpf_repetido: o mesmo CPF em dois ou mais cadastros com acesso (outra empresa ou readmissão). Um deles tem o
--      CPF como usuário e os outros usam usuário com letras: são credenciais diferentes até o RH redefinir.
--   4. cpf_invalido: o usuário é o CPF do cadastro, mas o CPF tem dígito verificador errado. A cópia mantém o acesso
--      (tipo 'cpf'); o criar e o redefinir novos recusam CPF inválido: corrigir o cadastro.
--   5. hash_nao_bcrypt: o hash da senha (ou da provisória) não é bcrypt. O login novo só aceita bcrypt (as 4
--      comparações de tempo igual): esse acesso deixaria de entrar e precisaria de "Redefinir senha".
--   6. usuario_com_espacos_ou_maiusculas: o usuário não está normalizado (minúsculo, sem espaço nas pontas): a cópia
--      normaliza, e dois usuários que só diferem nisso fariam a 0145 parar com erro.
-- ============================================================================

with acessos as (
  select a.funcionario_id,
         a.empresa_id,
         a.usuario,
         a.senha_hash,
         regexp_replace(coalesce(f.cpf, ''), '[^0-9]', '', 'g') as cpf_digitos
    from public.funcionario_portal_acesso a
    left join public.funcionario f on f.id = a.funcionario_id
), cpf_valido as (
  -- os dígitos verificadores, a mesma conta de apps/web/src/lib/cpf.js
  -- (CASE garante a ordem: a conta só roda com 11 dígitos)
  select x.funcionario_id,
         x.cpf_digitos,
         case
           when length(x.cpf_digitos) <> 11 then false
           when x.cpf_digitos = repeat(substr(x.cpf_digitos, 1, 1), 11) then false
           else (
             (select (sum(substr(x.cpf_digitos, i, 1)::int * (11 - i)) * 10) % 11
                from generate_series(1, 9) i) % 10 = substr(x.cpf_digitos, 10, 1)::int
             and
             (select (sum(substr(x.cpf_digitos, i, 1)::int * (12 - i)) * 10) % 11
                from generate_series(1, 10) i) % 10 = substr(x.cpf_digitos, 11, 1)::int
           )
         end as valido
    from acessos x
   where x.cpf_digitos <> ''
)
select 'usuario_numerico_nao_e_cpf' as caso, a.funcionario_id, a.empresa_id, a.usuario, a.cpf_digitos as cpf_cadastro,
       'vira usuário manual na cópia' as detalhe
  from acessos a
 where btrim(a.usuario) ~ '^[0-9]+$'
   and btrim(a.usuario) <> a.cpf_digitos

union all

select 'cpf_igual_a_usuario_de_outro', a.funcionario_id, a.empresa_id, a.usuario, a.cpf_digitos,
       'o CPF deste cadastro é o usuário do acesso do funcionário ' || o.funcionario_id
  from acessos a
  join acessos o on lower(btrim(o.usuario)) = a.cpf_digitos and o.funcionario_id <> a.funcionario_id
 where a.cpf_digitos <> ''
   and o.cpf_digitos <> lower(btrim(o.usuario))

union all

select 'cpf_repetido', a.funcionario_id, a.empresa_id, a.usuario, a.cpf_digitos,
       (count(*) over (partition by a.cpf_digitos))::text || ' cadastros com acesso têm este CPF'
  from acessos a
 where a.cpf_digitos <> ''
   and a.cpf_digitos in (
     select cpf_digitos from acessos where cpf_digitos <> '' group by cpf_digitos having count(*) > 1
   )

union all

select 'cpf_invalido', a.funcionario_id, a.empresa_id, a.usuario, a.cpf_digitos,
       'o criar e o redefinir novos recusam este CPF: corrija o cadastro'
  from acessos a
  join cpf_valido v on v.funcionario_id = a.funcionario_id
 where btrim(a.usuario) = a.cpf_digitos
   and not v.valido

union all

select 'hash_nao_bcrypt', a.funcionario_id, a.empresa_id, a.usuario, a.cpf_digitos,
       'o login novo só aceita bcrypt: precisará de Redefinir senha'
  from acessos a
 where coalesce(a.senha_hash, '') !~ '^\$2'

union all

select 'usuario_com_espacos_ou_maiusculas', a.funcionario_id, a.empresa_id, a.usuario, a.cpf_digitos,
       'a cópia normaliza para ' || lower(btrim(a.usuario))
  from acessos a
 where a.usuario <> lower(btrim(a.usuario))

order by 1, 2;
