import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';

export default function WidgetOportunidades() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Oportunidades
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-slate-500 text-sm">Widget não configurado</p>
      </CardContent>
    </Card>
  );
}