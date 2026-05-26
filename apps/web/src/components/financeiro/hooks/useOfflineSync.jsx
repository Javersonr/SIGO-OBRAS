import { useState, useEffect, useCallback } from "react";

const DB_NAME = "SigoObrasDB";
const STORE_NAME = "PreLancamentosOffline";

export const useOfflineSync = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [itemsPendentes, setItemsPendentes] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);

  // Inicializar IndexedDB
  const initDB = useCallback(async () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
    });
  }, []);

  // Salvar pré-lançamento offline
  const salvarOffline = useCallback(
    async (dados) => {
      try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const novoItem = {
          ...dados,
          offline: true,
          sincronizado: false,
          dataCriacao: new Date().toISOString(),
        };

        await new Promise((resolve, reject) => {
          const request = store.add(novoItem);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        carregarItemsPendentes();
        return novoItem;
      } catch (error) {
        console.error("Erro ao salvar offline:", error);
        throw error;
      }
    },
    [initDB]
  );

  // Carregar itens pendentes
  const carregarItemsPendentes = useCallback(async () => {
    try {
      const db = await initDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      const items = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      setItemsPendentes(items.filter((item) => !item.sincronizado));
    } catch (error) {
      console.error("Erro ao carregar itens pendentes:", error);
    }
  }, [initDB]);

  // Marcar como sincronizado
  const marcarSincronizado = useCallback(
    async (id) => {
      try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const item = getRequest.result;
          if (item) {
            item.sincronizado = true;
            store.put(item);
          }
        };

        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });

        carregarItemsPendentes();
      } catch (error) {
        console.error("Erro ao marcar sincronizado:", error);
      }
    },
    [initDB, carregarItemsPendentes]
  );

  // Deletar item offline
  const deletarOffline = useCallback(
    async (id) => {
      try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        await new Promise((resolve, reject) => {
          const request = store.delete(id);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
        });

        carregarItemsPendentes();
      } catch (error) {
        console.error("Erro ao deletar:", error);
      }
    },
    [initDB, carregarItemsPendentes]
  );

  // Detectar mudanças online/offline
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      carregarItemsPendentes();
    };

    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    carregarItemsPendentes();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [carregarItemsPendentes]);

  return {
    online,
    itemsPendentes,
    sincronizando,
    setSincronizando,
    salvarOffline,
    carregarItemsPendentes,
    marcarSincronizado,
    deletarOffline,
    initDB,
  };
};
