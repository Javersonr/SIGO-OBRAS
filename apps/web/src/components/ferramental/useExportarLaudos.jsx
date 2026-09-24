import { normalizarTexto } from "@/lib/busca";
import { toast } from "sonner";
import { resolveStorageUrl } from "@/api/sigoClient";

export async function exportarLaudos(ferramentas, caminhoes, onProgress) {
  const ferramentasComLaudo = ferramentas.filter((f) => f.laudo_url);
  if (ferramentasComLaudo.length === 0) {
    toast.error("Nenhuma ferramenta com laudo cadastrado");
    return;
  }

  const total = ferramentasComLaudo.length;
  onProgress?.({ atual: 0, total, fase: "Iniciando..." });

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  // Laudos sem arquivo para baixar (Base44 apagado / objeto sumido do Storage)
  let indisponiveis = 0;

  for (let i = 0; i < ferramentasComLaudo.length; i++) {
    const ferr = ferramentasComLaudo[i];
    onProgress?.({ atual: i, total, fase: `Baixando: ${ferr.codigo || ferr.descricao || "..."}` });

    const tipo = ferr.tipo === "EPI" ? "EPIs" : "Ferramentas";

    let pasta;
    if (ferr.funcionario_nome) {
      pasta = `${tipo}/Funcionarios/${ferr.funcionario_nome.replace(/[/\\?%*:|"<>]/g, "-")}`;
    } else if (
      ferr.caminhao_id ||
      (ferr.localizacao && caminhoes.some((c) => c.placa === ferr.localizacao))
    ) {
      const placa =
        ferr.localizacao || caminhoes.find((c) => c.id === ferr.caminhao_id)?.placa || "Caminhao";
      pasta = `${tipo}/Caminhoes/${placa.replace(/[/\\?%*:|"<>]/g, "-")}`;
    } else if (ferr.localizacao) {
      pasta = `${tipo}/Almoxarifado/${ferr.localizacao.replace(/[/\\?%*:|"<>]/g, "-")}`;
    } else {
      pasta = `${tipo}/Almoxarifado`;
    }

    try {
      // laudo_url guarda a referência "bucket/path": gera URL assinada fresca
      const url = await resolveStorageUrl(ferr.laudo_url);
      if (!url) {
        indisponiveis++;
        continue;
      }
      const resp = await fetch(url);
      if (!resp.ok) {
        indisponiveis++;
        continue;
      }
      const blob = await resp.blob();
      const ext = normalizarTexto(ferr.laudo_url).includes(normalizarTexto(".pdf")) ? "pdf" : "jpg";
      const descricaoSanitizada = (ferr.descricao || "laudo").replace(/[/\\?%*:|"<>]/g, "-");
      const numeroSerie = ferr.numero_serie
        ? `_${ferr.numero_serie.replace(/[/\\?%*:|"<>]/g, "-")}`
        : "";
      const nome = `${descricaoSanitizada}${numeroSerie}.${ext}`;
      zip.folder(pasta).file(nome, blob);
    } catch (e) {
      console.warn("Erro ao baixar laudo:", ferr.codigo, e);
    }
  }

  if (indisponiveis === total) {
    onProgress?.(null);
    toast.error("Arquivos dos laudos indisponíveis (sistema antigo ou removidos)");
    return;
  }

  onProgress?.({ atual: total, total, fase: "Compactando..." });

  const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
    onProgress?.({ atual: total, total, fase: `Compactando... ${Math.round(metadata.percent)}%` });
  });

  const { saveAs } = await import("file-saver");
  saveAs(content, `laudos_${new Date().toISOString().split("T")[0]}.zip`);

  onProgress?.(null);
  if (indisponiveis > 0) {
    toast.warning(
      `Laudos exportados. ${indisponiveis} arquivo(s) indisponível(is) ficaram de fora (sistema antigo ou removidos).`
    );
  } else {
    toast.success("Laudos exportados com sucesso!");
  }
}
