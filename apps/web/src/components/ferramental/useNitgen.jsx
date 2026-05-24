/**
 * Hook para integração com leitor biométrico Nitgen via serviço local
 * 
 * INSTALAÇÃO DO SERVIÇO LOCAL:
 * 1. Baixe o NitgenService em: https://github.com/nitgen-local (ou use o instalador fornecido)
 * 2. Execute como Administrador: NitgenService.exe
 * 3. O serviço ficará disponível em http://localhost:7777
 * 
 * O serviço expõe:
 *   GET  http://localhost:7777/status       → { ok: true, device: "NBioScan-20" }
 *   POST http://localhost:7777/capture      → { template: "base64...", image: "base64..." }
 *   POST http://localhost:7777/verify       → { match: true/false, score: 0-100 }
 */

import { useState, useCallback } from 'react';

const NITGEN_URL = 'http://localhost:7777';
const TIMEOUT_MS = 15000;

async function fetchNitgen(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${NITGEN_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Tempo esgotado. Verifique se o serviço Nitgen está rodando.');
    throw err;
  }
}

export function useNitgen() {
  const [status, setStatus] = useState('idle'); // idle | checking | ready | capturing | captured | error
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [template, setTemplate] = useState(null);
  const [image, setImage] = useState(null);
  const [error, setError] = useState(null);

  const checkDevice = useCallback(async () => {
    setStatus('checking');
    setError(null);
    try {
      const data = await fetchNitgen('/status');
      setDeviceInfo(data.device || 'Nitgen');
      setStatus('ready');
      return true;
    } catch (err) {
      setError('Serviço Nitgen não encontrado. Verifique se está instalado e rodando.');
      setStatus('error');
      return false;
    }
  }, []);

  const capture = useCallback(async () => {
    setStatus('capturing');
    setError(null);
    setTemplate(null);
    setImage(null);
    try {
      const data = await fetchNitgen('/capture', { method: 'POST', body: JSON.stringify({}) });
      setTemplate(data.template);
      setImage(data.image);
      setStatus('captured');
      return { template: data.template, image: data.image };
    } catch (err) {
      setError(err.message || 'Erro ao capturar biometria');
      setStatus('error');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setTemplate(null);
    setImage(null);
    setError(null);
    setDeviceInfo(null);
  }, []);

  return { status, deviceInfo, template, image, error, checkDevice, capture, reset };
}