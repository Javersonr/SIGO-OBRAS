import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Send, Paperclip, X, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export default function MessageInput({ onEnviar, usuariosEmpresa }) {
  const [mensagem, setMensagem] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showMencoes, setShowMencoes] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleEnviar = async () => {
    if (!mensagem.trim() && !arquivo) return;

    let arquivoData = null;
    if (arquivo) {
      arquivoData = {
        url: arquivo.url,
        nome: arquivo.nome,
        tipo: arquivo.tipo
      };
    }

    // Extrair menções da mensagem
    const mencoes = [];
    const mencaoRegex = /@(\w+)/g;
    let match;
    while ((match = mencaoRegex.exec(mensagem)) !== null) {
      const email = match[1];
      const usuario = usuariosEmpresa.find(u => 
        u.usuario_email?.toLowerCase().startsWith(email.toLowerCase())
      );
      if (usuario) {
        mencoes.push(usuario.usuario_id || usuario.id);
      }
    }

    await onEnviar(mensagem, arquivoData, mencoes);
    setMensagem('');
    setArquivo(null);
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      const url = result.file_url || result.url || result;
      
      setArquivo({
        url,
        nome: file.name,
        tipo: file.type
      });
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload do arquivo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }

    // Detectar @ para mostrar lista de menções
    if (e.key === '@') {
      setShowMencoes(true);
      setCursorPosition(e.target.selectionStart + 1);
    }
  };

  const inserirMencao = (usuario) => {
    const antes = mensagem.substring(0, cursorPosition - 1);
    const depois = mensagem.substring(cursorPosition);
    const novaMensagem = `${antes}@${usuario.usuario_email.split('@')[0]} ${depois}`;
    setMensagem(novaMensagem);
    setShowMencoes(false);
    textareaRef.current?.focus();
  };

  const filteredUsuarios = usuariosEmpresa.filter(u => {
    const searchAfterAt = mensagem.substring(cursorPosition);
    const palavra = searchAfterAt.split(/\s/)[0];
    return u.usuario_email?.toLowerCase().includes(palavra.toLowerCase());
  });

  return (
    <div className="border-t p-4 space-y-3">
      {/* Arquivo anexado */}
      {arquivo && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
          <Badge variant="outline" className="text-blue-700">
            {arquivo.nome}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setArquivo(null)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Sugestões de menção */}
      {showMencoes && filteredUsuarios.length > 0 && (
        <div className="bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredUsuarios.slice(0, 5).map(usuario => (
            <button
              key={usuario.id}
              onClick={() => inserirMencao(usuario)}
              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2"
            >
              <AtSign className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {usuario.usuario_email}
                </p>
                <p className="text-xs text-slate-500">{usuario.nome_completo}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleUploadFile}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        <Textarea
          ref={textareaRef}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Digite sua mensagem... (@ para mencionar)"
          rows={2}
          className="flex-1 resize-none"
        />

        <Button
          onClick={handleEnviar}
          disabled={(!mensagem.trim() && !arquivo) || uploading}
          className="bg-amber-500 hover:bg-amber-600"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        Pressione Enter para enviar, Shift+Enter para nova linha
      </p>
    </div>
  );
}