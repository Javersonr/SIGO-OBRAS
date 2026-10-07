import { describe, it, expect } from "vitest";
import {
  LIMITE_VIDEO_BYTES,
  LIMITE_PDF_BYTES,
  ACCEPT_AULA,
  validarArquivoAula,
  formatarTamanho,
  percentualEnvio,
  caminhoDoUpload,
  tipoDeArquivoDaAula,
  dadosDaTrocaDeArquivo,
  enviarComProgresso,
  subirArquivoComProgresso,
} from "./ead-upload";

const arq = (name, type, size = 1000) => ({ name, type, size });

describe("validarArquivoAula", () => {
  it("aceita MP4 e WebM numa aula de vídeo", () => {
    expect(validarArquivoAula(arq("aula.mp4", "video/mp4"), "video")).toEqual({ ok: true });
    expect(validarArquivoAula(arq("aula.webm", "video/webm"), "video")).toEqual({ ok: true });
  });

  it("aceita PDF numa aula de PDF", () => {
    expect(validarArquivoAula(arq("apostila.pdf", "application/pdf"), "pdf")).toEqual({ ok: true });
  });

  it("ignora parâmetros e maiúsculas do tipo (video/webm;codecs=vp9)", () => {
    expect(validarArquivoAula(arq("a.webm", "Video/WebM;codecs=vp9"), "video").ok).toBe(true);
  });

  it("recusa formato de vídeo fora da lista e diz quais valem", () => {
    const r = validarArquivoAula(arq("aula.mov", "video/quicktime"), "video");
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("video/quicktime");
    expect(r.erro).toMatch(/MP4/);
    expect(r.erro).toMatch(/WebM/);
  });

  it("recusa PDF em aula de vídeo e vídeo em aula de PDF", () => {
    const pdfNoVideo = validarArquivoAula(arq("x.pdf", "application/pdf"), "video");
    expect(pdfNoVideo.ok).toBe(false);
    const videoNoPdf = validarArquivoAula(arq("x.mp4", "video/mp4"), "pdf");
    expect(videoNoPdf.ok).toBe(false);
    expect(videoNoPdf.erro).toMatch(/PDF/);
  });

  it("recusa imagem, planilha e executável", () => {
    for (const [nome, tipo] of [
      ["foto.png", "image/png"],
      ["dados.xlsx", "application/vnd.ms-excel"],
      ["setup.exe", "application/x-msdownload"],
    ]) {
      expect(validarArquivoAula(arq(nome, tipo), "video").ok).toBe(false);
      expect(validarArquivoAula(arq(nome, tipo), "pdf").ok).toBe(false);
    }
  });

  it("sem tipo informado pelo navegador, vale a extensão", () => {
    expect(validarArquivoAula(arq("aula.MP4", ""), "video").ok).toBe(true);
    expect(validarArquivoAula(arq("aula.webm", ""), "video").ok).toBe(true);
    expect(validarArquivoAula(arq("apostila.pdf", ""), "pdf").ok).toBe(true);
    expect(validarArquivoAula(arq("aula.mov", ""), "video").ok).toBe(false);
    expect(validarArquivoAula(arq("semextensao", ""), "video").ok).toBe(false);
  });

  it("com tipo informado, a extensão não corrige um tipo errado", () => {
    expect(validarArquivoAula(arq("aula.mp4", "application/octet-stream"), "video").ok).toBe(false);
  });

  it("recusa arquivo vazio", () => {
    const r = validarArquivoAula(arq("aula.mp4", "video/mp4", 0), "video");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/vazio/);
  });

  it("recusa vídeo acima de 1 GB e aceita exatamente 1 GB", () => {
    expect(LIMITE_VIDEO_BYTES).toBe(1024 * 1024 * 1024);
    expect(validarArquivoAula(arq("a.mp4", "video/mp4", LIMITE_VIDEO_BYTES), "video").ok).toBe(
      true
    );
    const r = validarArquivoAula(arq("a.mp4", "video/mp4", LIMITE_VIDEO_BYTES + 1), "video");
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("1 GB");
  });

  it("recusa PDF acima de 100 MB e informa o tamanho do arquivo", () => {
    expect(LIMITE_PDF_BYTES).toBe(100 * 1024 * 1024);
    const r = validarArquivoAula(arq("a.pdf", "application/pdf", 150 * 1024 * 1024), "pdf");
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("150 MB");
    expect(r.erro).toContain("100 MB");
  });

  it("aula de texto não recebe arquivo; sem arquivo também é erro", () => {
    expect(validarArquivoAula(arq("a.pdf", "application/pdf"), "texto").ok).toBe(false);
    expect(validarArquivoAula(null, "video").ok).toBe(false);
    expect(validarArquivoAula(undefined, "pdf").ok).toBe(false);
  });
});

describe("ACCEPT_AULA", () => {
  it("o seletor de arquivo só oferece os formatos aceitos", () => {
    expect(ACCEPT_AULA.video).toBe("video/mp4,video/webm,.mp4,.webm");
    expect(ACCEPT_AULA.pdf).toBe("application/pdf,.pdf");
  });
});

describe("formatarTamanho", () => {
  it("escolhe a unidade e usa vírgula decimal", () => {
    expect(formatarTamanho(0)).toBe("0 B");
    expect(formatarTamanho(1023)).toBe("1023 B");
    expect(formatarTamanho(1536)).toBe("1,5 KB");
    expect(formatarTamanho(1024 * 1024)).toBe("1 MB");
    expect(formatarTamanho(100 * 1024 * 1024)).toBe("100 MB");
    expect(formatarTamanho(1024 ** 3)).toBe("1 GB");
    expect(formatarTamanho(1.5 * 1024 ** 3)).toBe("1,5 GB");
  });

  it("valor inválido vira 0 B", () => {
    expect(formatarTamanho(undefined)).toBe("0 B");
    expect(formatarTamanho(-5)).toBe("0 B");
    expect(formatarTamanho(Number.NaN)).toBe("0 B");
  });
});

describe("percentualEnvio", () => {
  it("arredonda e limita a 0..100", () => {
    expect(percentualEnvio(0, 200)).toBe(0);
    expect(percentualEnvio(50, 200)).toBe(25);
    expect(percentualEnvio(1, 3)).toBe(33);
    expect(percentualEnvio(300, 200)).toBe(100);
    expect(percentualEnvio(-1, 200)).toBe(0);
  });

  it("sem total conhecido devolve null", () => {
    expect(percentualEnvio(10, 0)).toBeNull();
    expect(percentualEnvio(10, undefined)).toBeNull();
    expect(percentualEnvio(10, Number.NaN)).toBeNull();
  });
});

describe("caminhoDoUpload", () => {
  it("segue o padrão do SDK: empresa/ano/mês/uuid-nome, nome só com caracteres seguros", () => {
    const caminho = caminhoDoUpload("emp-1", "Vídeo aula 1.mp4", new Date(2026, 9, 6), "uuid-1");
    expect(caminho).toBe("emp-1/2026/10/uuid-1-V_deo_aula_1.mp4");
  });

  it("o primeiro segmento é a empresa (a RLS do bucket confere)", () => {
    expect(caminhoDoUpload("emp-9", "a.pdf", new Date(2026, 0, 2), "u").split("/")[0]).toBe(
      "emp-9"
    );
    expect(caminhoDoUpload("emp-9", "a.pdf", new Date(2026, 0, 2), "u")).toContain("/2026/01/");
  });
});

describe("tipoDeArquivoDaAula", () => {
  it("vídeo hospedado e PDF guardam arquivo no Storage; YouTube e texto não", () => {
    expect(tipoDeArquivoDaAula({ tipo: "video", fonte: "upload" })).toBe("video");
    expect(tipoDeArquivoDaAula({ tipo: "pdf", fonte: "upload" })).toBe("pdf");
    expect(tipoDeArquivoDaAula({ tipo: "video", fonte: "youtube" })).toBeNull();
    expect(tipoDeArquivoDaAula({ tipo: "texto", fonte: "upload" })).toBeNull();
    expect(tipoDeArquivoDaAula(null)).toBeNull();
  });

  it("aula antiga sem `tipo` é vídeo", () => {
    expect(tipoDeArquivoDaAula({ fonte: "upload" })).toBe("video");
    expect(tipoDeArquivoDaAula({ fonte: "youtube" })).toBeNull();
  });
});

describe("dadosDaTrocaDeArquivo", () => {
  it("vídeo: nova referência e nova duração, sem mexer em título, módulo, ordem nem legenda", () => {
    expect(dadosDaTrocaDeArquivo("video", "treinamentos/emp/a.mp4", 754)).toEqual({
      fonte: "upload",
      video_ref: "treinamentos/emp/a.mp4",
      youtube_id: null,
      duracao_seg: 754,
    });
  });

  it("PDF: só a nova referência (o tempo mínimo de leitura continua o do cadastro)", () => {
    expect(dadosDaTrocaDeArquivo("pdf", "treinamentos/emp/a.pdf")).toEqual({
      arquivo_ref: "treinamentos/emp/a.pdf",
    });
  });
});

// ------------------------------------------------------------------- transporte (XHR falso)

class XhrFalso {
  constructor() {
    this.cabecalhos = {};
    this.upload = {};
    this.abortou = 0;
    this.status = 0;
    this.responseText = "";
  }
  open(metodo, url) {
    this.metodo = metodo;
    this.url = url;
  }
  setRequestHeader(nome, valor) {
    this.cabecalhos[nome] = valor;
  }
  send(corpo) {
    this.corpo = corpo;
    this.enviou = true;
  }
  abort() {
    this.abortou++;
    this.onabort?.();
  }
  // ajudantes do teste
  progresso(loaded, total, computavel = true) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: computavel });
  }
  responder(status, texto = "") {
    this.status = status;
    this.responseText = texto;
    this.onload?.();
  }
  falharRede() {
    this.onerror?.();
  }
}

const preparar = (opcoes = {}) => {
  const xhr = new XhrFalso();
  const progressos = [];
  const promessa = enviarComProgresso({
    criarXhr: () => xhr,
    url: "https://x.supabase.co/storage/v1/object/upload/sign/treinamentos/a?token=t",
    metodo: "PUT",
    cabecalhos: { apikey: "k", authorization: "Bearer t" },
    corpo: "corpo",
    aoProgredir: (p) => progressos.push(p),
    ...opcoes,
  });
  return { xhr, progressos, promessa };
};

describe("enviarComProgresso", () => {
  it("abre a requisição, manda cabeçalhos e corpo e resolve em 2xx", async () => {
    const { xhr, promessa } = preparar();
    expect(xhr.metodo).toBe("PUT");
    expect(xhr.url).toContain("/object/upload/sign/");
    expect(xhr.cabecalhos).toEqual({ apikey: "k", authorization: "Bearer t" });
    expect(xhr.corpo).toBe("corpo");
    xhr.responder(200, '{"Key":"treinamentos/a"}');
    await expect(promessa).resolves.toBeUndefined();
  });

  it("informa o progresso com bytes e percentual", async () => {
    const { xhr, progressos, promessa } = preparar();
    xhr.progresso(250, 1000);
    xhr.progresso(1000, 1000);
    xhr.responder(200);
    await promessa;
    expect(progressos).toEqual([
      { enviado: 250, total: 1000, percentual: 25 },
      { enviado: 1000, total: 1000, percentual: 100 },
    ]);
  });

  it("não informa progresso quando o navegador não sabe o total", async () => {
    const { xhr, progressos, promessa } = preparar();
    xhr.progresso(250, 0, false);
    xhr.responder(201);
    await promessa;
    expect(progressos).toEqual([]);
  });

  it("rejeita com a mensagem do servidor e o status em erro 4xx/5xx", async () => {
    const { xhr, promessa } = preparar();
    xhr.responder(413, '{"statusCode":"413","error":"Payload too large","message":"muito grande"}');
    const erro = await promessa.catch((e) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toBe("muito grande");
    expect(erro.status).toBe(413);
    expect(erro.cancelado).toBeFalsy();
  });

  it("resposta de erro sem JSON usa uma mensagem com o status", async () => {
    const { xhr, promessa } = preparar();
    xhr.responder(502, "<html>bad gateway</html>");
    const erro = await promessa.catch((e) => e);
    expect(erro.message).toContain("502");
    expect(erro.status).toBe(502);
  });

  it("rejeita quando a rede cai", async () => {
    const { xhr, promessa } = preparar();
    xhr.falharRede();
    const erro = await promessa.catch((e) => e);
    expect(erro.message).toMatch(/conexão|rede/i);
    expect(erro.cancelado).toBeFalsy();
  });

  it("cancelar pelo sinal aborta a requisição e rejeita como cancelado", async () => {
    const controle = new AbortController();
    const { xhr, promessa } = preparar({ sinal: controle.signal });
    controle.abort();
    const erro = await promessa.catch((e) => e);
    expect(xhr.abortou).toBe(1);
    expect(erro.cancelado).toBe(true);
    expect(erro.name).toBe("AbortError");
  });

  it("sinal já cancelado: nem cria a requisição", async () => {
    const controle = new AbortController();
    controle.abort();
    let criou = 0;
    const promessa = enviarComProgresso({
      criarXhr: () => {
        criou++;
        return new XhrFalso();
      },
      url: "u",
      corpo: "c",
      sinal: controle.signal,
    });
    const erro = await promessa.catch((e) => e);
    expect(criou).toBe(0);
    expect(erro.cancelado).toBe(true);
  });

  it("depois de concluir, cancelar o sinal não aborta mais nada", async () => {
    const controle = new AbortController();
    const { xhr, promessa } = preparar({ sinal: controle.signal });
    xhr.responder(200);
    await promessa;
    controle.abort();
    expect(xhr.abortou).toBe(0);
  });
});

// ---------------------------------------------------------------- orquestração do envio

const supabaseFalso = ({ empresaId = "emp-1", erroAssinar = null, token = "jwt-sessao" } = {}) => {
  const chamadas = { assinar: [] };
  return {
    chamadas,
    auth: {
      getUser: async () => ({ data: { user: { app_metadata: { empresa_id: empresaId } } } }),
      getSession: async () => ({ data: { session: { access_token: token } } }),
    },
    storage: {
      from: (bucket) => ({
        createSignedUploadUrl: async (caminho) => {
          chamadas.assinar.push({ bucket, caminho });
          if (erroAssinar) return { data: null, error: erroAssinar };
          return {
            data: {
              signedUrl: `https://x.supabase.co/up/${bucket}/${caminho}?token=t`,
              path: caminho,
            },
            error: null,
          };
        },
      }),
    },
  };
};

describe("subirArquivoComProgresso", () => {
  const arquivo = new File(["conteudo"], "Aula 1.mp4", { type: "video/mp4" });
  const base = (supabase, extra = {}) => ({
    supabase,
    chaveApi: "anon-key",
    bucket: "treinamentos",
    arquivo,
    agora: new Date(2026, 9, 6),
    uuid: () => "uuid-1",
    ...extra,
  });

  it("assina o caminho da empresa, envia pelo XHR e devolve a referência bucket/caminho", async () => {
    const supabase = supabaseFalso();
    const xhr = new XhrFalso();
    const promessa = subirArquivoComProgresso(base(supabase, { criarXhr: () => xhr }));
    // o XHR só nasce depois das chamadas assíncronas ao Supabase
    await esperar(() => xhr.enviou);
    expect(supabase.chamadas.assinar).toEqual([
      { bucket: "treinamentos", caminho: "emp-1/2026/10/uuid-1-Aula_1.mp4" },
    ]);
    expect(xhr.metodo).toBe("PUT");
    expect(xhr.url).toBe(
      "https://x.supabase.co/up/treinamentos/emp-1/2026/10/uuid-1-Aula_1.mp4?token=t"
    );
    expect(xhr.cabecalhos.apikey).toBe("anon-key");
    expect(xhr.cabecalhos.authorization).toBe("Bearer jwt-sessao");
    expect(xhr.corpo).toBeInstanceOf(FormData);
    expect(xhr.corpo.get("cacheControl")).toBe("3600");
    expect(xhr.corpo.get("")).toBeInstanceOf(Blob);
    xhr.responder(200);
    await expect(promessa).resolves.toEqual({
      bucket: "treinamentos",
      path: "emp-1/2026/10/uuid-1-Aula_1.mp4",
      ref: "treinamentos/emp-1/2026/10/uuid-1-Aula_1.mp4",
    });
  });

  it("sem chave da API não manda o cabeçalho apikey (nem o texto 'undefined')", async () => {
    const supabase = supabaseFalso();
    const xhr = new XhrFalso();
    const promessa = subirArquivoComProgresso(
      base(supabase, { chaveApi: undefined, criarXhr: () => xhr })
    );
    await esperar(() => xhr.enviou);
    expect(Object.keys(xhr.cabecalhos)).toEqual(["authorization"]);
    xhr.responder(200);
    await promessa;
  });

  it("repassa o progresso do envio", async () => {
    const supabase = supabaseFalso();
    const xhr = new XhrFalso();
    const progressos = [];
    const promessa = subirArquivoComProgresso(
      base(supabase, { criarXhr: () => xhr, aoProgredir: (p) => progressos.push(p.percentual) })
    );
    await esperar(() => xhr.enviou);
    xhr.progresso(1, 4);
    xhr.progresso(4, 4);
    xhr.responder(200);
    await promessa;
    expect(progressos).toEqual([25, 100]);
  });

  it("erro ao assinar o envio vira exceção e nada é enviado", async () => {
    const supabase = supabaseFalso({
      erroAssinar: new Error("new row violates row-level security"),
    });
    let criou = 0;
    await expect(
      subirArquivoComProgresso(base(supabase, { criarXhr: () => (criou++, new XhrFalso()) }))
    ).rejects.toThrow(/row-level security/);
    expect(criou).toBe(0);
  });

  it("sem empresa na sessão não envia", async () => {
    const supabase = supabaseFalso({ empresaId: null });
    await expect(subirArquivoComProgresso(base(supabase))).rejects.toThrow(/empresa/i);
  });

  it("sem cliente do backend não envia", async () => {
    await expect(subirArquivoComProgresso(base(null))).rejects.toThrow(/Backend/);
  });

  it("cancelado antes de começar: rejeita como cancelado sem chamar o Supabase", async () => {
    const supabase = supabaseFalso();
    const controle = new AbortController();
    controle.abort();
    const erro = await subirArquivoComProgresso(base(supabase, { sinal: controle.signal })).catch(
      (e) => e
    );
    expect(erro.cancelado).toBe(true);
    expect(supabase.chamadas.assinar).toEqual([]);
  });

  it("cancelado durante a assinatura: não chega a enviar", async () => {
    const supabase = supabaseFalso();
    const controle = new AbortController();
    const original = supabase.storage.from("treinamentos").createSignedUploadUrl;
    supabase.storage.from = (bucket) => ({
      createSignedUploadUrl: async (caminho) => {
        controle.abort();
        return original(caminho);
      },
    });
    let criou = 0;
    const erro = await subirArquivoComProgresso(
      base(supabase, { sinal: controle.signal, criarXhr: () => (criou++, new XhrFalso()) })
    ).catch((e) => e);
    expect(erro.cancelado).toBe(true);
    expect(criou).toBe(0);
  });
});

async function esperar(condicao, tentativas = 50) {
  for (let i = 0; i < tentativas; i++) {
    if (condicao()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error("condição não ocorreu a tempo");
}
