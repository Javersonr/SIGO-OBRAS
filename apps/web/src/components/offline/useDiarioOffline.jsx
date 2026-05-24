import { useState, useEffect, useCallback } from 'react';

const DB_NAME = 'SigoObrasDB';
const DB_VERSION = 2;
const STORE_DIARIO = 'DiarioOffline';
const STORE_PRELANCAMENTOS = 'PreLancamentosOffline';

// Inicializa IndexedDB com ambos os stores
const initDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_PRELANCAMENTOS)) {
      db.createObjectStore(STORE_PRELANCAMENTOS, { keyPath: 'id', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains(STORE_DIARIO)) {
      db.createObjectStore(STORE_DIARIO, { keyPath: 'id', autoIncrement: true });
    }
  };
});

const dbOp = async (storeName, mode, fn) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const useDiarioOffline = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [entradasPendentes, setEntradasPendentes] = useState([]);

  const carregarPendentes = useCallback(async () => {
    try {
      const items = await dbOp(STORE_DIARIO, 'readonly', (s) => s.getAll());
      setEntradasPendentes(items.filter(i => !i.sincronizado));
    } catch (e) {
      console.error('Erro ao carregar diário offline:', e);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); carregarPendentes(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    carregarPendentes();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [carregarPendentes]);

  const salvarOffline = useCallback(async (dados) => {
    await dbOp(STORE_DIARIO, 'readwrite', (s) => s.add({
      ...dados,
      sincronizado: false,
      dataCriacao: new Date().toISOString()
    }));
    carregarPendentes();
  }, [carregarPendentes]);

  const marcarSincronizado = useCallback(async (id) => {
    const db = await initDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIARIO, 'readwrite');
      const store = tx.objectStore(STORE_DIARIO);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) { item.sincronizado = true; store.put(item); }
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    carregarPendentes();
  }, [carregarPendentes]);

  const deletarOffline = useCallback(async (id) => {
    await dbOp(STORE_DIARIO, 'readwrite', (s) => s.delete(id));
    carregarPendentes();
  }, [carregarPendentes]);

  return { isOnline, entradasPendentes, salvarOffline, marcarSincronizado, deletarOffline, carregarPendentes };
};