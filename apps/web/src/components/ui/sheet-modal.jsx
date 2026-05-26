/**
 * SheetModal - Componente padronizado para modais no padrão SIGO
 * 
 * Uso:
 * <SheetModal open={open} onOpenChange={setOpen} title="Título">
 *   Conteúdo aqui
 * </SheetModal>
 */

import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export const SHEET_MODAL_STYLES = {};

export default function SheetModal({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  side = 'right',
  className = '',
  headerClassName = '',
  contentClassName = ''
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side={side} 
        className={`h-full overflow-y-auto p-0 flex flex-col ${className}`}
      >
        {/* Header */}
        <div className={`sticky top-0 bg-white border-b p-6 z-10 flex-shrink-0 ${headerClassName}`}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </SheetHeader>
        </div>

        {/* Content */}
        <div className={`p-6 flex-1 overflow-y-auto ${contentClassName}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="sticky bottom-0 bg-white border-t p-6 flex-shrink-0">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}