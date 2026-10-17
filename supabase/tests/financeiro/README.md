# Testes SQL do financeiro (0154-0158)

Postgres em WASM (PGlite) com o recorte real das migracoes. Sem Docker, sem tocar em producao.

    cd supabase/tests/financeiro
    npm i --no-save @electric-sql/pglite
    node t0155.mjs   # idem t0154, t0156, t0157, t0158, tall
