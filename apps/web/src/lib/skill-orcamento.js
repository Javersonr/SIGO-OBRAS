/**
 * Skill do Claude "orcamento-prefeitura-sigo": converte a planilha orçamentária da
 * prefeitura (PDF/Excel) para o modelo do SIGO (lib/orcamento-modelo.js).
 * O texto vive em public/skills/orcamento-prefeitura-sigo/SKILL.md (fonte única); o botão
 * "Skill do Claude" busca esse arquivo e monta o .zip no navegador.
 */

export const NOME_SKILL = "orcamento-prefeitura-sigo";
export const CAMINHO_SKILL = "/skills/orcamento-prefeitura-sigo/SKILL.md";

/**
 * O Apache do Hostgator devolve o index.html com HTTP 200 quando o arquivo não existe
 * (fallback do SPA). Só aceita o texto se for mesmo a skill.
 */
export function textoSkillValido(texto) {
  if (typeof texto !== "string") return false;
  const semBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  return semBom.startsWith("---") && semBom.includes(`name: ${NOME_SKILL}`);
}

/**
 * Zip com uma única entrada `orcamento-prefeitura-sigo/SKILL.md` (sem entrada de pasta),
 * o formato que o Claude aceita em Configurações → Capacidades → Skills.
 * `JSZip` é a classe (default de "jszip"); `tipo` vai para generateAsync ("blob" no navegador).
 */
export async function montarZipSkill(JSZip, texto, tipo = "blob") {
  const zip = new JSZip();
  zip.file(`${NOME_SKILL}/SKILL.md`, texto, { createFolders: false });
  return zip.generateAsync({ type: tipo, compression: "DEFLATE" });
}
