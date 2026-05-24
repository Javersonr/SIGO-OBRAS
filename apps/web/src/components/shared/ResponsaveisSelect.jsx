import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, X, CheckCircle2 } from 'lucide-react';

const parseIds = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
};

export default function ResponsaveisSelect({ responsaveisEmails, usuarios, onUpdate, buttonSize = 'h-7 w-7' }) {
  const [pendingEmails, setPendingEmails] = React.useState(null);
  const saveCountRef = React.useRef(0);
  // Track last "external" value to detect real changes (not just reference changes)
  const lastExternalRef = React.useRef(null);

  React.useEffect(() => {
    const parsed = parseIds(responsaveisEmails);
    const sorted = [...parsed].sort().join(',');
    // Only clear pending if the external value actually changed content AND we're not mid-save
    if (lastExternalRef.current !== null && sorted !== lastExternalRef.current && saveCountRef.current === 0) {
      setPendingEmails(null);
    }
    lastExternalRef.current = sorted;
  }, [responsaveisEmails]);

  const emails = pendingEmails !== null ? pendingEmails : parseIds(responsaveisEmails);

  const handleSelect = (usuarioEmail) => {
    const newEmails = emails.includes(usuarioEmail)
      ? emails.filter(email => email !== usuarioEmail)
      : [...emails, usuarioEmail];

    saveCountRef.current += 1;
    setPendingEmails(newEmails);

    Promise.resolve(onUpdate(newEmails)).finally(() => {
      saveCountRef.current = Math.max(0, saveCountRef.current - 1);
      if (saveCountRef.current === 0) setPendingEmails(null);
    });
  };

  const handleRemove = (e, usuarioEmail) => {
    e.stopPropagation();
    const newEmails = emails.filter(email => email !== usuarioEmail);

    saveCountRef.current += 1;
    setPendingEmails(newEmails);

    Promise.resolve(onUpdate(newEmails)).finally(() => {
      saveCountRef.current = Math.max(0, saveCountRef.current - 1);
      if (saveCountRef.current === 0) setPendingEmails(null);
    });
  };

  const avatarSize = buttonSize === 'h-10 w-10' ? 'w-10 h-10' : 'w-7 h-7';

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-2">
        {emails.slice(0, 3).map((respEmail, idx) => {
          const resp = usuarios.find(u => u.usuario_email === respEmail);
          if (!resp) return null;
          return (
            <div key={respEmail} className="relative group" style={{ zIndex: emails.length - idx }}>
              <div
                className={`${avatarSize} rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white border-2 border-white`}
                title={resp.nome_completo || resp.usuario_email}
              >
                {(resp.nome_completo || resp.usuario_email)?.substring(0, 2).toUpperCase()}
              </div>
              <button
                onClick={(e) => handleRemove(e, respEmail)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          );
        })}
        {emails.length > 3 && (
          <div className={`${avatarSize} rounded-full bg-slate-400 flex items-center justify-center text-xs font-bold text-white border-2 border-white`}>
            +{emails.length - 3}
          </div>
        )}
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`${buttonSize} rounded-full border-2 border-dashed border-slate-300 hover:border-teal-600`}
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="w-4 h-4 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {usuarios.map(u => {
            const isSelected = emails.includes(u.usuario_email);
            return (
              <DropdownMenuItem
                key={u.id}
                onClick={(e) => { e.stopPropagation(); handleSelect(u.usuario_email); }}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {(u.nome_completo || u.usuario_email)?.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="flex-1 text-xs truncate">{u.nome_completo || u.usuario_email}</span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}