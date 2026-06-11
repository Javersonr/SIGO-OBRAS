# Análise — Metodologia do SIGO Obras para uma empresa de engenharia

> **Data:** 2026-06-10 · **Escopo:** todo o sistema (6 frentes analisadas em paralelo:
> Comercial/Licitações, Obras/Projetos, Suprimentos, Financeiro, RH/SST, Arquitetura/Segurança).
> **Método:** leitura do código com evidência (arquivo:linha); achados não verificados foram descartados.
> Complementa (não substitui) `REVISAO-SENIOR-2026-06.md` (revisão técnica) — aqui o foco é
> **a metodologia de negócio**: o sistema modela bem a realidade de uma empreiteira de obras
> elétricas (CEMIG, licitação pública)?

---

## 1. Veredito em uma frase

O SIGO é um **ERP administrativo competente** (cadastros, compras, estoque, financeiro,
SST com alertas, automações) com **fundação técnica acima da média para o porte**
(RLS multi-tenant, RPCs atômicas com lock, 55 migrations r
