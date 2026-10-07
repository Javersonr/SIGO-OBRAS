/**
 * Carregador do pdf.js, compartilhado pelo leitor de edital (lib/edital-ia.js) e pela
 * apostila do Portal do Funcionário (components/portal-funcionario/ApostilaPdf.jsx).
 * Veio de edital-ia.js sem mudar o comportamento.
 */
let pdfjsPromise = null;

/** Carrega o pdf.js só quando usa (build legacy p/ navegador sem Promise.withResolvers). */
export function carregarPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const moderno = typeof Promise.withResolvers === "function";
      const [pdfjs, worker] = moderno
        ? await Promise.all([
            import("pdfjs-dist"),
            import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
          ])
        : await Promise.all([
            import("pdfjs-dist/legacy/build/pdf.mjs"),
            import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
          ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })().catch((e) => {
      pdfjsPromise = null; // deixa tentar de novo (ex.: chunk falhou no deploy)
      throw e;
    });
  }
  return pdfjsPromise;
}
