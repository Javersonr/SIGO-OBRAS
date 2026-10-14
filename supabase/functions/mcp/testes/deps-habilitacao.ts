/** Dependências de teste das ferramentas de habilitação e documentos: fake do banco e Storage em memória. */
import type { Vinculo } from "../../_shared/conector/acesso.ts";
import { camadaDaEmpresa } from "../../_shared/conector/camada-empresa.ts";
import {
  criarFakeAdmin,
  type ChamadaFake,
  type RespostaFake,
} from "../../_shared/conector/testes/fake-admin.ts";
import type { DepsFerramenta } from "../registro.ts";

export const E = "00000000-0000-4000-8000-000000000001";
export const OUTRA = "00000000-0000-4000-8000-000000000002";
export const OP = "00000000-0000-4000-8000-000000000010";
export const AGORA = new Date("2026-10-13T15:00:00Z"); // 13/10/2026, 12h em Brasília
export const PDF = new TextEncoder().encode("%PDF-1.7 documento de teste");

export const VINCULO_TUDO: Vinculo = {
  perfil: "Usuario",
  ativo: true,
  permissoes: {
    Oportunidades: { Lista: { visualizar: true, editar: true }, Arquivos: { criar: true } },
  },
};

export const EMPRESA = {
  id: E,
  nome: "Empresa Teste",
  razao_social: "Empresa Teste Construções Ltda",
  nome_fantasia: null,
  cnpj: "11222333000181",
  endereco: "Rua das Obras",
  numero: "100",
  complemento: null,
  bairro: "Centro",
  cidade: "Cidade Exemplo",
  estado: "MG",
  cep: "38000000",
  telefone: null,
  email: "contato@exemplo.test",
  logo_url: null,
  representante_nome: "Fulana de Tal",
  representante_cargo: "Sócia-administradora",
  representante_cpf: "52998224725",
};

export const sc = (r: { resultado: { structuredContent?: unknown } }) =>
  r.resultado.structuredContent as Record<string, unknown>;

/**
 * `responder` decide as leituras; a RPC conector_gravar_arquivo, quando o teste não responde, devolve um
 * arquivo novo ("arq-1", "arq-2"…). `gravados` guarda os parâmetros de cada chamada da RPC (o teste que
 * responde sozinho à RPC, por exemplo com `imitarGravarArquivo(banco)`, também os vê aqui).
 */
export function montarDeps(
  responder: (c: ChamadaFake) => RespostaFake | undefined = () => undefined,
  extra: Partial<DepsFerramenta> = {}
) {
  const gravados: Record<string, unknown>[] = [];
  const fake = criarFakeAdmin((c) => {
    if (c.tabela === "conector_gravar_arquivo") gravados.push(c.payload as Record<string, unknown>);
    const r = responder(c);
    if (r !== undefined) return r;
    if (c.tabela === "conector_gravar_arquivo") {
      return {
        data: {
          ok: true,
          arquivo_id: `arq-${gravados.length}`,
          substituiu: false,
          mantido_assinado: false,
          ref_anterior: null,
        },
      };
    }
    return undefined;
  });
  let n = 0;
  const deps: DepsFerramenta = {
    ctx: {
      autorizacaoId: "00000000-0000-4000-8000-0000000000a1",
      cliente: "Claude",
      usuario: {
        id: "00000000-0000-4000-8000-0000000000b1",
        email: "u@exemplo.test",
        nome: "Usuário Teste",
      },
      empresa: { id: E, nome: "Empresa Teste", cnpj: "11222333000181", uf: "MG" },
      vinculo: VINCULO_TUDO,
      vinculoId: "00000000-0000-4000-8000-0000000000c1",
    },
    db: camadaDaEmpresa(fake.admin, E),
    storage: fake.storage,
    fetchFn: (async () => new Response(null, { status: 404 })) as typeof fetch,
    agora: AGORA,
    ...extra,
  };
  return { deps, fake, gravados, proximoId: () => `id-${++n}` };
}
