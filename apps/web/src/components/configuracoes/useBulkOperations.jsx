import { useState } from "react";
import { toast } from "sonner";

export function useBulkOperations() {
  const [deleteProgress, setDeleteProgress] = useState({
    show: false,
    current: 0,
    total: 0,
    type: "",
  });

  const deletarTodos = async (entityService, queryFilter, tipoNome) => {
    if (
      !confirm(
        `⚠️ ATENÇÃO: Isso irá apagar TODOS os ${tipoNome} desta empresa. Esta ação não pode ser desfeita. Deseja continuar?`
      )
    )
      return;
    if (!confirm("Tem certeza absoluta? Todos os dados serão perdidos permanentemente.")) return;

    try {
      const BATCH_SIZE = 200;
      const CONCURRENT_CHUNK = 10;
      let totalSucessos = 0;
      let totalErros = 0;

      const todosRegistros = await entityService.filter(queryFilter);
      const total = todosRegistros.length;

      if (total === 0) {
        toast.info("Nenhum registro para apagar", { duration: 3000 });
        return;
      }

      setDeleteProgress({ show: true, current: 0, total, type: tipoNome });

      for (let i = 0; i < todosRegistros.length; i += BATCH_SIZE) {
        const batch = todosRegistros.slice(i, i + BATCH_SIZE);

        for (let j = 0; j < batch.length; j += CONCURRENT_CHUNK) {
          const chunk = batch.slice(j, j + CONCURRENT_CHUNK);

          const results = await Promise.allSettled(
            chunk.map((registro) => entityService.delete(registro.id))
          );

          results.forEach((result) => {
            if (result.status === "fulfilled") {
              totalSucessos++;
            } else {
              totalErros++;
            }
          });

          setDeleteProgress({
            show: true,
            current: totalSucessos + totalErros,
            total,
            type: tipoNome,
          });

          if (j + CONCURRENT_CHUNK < batch.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        if (i + BATCH_SIZE < todosRegistros.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      setDeleteProgress({ show: false, current: 0, total: 0, type: "" });

      if (totalErros === 0) {
        toast.success(`✅ ${totalSucessos} ${tipoNome} apagados`, { duration: 4000 });
      } else {
        toast.warning(`⚠️ ${totalSucessos} apagados, ${totalErros} erro(s)`, { duration: 4000 });
      }

      return { sucessos: totalSucessos, erros: totalErros };
    } catch (error) {
      setDeleteProgress({ show: false, current: 0, total: 0, type: "" });
      toast.error("❌ Erro ao apagar: " + error.message, { duration: 6000 });
      throw error;
    }
  };

  const deletarSelecionados = async (entityService, ids, tipoNome) => {
    if (ids.length === 0) return;
    if (!confirm(`Deseja apagar ${ids.length} ${tipoNome} selecionado(s)?`)) return;

    const total = ids.length;
    setDeleteProgress({ show: true, current: 0, total, type: tipoNome });

    let sucessos = 0;
    let erros = 0;
    const BATCH_SIZE = 200;
    const CONCURRENT_CHUNK = 10;

    try {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);

        for (let j = 0; j < batch.length; j += CONCURRENT_CHUNK) {
          const chunk = batch.slice(j, j + CONCURRENT_CHUNK);

          const results = await Promise.allSettled(chunk.map((id) => entityService.delete(id)));

          results.forEach((result) => {
            if (result.status === "fulfilled") {
              sucessos++;
            } else {
              erros++;
            }
          });

          setDeleteProgress({ show: true, current: sucessos + erros, total, type: tipoNome });

          if (j + CONCURRENT_CHUNK < batch.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        if (i + BATCH_SIZE < ids.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      setDeleteProgress({ show: false, current: 0, total: 0, type: "" });

      if (erros === 0) {
        toast.success(`✅ ${sucessos} ${tipoNome} apagado(s)`, { duration: 4000 });
      } else {
        toast.warning(`⚠️ ${sucessos} apagados, ${erros} erro(s)`, { duration: 4000 });
      }

      return { sucessos, erros };
    } catch (error) {
      setDeleteProgress({ show: false, current: 0, total: 0, type: "" });
      toast.error("❌ Erro ao apagar: " + error.message, { duration: 6000 });
      throw error;
    }
  };

  return { deleteProgress, deletarTodos, deletarSelecionados };
}
