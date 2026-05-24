import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, WifiOff, CheckCircle2, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { getFotosOffline, marcarFotoEnviada, removerFotosEnviadas } from './DiarioCameraModal';

export default function DiarioSincOffline({ onFotosSincronizadas }) {
  const [fotosPendentes, setFotosPendentes] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    carregar();
    const onOnline = () => { setIsOnline(true); carregar(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const carregar = () => {
    const pendentes = getFotosOffline().filter(f => !f.enviada);
    setFotosPendentes(pendentes);
  };

  const sincronizar = async () => {
    if (!isOnline) { toast.error('Sem internet'); return; }
    setSincronizando(true);
    const urls = [];
    try {
      for (const foto of fotosPendentes) {
        const blob = await (await fetch(foto.dataUrl)).blob();
        const file = new File([blob], 'foto_obra.jpg', { type: 'image/jpeg' });
        const result = await base44.integrations.Core.UploadFile({ file });
        urls.push(result.file_url);
        marcarFotoEnviada(foto.id);
      }
      removerFotosEnviadas();
      toast.success(`✓ ${urls.length} foto(s) sincronizada(s)!`);
      setFotosPendentes([]);
      onFotosSincronizadas?.(urls);
    } catch (error) {
      toast.error('Erro ao sincronizar fotos');
    } finally {
      setSincronizando(false);
    }
  };

  if (fotosPendentes.length === 0) return null;

  return (
    <Card className="p-3 border-orange-200 bg-orange-50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              {fotosPendentes.length} foto(s) aguardando envio
            </p>
            <p className="text-xs text-orange-600">Tiradas sem internet</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={sincronizar}
          disabled={sincronizando || !isOnline}
          className="bg-orange-500 hover:bg-orange-600 gap-2 shrink-0"
        >
          {sincronizando ? <Loader className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {sincronizando ? 'Enviando...' : isOnline ? 'Sincronizar' : 'Offline'}
        </Button>
      </div>

      {/* Miniaturas das fotos pendentes */}
      <div className="grid grid-cols-6 gap-1 mt-2">
        {fotosPendentes.slice(0, 6).map((f, i) => (
          <img key={i} src={f.dataUrl} alt={`Offline ${i+1}`} className="w-full h-12 object-cover rounded border border-orange-300" />
        ))}
        {fotosPendentes.length > 6 && (
          <div className="w-full h-12 rounded bg-orange-200 flex items-center justify-center text-xs font-bold text-orange-700">
            +{fotosPendentes.length - 6}
          </div>
        )}
      </div>
    </Card>
  );
}