/**
 * validar-certificado — consulta PÚBLICA de autenticidade de certificado EAD.
 *
 * { codigo } → { valido, revogado, certificado:{...} } com dados mínimos: o
 * CPF volta mascarado para a página não virar consulta de dados pessoais.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";

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
    const { data: cert } = await supabase
      .from("treinamento_certificado")
      .select(
        "codigo, dados, emitido_em, revogado_em, motivo_revogacao, hash_sha256, assinatura_aluno"
      )
      .eq("codigo", codigo)
      .maybeSingle();
    if (!cert) return ok({ valido: false, encontrado: false });

    const d = cert.dados ?? {};
    return ok({
      encontrado: true,
      valido: !cert.revogado_em,
      revogado: !!cert.revogado_em,
      motivo_revogacao: cert.revogado_em ? cert.motivo_revogacao : null,
      certificado: {
        codigo: cert.codigo,
        aluno: d.aluno?.nome,
        cpf: mascararCpf(d.aluno?.cpf),
        curso: d.curso?.nome,
        carga_horaria_horas: d.curso?.carga_horaria_horas,
        modalidade: d.curso?.modalidade,
        inicio: d.periodo?.inicio,
        conclusao: d.periodo?.conclusao,
        validade: d.periodo?.validade,
        empresa: d.empresa?.nome,
        cnpj: d.empresa?.cnpj,
        responsavel_tecnico: d.responsavel_tecnico,
        emitido_em: cert.emitido_em,
        assinado_pelo_aluno_em: cert.assinatura_aluno?.assinado_em ?? null,
        hash_sha256: cert.hash_sha256,
      },
    });
  })
);
