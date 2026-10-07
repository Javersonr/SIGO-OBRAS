/**
 * validar-certificado — consulta PÚBLICA de autenticidade de certificado EAD.
 *
 * { codigo } → { situacao, valido, revogado, vencido, integro, certificado:{...} } com dados
 * mínimos: o CPF volta mascarado para a página não virar consulta de dados pessoais.
 *
 *  - integro: o hash gravado na emissão bate com `dados`, a assinatura e o código de hoje (false =
 *    o registro não confere, por alteração ou por forma de hash que não se reproduz; nunca null);
 *  - vencido: validade anterior ao dia de hoje em Brasília;
 *  - situacao: "valido" | "vencido" | "revogado" | "divergente"; `valido` só é true em "valido";
 *  - certificado.tipo_treinamento / motivo_eventual (T23): inicial, periódico ou eventual e, no eventual, o
 *    motivo; null nos certificados emitidos antes da T23.
 * As regras estão em ./regras.ts (com teste).
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import {
  avaliarCertificado,
  localDoCertificado,
  responsavelTecnicoPublico,
  resultadoDaConsulta,
  tipoDoTreinamentoPublico,
} from "./regras.ts";

function mascararCpf(cpf?: string | null) {
  const d = (cpf || "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: { codigo?: string };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const bruto = (body.codigo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (bruto.length !== 12) return fail("Código inválido — são 12 letras e números", 400);
    const codigo = `${bruto.slice(0, 4)}-${bruto.slice(4, 8)}-${bruto.slice(8)}`;

    const supabase = createAdminClient();
    const leitura = await supabase
      .from("treinamento_certificado")
      .select(
        "codigo, dados, emitido_em, revogado_em, motivo_revogacao, hash_sha256, assinatura_aluno"
      )
      .eq("codigo", codigo)
      .maybeSingle();
    // falha do banco é erro, nunca "nenhum certificado": um fiscal leria isso como certificado falso
    const consulta = resultadoDaConsulta(leitura);
    if (consulta.tipo === "erro") {
      console.error("[validar-certificado] leitura do certificado:", leitura.error);
      return fail(
        "Não foi possível consultar o certificado agora. Tente de novo em instantes.",
        500
      );
    }
    if (consulta.tipo === "nao_encontrado") return ok({ valido: false, encontrado: false });
    const cert = consulta.certificado;

    const d = cert.dados ?? {};
    const av = await avaliarCertificado(cert, new Date());
    // tipo do treinamento (T23): inicial, periódico ou eventual (com o motivo); certificado antigo não o tem
    const tipo = tipoDoTreinamentoPublico(d);
    return ok({
      encontrado: true,
      situacao: av.situacao,
      valido: av.valido,
      revogado: av.revogado,
      vencido: av.vencido,
      integro: av.integro,
      hash_versao: av.hash_versao,
      motivo_revogacao: cert.revogado_em ? cert.motivo_revogacao : null,
      certificado: {
        codigo: cert.codigo,
        aluno: d.aluno?.nome,
        cpf: mascararCpf(d.aluno?.cpf),
        curso: d.curso?.nome,
        carga_horaria_horas: d.curso?.carga_horaria_horas,
        modalidade: d.curso?.modalidade,
        tipo_treinamento: tipo?.tipo_treinamento ?? null,
        motivo_eventual: tipo?.motivo_eventual ?? null,
        local: localDoCertificado(d),
        inicio: d.periodo?.inicio,
        conclusao: d.periodo?.conclusao,
        validade: av.validade,
        empresa: d.empresa?.nome,
        cnpj: d.empresa?.cnpj,
        // só nome e registro: a referência da imagem da assinatura (T29) não sai numa consulta pública
        responsavel_tecnico: responsavelTecnicoPublico(d),
        emitido_em: cert.emitido_em,
        assinado_pelo_aluno_em: cert.assinatura_aluno?.assinado_em ?? null,
        hash_sha256: cert.hash_sha256,
      },
    });
  })
);
