// node --test supabase/functions/_shared/conector/permissoes-ferramentas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANEXAR_OPORTUNIDADE,
  atendeExigencia,
  CRIAR_OPORTUNIDADE,
  EDITAR_OPORTUNIDADE,
  EDITAR_ORCAMENTO,
  exigenciaDaFerramenta,
  exigenciaDoAlvo,
  LER,
  NEGAR,
  NOMES_FERRAMENTAS,
  rotuloExigencia,
} from "./permissoes-ferramentas.ts";
import type { Vinculo } from "./acesso.ts";

const vinc = (permissoes: unknown, extra: Partial<Vinculo> = {}): Vinculo => ({
  perfil: "Usuario",
  is_owner: false,
  ativo: true,
  deleted_at: null,
  permissoes,
  ...extra,
});

test("NOMES_FERRAMENTAS: as 17 do §5, nesta ordem, sem repetir", () => {
  assert.equal(NOMES_FERRAMENTAS.length, 17);
  assert.equal(new Set(NOMES_FERRAMENTAS).size, 17);
  assert.equal(NOMES_FERRAMENTAS[0], "empresa_atual");
  assert.equal(NOMES_FERRAMENTAS[16], "ler_orcamento");
});

test("exigenciaDaFerramenta: o mapa do §4.5 (17 ferramentas + desconhecida)", () => {
  const esperado: Record<string, unknown> = {
    empresa_atual: [],
    gerar_link_envio: ANEXAR_OPORTUNIDADE,
    status_envio: LER,
    registrar_arquivos: [
      [
        ["Oportunidades", "Arquivos", "criar"],
        ["Oportunidades", "Lista", "editar"],
      ],
    ],
    ler_edital_anexado: LER,
    buscar_oportunidades: LER,
    obter_oportunidade: LER,
    criar_ou_atualizar_oportunidade: CRIAR_OPORTUNIDADE,
    registrar_atende: EDITAR_OPORTUNIDADE,
    adicionar_nota: EDITAR_OPORTUNIDADE,
    ler_acervo: LER,
    cadastrar_atestado: EDITAR_OPORTUNIDADE,
    importar_orcamento: EDITAR_ORCAMENTO,
    aplicar_desconto: EDITAR_ORCAMENTO,
    importar_cronograma: EDITAR_ORCAMENTO,
    registrar_proposta: EDITAR_OPORTUNIDADE,
    ler_orcamento: LER,
  };
  assert.deepEqual(Object.keys(esperado), [...NOMES_FERRAMENTAS]);
  for (const nome of NOMES_FERRAMENTAS) {
    assert.deepEqual(exigenciaDaFerramenta(nome, {}), esperado[nome], nome);
  }
  assert.deepEqual(exigenciaDaFerramenta("apagar_oportunidade", {}), NEGAR);
  assert.deepEqual(exigenciaDaFerramenta("", {}), NEGAR);
});

test("exigência que depende dos argumentos: editar com oportunidade_id, atestado no link", () => {
  assert.deepEqual(
    exigenciaDaFerramenta("criar_ou_atualizar_oportunidade", { oportunidade_id: "x" }),
    EDITAR_OPORTUNIDADE
  );
  assert.deepEqual(
    exigenciaDaFerramenta("criar_ou_atualizar_oportunidade", { oportunidade_id: "  " }),
    CRIAR_OPORTUNIDADE
  );
  assert.deepEqual(
    exigenciaDaFerramenta("gerar_link_envio", { alvo: "atestado" }),
    EDITAR_OPORTUNIDADE
  );
  assert.deepEqual(exigenciaDoAlvo("oportunidade"), ANEXAR_OPORTUNIDADE);
  assert.deepEqual(exigenciaDoAlvo("atestado"), EDITAR_OPORTUNIDADE);
});

test("atendeExigencia: E entre grupos, OU no grupo; [] passa e [[]] nega", () => {
  const leitor = vinc({ Oportunidades: { Lista: { visualizar: true } } });
  assert.equal(atendeExigencia(leitor, LER), true);
  assert.equal(atendeExigencia(leitor, EDITAR_OPORTUNIDADE), false);
  assert.equal(atendeExigencia(leitor, []), true);
  assert.equal(atendeExigencia(leitor, NEGAR), false);
  const soOrcamento = vinc({ Oportunidades: { Orçamento: { editar: true } } });
  assert.equal(atendeExigencia(soOrcamento, EDITAR_ORCAMENTO), false);
});

test("EDITAR_ORCAMENTO: Lista/editar e Orçamento/editar, com a grafia antiga Orcamento", () => {
  const comAcento = vinc({
    Oportunidades: { Lista: { editar: true }, Orçamento: { editar: true } },
  });
  const semAcento = vinc({
    Oportunidades: { Lista: { editar: true }, Orcamento: { editar: true } },
  });
  const soLista = vinc({ Oportunidades: { Lista: { editar: true } } });
  const verOrcamento = vinc({
    Oportunidades: { Lista: { editar: true }, Orçamento: { visualizar: true } },
  });
  assert.equal(atendeExigencia(comAcento, EDITAR_ORCAMENTO), true);
  assert.equal(atendeExigencia(semAcento, EDITAR_ORCAMENTO), true);
  assert.equal(atendeExigencia(soLista, EDITAR_ORCAMENTO), false);
  assert.equal(atendeExigencia(verOrcamento, EDITAR_ORCAMENTO), false);
});

test("Admin e dono passam em tudo, menos no NEGAR", () => {
  const admin = vinc({}, { perfil: "Admin" });
  const dono = vinc(null, { is_owner: true });
  for (const v of [admin, dono]) {
    for (const nome of NOMES_FERRAMENTAS) {
      assert.equal(atendeExigencia(v, exigenciaDaFerramenta(nome, {})), true, nome);
    }
    assert.equal(atendeExigencia(v, NEGAR), false);
  }
});

test("rotuloExigencia: texto exato da mensagem de negação", () => {
  assert.equal(
    rotuloExigencia(EDITAR_ORCAMENTO),
    "Oportunidades → Lista → editar e (Oportunidades → Orçamento → editar ou Oportunidades → Orcamento → editar)"
  );
  assert.equal(rotuloExigencia(LER), "Oportunidades → Lista");
  assert.equal(rotuloExigencia(ANEXAR_OPORTUNIDADE), "Oportunidades → Arquivos → criar");
  assert.equal(
    rotuloExigencia(exigenciaDaFerramenta("registrar_arquivos", {})),
    "Oportunidades → Arquivos → criar ou Oportunidades → Lista → editar"
  );
  assert.equal(rotuloExigencia([]), "nenhuma");
  assert.equal(rotuloExigencia(NEGAR), "nenhuma permissão libera esta ferramenta");
});
